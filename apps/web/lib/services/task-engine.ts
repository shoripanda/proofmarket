import "server-only";
// The only way a task's status changes (03 §5): lock the row, evaluate the transition table, apply the
// generic effects in the caller's transaction. Domain effects (createClaim, runConsensus, saveResult) are
// returned to the caller, which must perform them in the same transaction.

import {
  type ActorType,
  ApiError,
  type AuditEventType,
  type Effect,
  type TaskEvent,
  type TaskStatus,
  type TransitionContext,
  type TransitionRule,
  transition,
} from "@proofmarket/core";
import { type Db, schema } from "@proofmarket/db";
import { and, count, eq, inArray, sql } from "drizzle-orm";
import type { AppContext } from "../context";
import { appendAudit } from "./audit";

export type TaskRow = typeof schema.verificationRequests.$inferSelect;

export async function lockTask(tx: Db, verificationId: string): Promise<TaskRow> {
  const rows = await tx
    .select()
    .from(schema.verificationRequests)
    .where(eq(schema.verificationRequests.id, verificationId))
    .for("update");
  const row = rows[0];
  if (!row) throw new ApiError("VERIFICATION_NOT_FOUND");
  return row;
}

export interface TaskCounts {
  validCount: number;
  activeClaimCount: number;
  answerCounts: Record<string, number>;
}

export async function taskCounts(tx: Db, verificationId: string): Promise<TaskCounts> {
  const [active] = await tx
    .select({ n: count() })
    .from(schema.claims)
    .where(and(eq(schema.claims.verificationId, verificationId), eq(schema.claims.state, "ACTIVE")));
  const valid = await tx
    .select({ answer: schema.witnessSubmissions.answer, n: count() })
    .from(schema.witnessSubmissions)
    .where(
      and(
        eq(schema.witnessSubmissions.verificationId, verificationId),
        eq(schema.witnessSubmissions.state, "VALID"),
      ),
    )
    .groupBy(schema.witnessSubmissions.answer);
  const answerCounts = Object.fromEntries(valid.map((v) => [v.answer, Number(v.n)]));
  return {
    validCount: valid.reduce((a, v) => a + Number(v.n), 0),
    activeClaimCount: Number(active?.n ?? 0),
    answerCounts,
  };
}

async function flag(tx: Db, key: "claims_enabled"): Promise<boolean> {
  const [row] = await tx.select().from(schema.platformFlags).where(eq(schema.platformFlags.key, key));
  return row?.value ?? true;
}

export interface ApplyOptions {
  actorType: ActorType;
  actorRef: string | null;
  correlationId: string;
  chain?: TransitionContext["chain"];
  funding?: TransitionContext["funding"];
  /** Amount (base units, positive) for RELEASE / REFUND ledger effects. Required when the rule has one. */
  creditBackMicro?: bigint;
  /** 13 §3: the challenge service rejecting an overturned optimistic answer (T19). */
  challengeOverturned?: boolean;
  metadata?: Record<string, unknown>;
}

export type DomainEffect = Extract<Effect, { kind: "createClaim" | "runConsensus" | "saveResult" }>;

const AUDIT_FOR: Record<TaskEvent, AuditEventType> = {
  FUNDING_CONFIRMED: "funding_confirmed",
  OPEN: "task_opened",
  CLAIM_CREATED: "worker_claimed",
  SUBMISSION_RECEIVED: "evidence_uploaded",
  QUORUM_READY: "quorum_reached",
  DEADLINE_REACHED: "task_expired",
  CONSENSUS_REACHED: "quorum_reached",
  CONSENSUS_FAILED: "quorum_reached",
  SETTLEMENT_CONFIRMED: "settlement_confirmed",
  CANCEL_REQUESTED: "task_cancelled",
  FUNDING_FAILED: "task_cancelled",
  REFUND_CONFIRMED: "refund_confirmed",
  CHALLENGE_OVERTURNED: "quorum_reached",
};

/**
 * Evaluate and apply. Throws ApiError(errorCode) if the transition is not allowed.
 * The task row must already be locked by the caller (lockTask) in the same transaction.
 */
