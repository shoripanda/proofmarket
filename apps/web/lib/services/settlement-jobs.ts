import "server-only";
// Chain jobs (06 §4-5): FUND_TASK, FINALIZE_AND_SETTLE, REFUND_TASK. The adapter is idempotent against
// on-chain state; these jobs are idempotent against DB state. A job never claims success before the
// adapter reports a finalized confirmation.

import {
  type EnabledAsset,
  fromMicro,
  fundedPerWitnessMicro,
  newId,
  OUTBOX_RETRY,
  settledPerWitnessMicro,
  toBaseUnits,
  toMicro,
} from "@proofmarket/core";
import { type Db, schema } from "@proofmarket/db";
import type { ChainResult, OnChainOutcome } from "@proofmarket/solana";
import { and, eq, gte, lt, sql } from "drizzle-orm";
import type { AppContext } from "../context";
import { log } from "../log";
import { appendAudit } from "./audit";
import { bountyOf, earnedFeeMicro, feeMicro, fundedMicro, reservedMicro } from "./bounty";
import { sha256, witnessRef } from "./crypto";
import { applyTaskEvent, lockTask, type TaskRow } from "./task-engine";
import { handleDeadline } from "./verification-service";
import type { SettleRecipients } from "./views";

export type JobOutcome =
  | { kind: "done" }
  | { kind: "retry"; error: string; delayS?: number }
  | { kind: "dead"; error: string };

const toJob = (r: ChainResult): JobOutcome | null =>
  r.kind === "confirmed"
    ? null
    : r.kind === "retry"
      ? { kind: "retry", error: r.error }
      : { kind: "dead", error: r.error };

async function loadTask(db: Db, id: string): Promise<TaskRow | null> {
  const [t] = await db
    .select()
    .from(schema.verificationRequests)
    .where(eq(schema.verificationRequests.id, id));
  return t ?? null;
}

async function flagOn(db: Db, key: "settlement_enabled"): Promise<boolean> {
  const [f] = await db.select().from(schema.platformFlags).where(eq(schema.platformFlags.key, key));
  return f?.value ?? true;
}

/** Append a signature BEFORE sending completes, so a crash never loses track of an in-flight tx. */
const recordSignature = (app: AppContext, paymentId: string) => async (signature: string) => {
  await app.db
    .update(schema.paymentRecords)
    .set({
      status: "SUBMITTED",
      lastSignature: signature,
      signatures: sql`array_append(${schema.paymentRecords.signatures}, ${signature})`,
      attemptCount: sql`${schema.paymentRecords.attemptCount} + 1`,
    })
    .where(eq(schema.paymentRecords.id, paymentId));
};

async function paymentRecord(
  db: Db,
  task: TaskRow,
  kind: "FUND" | "FINALIZE_AND_SETTLE" | "REFUND",
  amount: bigint,
) {
  const [existing] = await db
    .select()
    .from(schema.paymentRecords)
    .where(and(eq(schema.paymentRecords.verificationId, task.id), eq(schema.paymentRecords.kind, kind)));
  if (existing) return existing;
  const [row] = await db
    .insert(schema.paymentRecords)
    .values({
      id: newId("payment"),
      verificationId: task.id,
      kind,
      asset: task.bountyAsset,
      amount: fromMicro(amount),
      network: task.bountyNetwork,
      status: "PENDING",
    })
    .returning();
  if (!row) throw new Error("payment record insert failed");
  return row;
}

/**
 * The task's asset as enabled here (16 §3). A task keeps settling after its asset is closed to new requests,
 * so this looks only for the mint; an asset that was never enabled on this server is a bug and fails loudly.
 */
function assetOf(app: AppContext, task: TaskRow): EnabledAsset {
  const a = app.config.assets.find((x) => x.symbol === task.bountyAsset);
  if (!a) throw new Error(`asset ${task.bountyAsset} is not enabled on this server (ASSETS_ENABLED)`);
  return a;
}

// ---------- FUND_TASK ----------

