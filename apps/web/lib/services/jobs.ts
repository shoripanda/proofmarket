import "server-only";
// Outbox runner and periodic tick (02 §4.1, 04 §3.17). Jobs are leased with a short committed UPDATE so no DB
// transaction stays open while waiting for chain confirmation; expired leases are reclaimed.

import { LIMITS, OUTBOX_RETRY, type OutboxJobKind, type WebhookEvent } from "@proofmarket/core";
import { type Db, schema } from "@proofmarket/db";
import { and, eq, inArray, isNull, lte, sql } from "drizzle-orm";
import type { AppContext } from "../context";
import { log } from "../log";
import { runOptimistic } from "./challenge-service";
import { releaseStaleReviews } from "./evidence-service";
import { runNotifyWorkers } from "./push-service";
import { purgeExpiredEvidence } from "./retention";
import { runDueSchedules } from "./schedule-service";
import { type JobOutcome, runFinalizeAndSettle, runFundTask, runRefund } from "./settlement-jobs";
import { lockTask } from "./task-engine";
import { handleDeadline } from "./verification-service";
import { type DeliverDeps, deliverWebhook } from "./webhook-service";

export interface LeasedJob {
  id: number;
  kind: OutboxJobKind;
  payload: Record<string, unknown>;
  attempts: number;
}

/** Lease one runnable job: PENDING and due, or RUNNING with an expired lease. */
export async function leaseNextJob(
  app: AppContext,
  runnerId: string,
  onlyDedupeKey?: string,
): Promise<LeasedJob | null> {
  const now = app.now().toISOString();
  const lease = new Date(app.now().getTime() + OUTBOX_RETRY.leaseS * 1000).toISOString();
  const filter = onlyDedupeKey ? sql`and dedupe_key = ${onlyDedupeKey}` : sql``;
  const res = await app.db.execute(sql`
    update outbox_jobs
       set state = 'RUNNING', locked_until = ${lease}, locked_by = ${runnerId},
           attempts = attempts + 1, updated_at = ${now}
     where id = (select id from outbox_jobs
                  where ((state = 'PENDING' and run_after <= ${now})
                     or (state = 'RUNNING' and locked_until < ${now})) ${filter}
                  order by run_after
                  for update skip locked
                  limit 1)
    returning id, kind, payload, attempts`);
  const rows = ((res as unknown as { rows?: unknown[] }).rows ??
    (res as unknown as unknown[])) as LeasedJob[];
  const row = rows[0];
  return row ? { ...row, id: Number(row.id), attempts: Number(row.attempts) } : null;
}

let webhookDeps: DeliverDeps = {};
/** Test hook: inject fetch / DNS for webhook delivery. */
export function __setWebhookDeps(d: DeliverDeps): void {
  webhookDeps = d;
}

type Handler = (app: AppContext, payload: Record<string, unknown>, attempts: number) => Promise<JobOutcome>;

const HANDLERS: Record<OutboxJobKind, Handler> = {
  FUND_TASK: (app, p, attempts) => runFundTask(app, String(p.verification_id), attempts),
  FINALIZE_AND_SETTLE: (app, p) => runFinalizeAndSettle(app, String(p.verification_id)),
  REFUND_TASK: (app, p) => runRefund(app, String(p.verification_id)),
  DELIVER_WEBHOOK: (app, p) =>
    deliverWebhook(
      app,
      p as { verification_id: string; endpoint_id: string; event: WebhookEvent },
      webhookDeps,
    ),
  PURGE_EVIDENCE: async (app) => {
    await purgeExpiredEvidence(app);
    return { kind: "done" };
  },
  NOTIFY_WORKERS: async (app, p) => {
    await runNotifyWorkers(app, String(p.verification_id));
    return { kind: "done" };
  },
};

export function backoffS(attempts: number): number {
  return Math.min(OUTBOX_RETRY.maxDelayS, OUTBOX_RETRY.firstDelayS * 2 ** Math.max(0, attempts - 1));
}

/** Run one leased job and release it. Only the lease holder may write the outcome. */
export async function runLeased(app: AppContext, job: LeasedJob, runnerId: string): Promise<JobOutcome> {
  let outcome: JobOutcome;
  try {
    outcome = await HANDLERS[job.kind](app, job.payload, job.attempts);
  } catch (e) {
    outcome = { kind: "retry", error: String(e).slice(0, 500) };
  }
  if (outcome.kind === "retry" && job.attempts >= OUTBOX_RETRY.maxAttempts)
    outcome = { kind: "dead", error: outcome.error };
  const now = app.now();
  const set =
    outcome.kind === "done"
      ? { state: "DONE", lastError: null }
      : outcome.kind === "dead"
        ? { state: "DEAD", lastError: outcome.error }
        : {
            state: "PENDING",
            lastError: outcome.error,
            runAfter: new Date(now.getTime() + (outcome.delayS ?? backoffS(job.attempts)) * 1000),
          };
  await app.db
    .update(schema.outboxJobs)
    .set({ ...set, lockedUntil: null, lockedBy: null, updatedAt: now })
    .where(and(eq(schema.outboxJobs.id, job.id), eq(schema.outboxJobs.lockedBy, runnerId)));
  if (outcome.kind === "dead")
    log("error", "outbox job dead", { job_id: job.id, kind: job.kind, error: outcome.error });
  return outcome;
}

/** Try one specific job right after the response (Next.js after()). Failures are left for the tick. */
export async function kick(app: AppContext, dedupeKey: string): Promise<void> {
  const runner = `kick:${crypto.randomUUID()}`;
  const job = await leaseNextJob(app, runner, dedupeKey);
  if (job) await runLeased(app, job, runner);
}

