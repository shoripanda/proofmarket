import "server-only";
// Read models for the API (05 §2.2, §2.4, §4). Side-effect free (REQ-N-005).

import {
  type AnswerValue,
  type ApiSettlementStatus,
  type CheckStatus,
  consensusRatio,
  fromMicro,
  openSlots,
  toMicro,
} from "@proofmarket/core";
import {
  type GetVerificationResponse,
  levelOf,
  type VerificationResult,
} from "@proofmarket/core/schemas/api";
import { type Db, schema } from "@proofmarket/db";
import { and, count, eq, inArray } from "drizzle-orm";
import type { TaskRow } from "./task-engine";

const explorer = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
const hex = (b: Buffer) => `sha256:${b.toString("hex")}` as const;

/** Shape stored in payment_records.recipients for FINALIZE_AND_SETTLE (written by the settle job, PR-11). */
export interface SettleRecipients {
  task_account: string;
  paid: { witness_ref: string; worker_id: string; pubkey: string; amount: string }[];
}

const RESULT_CHECKS = [
  "geofence",
  "freshness",
  "task_nonce",
  "replay",
  "media_schema",
  "duplicate",
  "vision_consistency",
] as const;

/** Worst status across valid submissions: fail > warning > pass > not_run (05 §2.4). */
function aggregate(statuses: CheckStatus[]): CheckStatus {
  for (const s of ["fail", "warning", "pass"] as const) if (statuses.includes(s)) return s;
  return "not_run";
}

export async function buildResult(db: Db, task: TaskRow): Promise<VerificationResult | null> {
  const [res] = await db
    .select()
    .from(schema.verificationResults)
    .where(eq(schema.verificationResults.verificationId, task.id));
  if (!res) return null;

  const accepted = res.acceptedSubmissionIds;
  const checks = accepted.length
    ? await db
        .select()
        .from(schema.evidenceChecks)
        .where(inArray(schema.evidenceChecks.submissionId, accepted))
    : [];
  const byType = Object.fromEntries(
    RESULT_CHECKS.map((t) => [
      t,
      aggregate(checks.filter((c) => c.checkType === t).map((c) => c.status as CheckStatus)),
    ]),
  ) as VerificationResult["checks"];

  const rejected = await db
    .select({ reason: schema.witnessSubmissions.reasonCode, n: count() })
    .from(schema.witnessSubmissions)
    .where(
      and(
        eq(schema.witnessSubmissions.verificationId, task.id),
        eq(schema.witnessSubmissions.state, "INVALID"),
      ),
    )
    .groupBy(schema.witnessSubmissions.reasonCode);

  const payments = await db
    .select()
    .from(schema.paymentRecords)
    .where(eq(schema.paymentRecords.verificationId, task.id));
  const settle = payments.find((p) => p.kind === "FINALIZE_AND_SETTLE");
  const refund = payments.find((p) => p.kind === "REFUND");
  const money = settle ?? refund;
  let status: ApiSettlementStatus = "PENDING";
  if (money?.status === "CONFIRMED") status = settle ? "SETTLED" : "REFUNDED";
  else if (money?.status === "SUBMITTED") status = "SUBMITTED";
  else if (money?.status === "FAILED") status = "FAILED_RETRYING";
  const settleInfo = (settle?.recipients as SettleRecipients | null) ?? null;
  const answerCounts = res.answerCounts as Record<string, number>;

  return {
    verification_id: task.id,
    status: res.outcome as VerificationResult["status"],
    reason: (res.outcomeReason as VerificationResult["reason"]) ?? null,
    answer: (res.finalAnswer as AnswerValue | null) ?? null,
    witnesses: { valid: res.validWitnessCount, required: res.requiredWitnesses, quorum: res.quorum },
    answer_counts: answerCounts as VerificationResult["answer_counts"],
    consensus_ratio: consensusRatio(answerCounts),
    checks: byType,
    rejected_submissions: Object.fromEntries(
      rejected.filter((r) => r.reason).map((r) => [r.reason, Number(r.n)]),
    ),
    evidence_root: hex(res.evidenceRoot),
    result_hash: hex(res.resultHash),
    attestation:
      settle?.status === "CONFIRMED" && settle.lastSignature
        ? {
            network: "solana-devnet",
            signature: settle.lastSignature,
            task_account: settleInfo?.task_account ?? "",
            explorer_url: explorer(settle.lastSignature),
          }
        : null,
    settlement: {
      status,
      signature: money?.status === "CONFIRMED" ? (money.lastSignature ?? null) : null,
      paid: (settleInfo?.paid ?? []).map((r) => ({ witness_ref: r.witness_ref, amount: r.amount })),
    },
    verified_at: res.finalizedAt.toISOString(),
  };
}

export async function buildVerificationView(db: Db, task: TaskRow): Promise<GetVerificationResponse> {
  const [valid] = await db
    .select({ n: count() })
    .from(schema.witnessSubmissions)
    .where(
      and(
        eq(schema.witnessSubmissions.verificationId, task.id),
        eq(schema.witnessSubmissions.state, "VALID"),
      ),
    );
  const [active] = await db
    .select({ n: count() })
    .from(schema.claims)
    .where(and(eq(schema.claims.verificationId, task.id), eq(schema.claims.state, "ACTIVE")));
  const [fund] = await db
    .select()
    .from(schema.paymentRecords)
    .where(and(eq(schema.paymentRecords.verificationId, task.id), eq(schema.paymentRecords.kind, "FUND")));
  const validCount = Number(valid?.n ?? 0);
  const activeClaims = Number(active?.n ?? 0);
  const fundSig = fund?.status === "CONFIRMED" ? (fund.lastSignature ?? null) : null;

  return {
    verification_id: task.id,
    type: "PLACE_STATUS_VERIFICATION",
    status: task.status as GetVerificationResponse["status"],
    question: task.question,
    answer_schema: { type: "enum", values: task.answerValues as AnswerValue[] },
    location: { lat: task.targetLat, lng: task.targetLng, radius_m: task.radiusM },
    deadline: task.deadline.toISOString(),
    assurance: {
      required_witnesses: task.requiredWitnesses,
      quorum: task.quorum,
      level: levelOf({ required_witnesses: task.requiredWitnesses, quorum: task.quorum }),
    },
    bounty: { asset: "USDC", amount: fromMicro(toMicro(task.bountyAmount)), network: "solana-devnet" },
    witness_progress: {
      valid: validCount,
      active_claims: activeClaims,
      open_slots: openSlots({
        requiredWitnesses: task.requiredWitnesses,
        validCount,
        activeClaimCount: activeClaims,
      }),
      required: task.requiredWitnesses,
    },
    funding: {
      status: task.fundingStatus as GetVerificationResponse["funding"]["status"],
      signature: fundSig,
      explorer_url: fundSig ? explorer(fundSig) : null,
    },
    result: await buildResult(db, task),
    created_at: task.createdAt.toISOString(),
    updated_at: task.updatedAt.toISOString(),
  };
}