export async function runFundTask(
  app: AppContext,
  verificationId: string,
  attempts: number,
): Promise<JobOutcome> {
  const task = await loadTask(app.db, verificationId);
  if (task?.status !== "CREATED") return { kind: "done" }; // already funded or cancelled (T14)
  // Every asset but Config.bounty_mint needs its AllowedMint on chain (15 §3.1, 16 §5).
  const asset = assetOf(app, task);
  const pay = await paymentRecord(app.db, task, "FUND", fundedMicro(task));
  const adapter = app.settlement();
  const r = await adapter.fundTask(
    {
      verificationId,
      taskIdHash: task.taskIdHash,
      requesterRefHash: sha256(task.credentialId), // 06 §2.2: SHA-256(credential_id)
      // the ceiling for a rising bounty (13 §1), in the asset's base units (SOL: lamports, 15 §3.2)
      amountPerWitness: toBaseUnits(fundedPerWitnessMicro(bountyOf(task)), asset.symbol),
      asset,
      requiredWitnesses: task.requiredWitnesses,
      quorum: task.quorum,
      deadline: task.deadline,
    },
    recordSignature(app, pay.id),
  );
  const now = app.now();

  if (r.kind === "confirmed") {
    await app.db.transaction(async (tx) => {
      const t = await lockTask(tx, verificationId);
      await tx
        .update(schema.paymentRecords)
        .set({
          status: "CONFIRMED",
          confirmedAt: now,
          ...(r.signature ? { lastSignature: r.signature } : {}),
        })
        .where(eq(schema.paymentRecords.id, pay.id));
      if (t.status !== "CREATED") return;
      const opts = {
        actorType: "system" as const,
        actorRef: null,
        correlationId: t.id,
        chain: { fundingFinalized: true },
      };
      await applyTaskEvent(tx, app, t, "FUNDING_CONFIRMED", opts);
      if (now < t.deadline) await applyTaskEvent(tx, app, t, "OPEN", opts);
      else await handleDeadline(tx, app, t); // T12: funded too late -> refund
    });
    return { kind: "done" };
  }

  // Not confirmed. Give up only if the PDA is absent and nothing in flight can still land (T16).
  const giveUp = attempts >= OUTBOX_RETRY.maxAttempts || now >= task.deadline;
  if (r.kind === "retry" && giveUp) {
    const onChain = await adapter.readTask(task.taskIdHash);
    await app.db.transaction(async (tx) => {
      const t = await lockTask(tx, verificationId);
      if (t.status !== "CREATED") return;
      if (onChain) {
        const opts = {
          actorType: "system" as const,
          actorRef: null,
          correlationId: t.id,
          chain: { fundingFinalized: true },
        };
        await applyTaskEvent(tx, app, t, "FUNDING_CONFIRMED", opts);
        if (now < t.deadline) await applyTaskEvent(tx, app, t, "OPEN", opts);
        else await handleDeadline(tx, app, t);
        return;
      }
      await applyTaskEvent(tx, app, t, "FUNDING_FAILED", {
        actorType: "system",
        actorRef: null,
        correlationId: t.id,
        chain: { taskPdaExists: false },
        funding: {
          txSent: true,
          retryLimitReached: attempts >= OUTBOX_RETRY.maxAttempts,
          allBlockhashesExpired: true,
        },
        creditBackMicro: reservedMicro(t) + feeMicro(t),
      });
      await tx
        .update(schema.paymentRecords)
        .set({ status: "FAILED", lastError: r.error })
        .where(eq(schema.paymentRecords.id, pay.id));
    });
    return { kind: "done" };
  }
  await app.db
    .update(schema.paymentRecords)
    .set({ status: "FAILED", lastError: r.error })
    .where(eq(schema.paymentRecords.id, pay.id));
  return toJob(r) ?? { kind: "done" };
}

// ---------- FINALIZE_AND_SETTLE ----------

const OUTCOME: Record<string, OnChainOutcome> = {
  VERIFIED: "Verified",
  REJECTED: "NoConsensus",
  EXPIRED: "InsufficientWitnesses",
};