export async function applyTaskEvent(
  tx: Db,
  app: AppContext,
  task: TaskRow,
  event: TaskEvent,
  opts: ApplyOptions,
  errorCode: ConstructorParameters<typeof ApiError>[0] = "TASK_NOT_CLAIMABLE",
): Promise<{ rule: TransitionRule; next: TaskStatus; domainEffects: DomainEffect[] }> {
  const now = app.now();
  const counts = await taskCounts(tx, task.id);
  // Text answers are not voted on (01 §4.15): every valid one counts toward the same result.
  if (task.answerKind === "text") counts.answerCounts = counts.validCount ? { text: counts.validCount } : {};
  const ctx: TransitionContext = {
    now,
    deadline: task.deadline,
    requiredWitnesses: task.requiredWitnesses,
    quorum: task.quorum,
    ...counts,
    flags: { claimsEnabled: await flag(tx, "claims_enabled") },
    chain: opts.chain ?? {},
    funding: opts.funding ?? { txSent: false, retryLimitReached: false, allBlockhashesExpired: false },
    challengeOverturned: opts.challengeOverturned ?? false,
  };
  const result = transition(task.status as TaskStatus, event, ctx);
  if (!result.ok) throw new ApiError(errorCode, { status: task.status, event, reason: result.reason });

  const { rule, next } = result;
  const updates: Partial<typeof schema.verificationRequests.$inferInsert> = { status: next, updatedAt: now };
  const domainEffects: DomainEffect[] = [];

  for (const e of rule.effects) {
    switch (e.kind) {
      case "setFundingStatus":
        updates.fundingStatus = e.value;
        break;
      case "setSettlementStatus":
        updates.settlementStatus = e.value;
        break;
      case "setReason":
        updates.statusReason = e.value;
        break;
      case "expireActiveClaims":
        await tx
          .update(schema.claims)
          .set({ state: "EXPIRED", closedAt: now, closeReason: "TASK_CLOSED" })
          .where(and(eq(schema.claims.verificationId, task.id), eq(schema.claims.state, "ACTIVE")));
        break;
      case "enqueue":
        await enqueueJob(tx, e.job, `${e.job}:${task.id}`, { verification_id: task.id }, now);
        break;
      case "cancelJob":
        await tx
          .update(schema.outboxJobs)
          .set({ state: "DONE", lastError: "cancelled", updatedAt: now })
          .where(
            and(
              eq(schema.outboxJobs.dedupeKey, `${e.job}:${task.id}`),
              inArray(schema.outboxJobs.state, ["PENDING"]),
            ),
          );
        break;
      case "ledger": {
        const amt = opts.creditBackMicro;
        if (amt === undefined)
          throw new Error(`${rule.id}: creditBackMicro is required for ledger ${e.entry}`);
        if (amt > 0n) {
          // Money goes back to whoever reserved it: the requester, or the challenger whose bond funded a
          // recheck (13 §3). Tasks with no RESERVE row (x402) fall back to the owner.
          const [reserve] = await tx
            .select({ credentialId: schema.requesterLedger.credentialId })
            .from(schema.requesterLedger)
            .where(
              and(
                eq(schema.requesterLedger.verificationId, task.id),
                eq(schema.requesterLedger.entryType, "RESERVE"),
              ),
            );
          await tx.insert(schema.requesterLedger).values({
            credentialId: reserve?.credentialId ?? task.credentialId,
            verificationId: task.id,
            entryType: e.entry,
            amount: microToDecimal(amt),
            asset: task.bountyAsset,
          });
        }
        break;
      }
      case "webhook":
        if (task.callbackEndpointId) {
          await enqueueJob(
            tx,
            "DELIVER_WEBHOOK",
            `${e.event}:${task.id}`,
            {
              verification_id: task.id,
              endpoint_id: task.callbackEndpointId,
              event: e.event,
            },
            now,
          );
        }
        break;
      case "createClaim":
      case "runConsensus":
      case "saveResult":
        domainEffects.push(e);
        break;
    }
  }

  await tx
    .update(schema.verificationRequests)
    .set(updates)
    .where(eq(schema.verificationRequests.id, task.id));
  await appendAudit(tx, {
    verificationId: task.id,
    actorType: opts.actorType,
    actorRef: opts.actorRef,
    eventType: AUDIT_FOR[event],
    beforeState: task.status,
    afterState: next,
    correlationId: opts.correlationId,
    metadata: { rule: rule.id, ...(opts.metadata ?? {}) },
  });
  Object.assign(task, updates);
  return { rule, next, domainEffects };
}

/**
 * `now` is the app clock. run_after must not fall back to the database default: leaseNextJob compares it with the
 * app clock, so a database clock ahead of it (tests with a fixed clock) would hold every new job back.
 */
export async function enqueueJob(
  tx: Db,
  kind: (typeof schema.outboxJobs.$inferInsert)["kind"],
  dedupeKey: string,
  payload: Record<string, unknown>,
  now: Date,
): Promise<void> {
  await tx
    .insert(schema.outboxJobs)
    .values({ kind, dedupeKey, payload, state: "PENDING", runAfter: now, updatedAt: now })
    .onConflictDoNothing({ target: schema.outboxJobs.dedupeKey });
}

/** numeric(20,6) columns are strings in drizzle. */
export function microToDecimal(v: bigint): string {
  const neg = v < 0n;
  const a = neg ? -v : v;
  return `${neg ? "-" : ""}${a / 1_000_000n}.${(a % 1_000_000n).toString().padStart(6, "0")}`;
}

export const lockCredential = (tx: Db, credentialId: string) =>
  tx.execute(sql`select id from requester_credentials where id = ${credentialId} for update`);