const DEADLINE_STATUSES = ["FUNDED", "OPEN", "CLAIMED", "SUBMITTED"];
/** How long a deadline waits for a pending outside review (01 §4.17). */
const REVIEW_GRACE_MS = 30 * 60_000;

/** Time (ms) since the oldest submission of the task started waiting for review; -Infinity if none waits. */
async function pendingReviewSince(db: Db, verificationId: string): Promise<number> {
  const [row] = await db
    .select({ at: sql<Date | null>`min(${schema.witnessSubmissions.serverReceivedAt})` })
    .from(schema.witnessSubmissions)
    .where(
      and(
        eq(schema.witnessSubmissions.verificationId, verificationId),
        eq(schema.witnessSubmissions.state, "CHECKING"),
      ),
    );
  return row?.at ? new Date(row.at).getTime() : Number.NEGATIVE_INFINITY;
}

/** /api/internal/tick: expire what is due, then drain up to maxJobs jobs. */
/**
 * One step of the tick. A step that throws is logged and skipped, so a broken query in one step never stops the
 * deadlines, the claim expiry or the job drain (settlement!) that come after it. The names come back in `failed`.
 */
async function step(failed: string[], name: string, fn: () => Promise<unknown>): Promise<void> {
  try {
    await fn();
  } catch (e) {
    failed.push(name);
    log("error", "tick_step_failed", { step: name, error: String(e) });
  }
}

export async function tick(
  app: AppContext,
  maxJobs = 20,
): Promise<{ deadlines: number; jobsRun: number; failed: string[] }> {
  const now = app.now();
  const failed: string[] = [];
  // 0. Submissions the outside reviewer never answered pass with a warning (01 §4.17), so they still count below.
  await step(failed, "stale_reviews", () => releaseStaleReviews(app));
  // 1. Optimistic answers (13 §3): close windows that passed, settle challenges whose recheck is final.
  await step(failed, "optimistic", () => runOptimistic(app));
  // 2. Task deadlines (T08 / T11 / T12), one transaction per task. A provisional answer waits for its
  // challenge window instead (runOptimistic finalizes it).
  const deadlines = await runDeadlines(app, now, failed);
  // 3. Claims past their TTL, challenges past expiry, uploads never finalized.
  await step(failed, "expiry", () => runExpiry(app, now));
  // 4. Daily purge job (dedupe per JST-agnostic UTC day).
  await step(failed, "purge_job", () =>
    app.db
      .insert(schema.outboxJobs)
      .values({
        kind: "PURGE_EVIDENCE",
        dedupeKey: `PURGE_EVIDENCE:${now.toISOString().slice(0, 10)}`,
        payload: {},
        state: "PENDING",
      })
      .onConflictDoNothing({ target: schema.outboxJobs.dedupeKey }),
  );
  // 5. Recurring checks that are due create normal tasks (04 §3.23); their FUND_TASK jobs drain below.
  await step(failed, "schedules", () => runDueSchedules(app));
  // 6. Drain jobs.
  const runner = `tick:${crypto.randomUUID()}`;
  let jobsRun = 0;
  for (; jobsRun < maxJobs; jobsRun++) {
    const job = await leaseNextJob(app, runner);
    if (!job) break;
    await runLeased(app, job, runner);
  }
  return { deadlines, jobsRun, failed };
}

async function runDeadlines(app: AppContext, now: Date, failed: string[]): Promise<number> {
  let deadlines = 0;
  const due = await app.db
    .select({ id: schema.verificationRequests.id })
    .from(schema.verificationRequests)
    .where(
      and(
        inArray(schema.verificationRequests.status, DEADLINE_STATUSES),
        lte(schema.verificationRequests.deadline, now),
        isNull(schema.verificationRequests.provisionalAt),
      ),
    );
  for (const { id } of due) {
    // One task at a time: a task that cannot be expired must not hold the others (or the jobs) back.
    await step(failed, `deadline:${id}`, async () => {
      // 01 §4.17: a submission waiting for the outside AI review holds the deadline for up to REVIEW_GRACE_MS.
      if (now.getTime() - (await pendingReviewSince(app.db, id)) < REVIEW_GRACE_MS) return;
      await app.db.transaction(async (tx) => {
        const t = await lockTask(tx, id);
        if (DEADLINE_STATUSES.includes(t.status) && t.deadline <= now && !t.provisionalAt)
          await handleDeadline(tx, app, t);
      });
      deadlines++;
    });
  }
  return deadlines;
}

/** Claims past their TTL, challenges past expiry, uploads never finalized (03 §3.4). */
async function runExpiry(app: AppContext, now: Date): Promise<void> {
  await app.db
    .update(schema.claims)
    .set({ state: "EXPIRED", closedAt: now, closeReason: "CLAIM_TTL" })
    .where(
      and(
        eq(schema.claims.state, "ACTIVE"),
        lte(schema.claims.expiresAt, now),
        // a claim whose submission is waiting for review is decided by the review, not by its TTL
        sql`not exists (select 1 from witness_submissions ws where ws.claim_id = ${schema.claims.id} and ws.state = 'CHECKING')`,
      ),
    );
  await app.db
    .update(schema.challenges)
    .set({ state: "EXPIRED" })
    .where(and(eq(schema.challenges.state, "ISSUED"), lte(schema.challenges.expiresAt, now)));
  const stale = await app.db
    .update(schema.uploads)
    .set({ state: "DISCARDED" })
    .where(
      and(
        eq(schema.uploads.state, "PENDING"),
        lte(schema.uploads.issuedAt, new Date(now.getTime() - LIMITS.uploadDiscardAfterS * 1000)),
      ),
    )
    .returning({ key: schema.uploads.objectKey });
  await app.storage.remove(
    "evidence-raw",
    stale.map((u) => u.key),
  ); // 03 §3.4: DISCARDED also deletes the object
}