export async function runFinalizeAndSettle(app: AppContext, verificationId: string): Promise<JobOutcome> {
  if (!(await flagOn(app.db, "settlement_enabled")))
    return { kind: "retry", error: "settlement_disabled", delayS: 60 };
  const task = await loadTask(app.db, verificationId);
  if (
    !task ||
    !["VERIFIED", "REJECTED", "EXPIRED"].includes(task.status) ||
    task.settlementStatus === "CONFIRMED"
  ) {
    return { kind: "done" };
  }
  const [result] = await app.db
    .select()
    .from(schema.verificationResults)
    .where(eq(schema.verificationResults.verificationId, verificationId));
  if (!result) return { kind: "dead", error: "result missing" };
  const valid = await app.db
    .select({ workerId: schema.witnessSubmissions.workerId, pubkey: schema.workers.payoutPubkey })
    .from(schema.witnessSubmissions)
    .innerJoin(schema.workers, eq(schema.workers.id, schema.witnessSubmissions.workerId))
    .where(
      and(
        eq(schema.witnessSubmissions.verificationId, verificationId),
        eq(schema.witnessSubmissions.state, "VALID"),
      ),
    );
  if (valid.length === 0) return { kind: "dead", error: "no valid submissions; expected REFUND_TASK" };

  // 13 §1: the amount fixed at the first claim; finalize lowers the escrowed ceiling to it on chain.
  const per = settledPerWitnessMicro(bountyOf(task));
  const paid = per * BigInt(valid.length);
  const pay = await paymentRecord(app.db, task, "FINALIZE_AND_SETTLE", paid);
  const r = await app.settlement().finalizeAndSettle(
    {
      verificationId,
      taskIdHash: task.taskIdHash,
      outcome: result.outcome as "VERIFIED" | "REJECTED" | "EXPIRED",
      evidenceRoot: result.evidenceRoot,
      resultHash: result.resultHash,
      recipients: valid.map((v) => v.pubkey),
      ...(task.bountyMaxAmount !== null ? { amountPerWitness: toBaseUnits(per, task.bountyAsset) } : {}),
    },
    recordSignature(app, pay.id),
  );
  if (r.kind !== "confirmed") {
    await app.db
      .update(schema.paymentRecords)
      .set({ status: "FAILED", lastError: r.error })
      .where(eq(schema.paymentRecords.id, pay.id));
    if (r.kind === "halt") log("error", "settle halted", { verification_id: verificationId, error: r.error });
    return toJob(r) ?? { kind: "done" };
  }
  const recipients: SettleRecipients = {
    task_account: r.taskAccount,
    paid: valid.map((v) => ({
      witness_ref: witnessRef(app.config.workerRefSalt, v.workerId, verificationId),
      worker_id: v.workerId,
      pubkey: v.pubkey,
      amount: fromMicro(per),
    })),
  };
  await app.db.transaction(async (tx) => {
    const t = await lockTask(tx, verificationId);
    await tx
      .update(schema.paymentRecords)
      .set({
        status: "CONFIRMED",
        confirmedAt: app.now(),
        recipients,
        ...(r.signature ? { lastSignature: r.signature } : {}),
      })
      .where(eq(schema.paymentRecords.id, pay.id));
    if (t.settlementStatus === "CONFIRMED") return;
    // 13 §6.1: the fee is kept for the paid witnesses only; the rest of it goes back with the unpaid bounty.
    const earned = earnedFeeMicro(t, paid);
    await tx
      .update(schema.verificationRequests)
      .set({ platformFeeEarned: fromMicro(earned) })
      .where(eq(schema.verificationRequests.id, t.id));
    await applyTaskEvent(tx, app, t, "SETTLEMENT_CONFIRMED", {
      actorType: "system",
      actorRef: null,
      correlationId: t.id,
      chain: { settleFinalized: true },
      creditBackMicro: reservedMicro(t) - paid + feeMicro(t) - earned,
      metadata: { onchain_outcome: OUTCOME[result.outcome] },
    });
  });
  return { kind: "done" };
}

// ---------- REFUND_TASK ----------

