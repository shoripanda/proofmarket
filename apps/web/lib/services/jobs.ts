import "server-only";
// Outbox runner and periodic tick (02 §4.1, 04 §3.17). Jobs are leased with a short committed UPDATE so no DB
// transaction stays open while waiting for chain confirmation; expired leases are reclaimed.

import { LIMITS, OUTBOX_RETRY, type OutboxJobKind } from "@proofmarket/core";
import { schema } from "@proofmarket/db";
import { and, eq, inArray, lte, sql } from "drizzle-orm";
import type { AppContext } from "../context";
import { log } from "../log";
import { purgeExpiredEvidence } from "./retention";
import { type JobOutcome, runFinalizeAndSettle, runFundTask, runRefund } from "./settlement-jobs";
import { lockTask } from "./task-engine";
import { handleDeadline } from "./verification-service";

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

type Handler = (app: AppContext, payload: Record<string, unknown>, attempts: number) => Promise<JobOutcome>;

const HANDLERS: Record<OutboxJobKind, Handler> = {
  FUND_TASK: (app, p, attempts) => runFundTask(app, String(p.verification_id), attempts),
  FINALIZE_AND_SETTLE: (app, p) => runFinalizeAndSettle(app, String(p.verification_id)),
  REFUND_TASK: (app, p) => runRefund(app, String(p.verification_id)),
  // PR-14 (webhooks). Until then deliveries are acknowledged without sending.
  DELIVER_WEBHOOK: async () => ({ kind: "done" }),
  PURGE_EVIDENCE: async (app) => {
    await purgeExpiredEvidence(app);
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

/** /api/internal/tick: expire what is due, then drain up to maxJobs jobs. */
export async function tick(app: AppContext, maxJobs = 20): Promise<{ deadlines: number; jobsRun: number }> {
  const now = app.now();
  // 1. Task deadlines (T08 / T11 / T12), one transaction per task.
  const due = await app.db
    .select({ id: schema.verificationRequests.id })
    .from(schema.verificationRequests)
    .where(
      and(
        inArray(schema.verificationRequests.status, DEADLINE_STATUSES),
        lte(schema.verificationRequests.deadline, now),
      ),
    );
  for (const { id } of due) {
    await app.db.transaction(async (tx) => {
      const t = await lockTask(tx, id);
      if (DEADLINE_STATUSES.includes(t.status) && t.deadline <= now) await handleDeadline(tx, app, t);
    });
  }
  // 2. Claims past their TTL, challenges past expiry, uploads never finalized.
  await app.db
    .update(schema.claims)
    .set({ state: "EXPIRED", closedAt: now, closeReason: "CLAIM_TTL" })
    .where(and(eq(schema.claims.state, "ACTIVE"), lte(schema.claims.expiresAt, now)));
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
  // 3. Daily purge job (dedupe per JST-agnostic UTC day).
  const day = now.toISOString().slice(0, 10);
  await app.db
    .insert(schema.outboxJobs)
    .values({ kind: "PURGE_EVIDENCE", dedupeKey: `PURGE_EVIDENCE:${day}`, payload: {}, state: "PENDING" })
    .onConflictDoNothing({ target: schema.outboxJobs.dedupeKey });
  // 4. Drain jobs.
  const runner = `tick:${crypto.randomUUID()}`;
  let jobsRun = 0;
  for (; jobsRun < maxJobs; jobsRun++) {
    const job = await leaseNextJob(app, runner);
    if (!job) break;
    await runLeased(app, job, runner);
  }
  return { deadlines: due.length, jobsRun };
}