export async function runRefund(app: AppContext, verificationId: string): Promise<JobOutcome> {
  if (!(await flagOn(app.db, "settlement_enabled")))
    return { kind: "retry", error: "settlement_disabled", delayS: 60 };
  const task = await loadTask(app.db, verificationId);
  if (!task || !["CANCELLED", "EXPIRED"].includes(task.status) || task.settlementStatus === "CONFIRMED")
    return { kind: "done" };
  const pay = await paymentRecord(app.db, task, "REFUND", fundedMicro(task));
  const r = await app.settlement().refund(
    {
      verificationId,
      taskIdHash: task.taskIdHash,
      reason: task.status === "CANCELLED" ? "Cancelled" : "Expired",
    },
    recordSignature(app, pay.id),
  );
  if (r.kind !== "confirmed") {
    await app.db
      .update(schema.paymentRecords)
      .set({ status: "FAILED", lastError: r.error })
      .where(eq(schema.paymentRecords.id, pay.id));
    if (r.kind === "halt") log("error", "refund halted", { verification_id: verificationId, error: r.error });
    return toJob(r) ?? { kind: "done" };
  }
  await app.db.transaction(async (tx) => {
    const t = await lockTask(tx, verificationId);
    await tx
      .update(schema.paymentRecords)
      .set({
        status: "CONFIRMED",
        confirmedAt: app.now(),
        ...(r.signature ? { lastSignature: r.signature } : {}),
      })
      .where(eq(schema.paymentRecords.id, pay.id));
    if (t.status === "REFUNDED") return;
    await applyTaskEvent(tx, app, t, "REFUND_CONFIRMED", {
      actorType: "system",
      actorRef: null,
      correlationId: t.id,
      chain: { refundFinalized: true },
      creditBackMicro: reservedMicro(t) + feeMicro(t),
    });
  });
  return { kind: "done" };
}

// ---------- daily reconciliation (docs/architecture 06 §4.2) ----------

export type ReconcileReport = { checked: number; mismatched: string[]; unreadable: string[] };

/**
 * Every settlement confirmed in the last day is read back from its Task account: the amount the program paid
 * and the recipients must be what payment_records says. A difference is logged and written to audit_events as
 * `reconciliation_mismatch` (nothing is corrected automatically; the operator looks). One RPC read per task.
 */
export async function reconcileSettlements(app: AppContext, now = app.now()): Promise<ReconcileReport> {
  const since = new Date(now.getTime() - 25 * 3600_000);
  const rows = await app.db
    .select({ pay: schema.paymentRecords, task: schema.verificationRequests })
    .from(schema.paymentRecords)
    .innerJoin(
      schema.verificationRequests,
      eq(schema.verificationRequests.id, schema.paymentRecords.verificationId),
    )
    .where(
      and(
        eq(schema.paymentRecords.kind, "FINALIZE_AND_SETTLE"),
        eq(schema.paymentRecords.status, "CONFIRMED"),
        gte(schema.paymentRecords.confirmedAt, since),
        lt(schema.paymentRecords.confirmedAt, now),
      ),
    );
  const report: ReconcileReport = { checked: 0, mismatched: [], unreadable: [] };
  for (const { pay, task } of rows) {
    const onChain = await app
      .settlement()
      .readTask(task.taskIdHash)
      .catch(() => null);
    if (!onChain) {
      report.unreadable.push(task.id);
      continue;
    }
    report.checked++;
    const paid = (pay.recipients as SettleRecipients | null)?.paid ?? [];
    const expectedTotal = paid.reduce((sum, p) => sum + toBaseUnits(toMicro(p.amount), task.bountyAsset), 0n);
    const expectedRecipients = [...paid.map((p) => p.pubkey)].sort();
    const actualRecipients = [...onChain.recipients].sort();
    const same =
      onChain.status === "Settled" &&
      onChain.paidTotal === expectedTotal &&
      expectedRecipients.join() === actualRecipients.join();
    if (same) continue;
    report.mismatched.push(task.id);
    const detail = {
      task_account: onChain.address,
      onchain: {
        status: onChain.status,
        paid_total: onChain.paidTotal.toString(),
        recipients: actualRecipients,
      },
      db: {
        paid_total: expectedTotal.toString(),
        recipients: expectedRecipients,
        signature: pay.lastSignature,
      },
    };
    log("error", "reconciliation_mismatch", { verification_id: task.id, ...detail });
    await appendAudit(app.db, {
      verificationId: task.id,
      actorType: "system",
      actorRef: null,
      eventType: "reconciliation_mismatch",
      beforeState: task.status,
      afterState: task.status,
      correlationId: task.id,
      metadata: detail,
    });
  }
  return report;
}
