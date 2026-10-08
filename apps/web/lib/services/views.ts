import "server-only";
import { createHash } from "node:crypto";
// Read models for the API (05 §2.2, §2.4, §4). Side-effect free (REQ-N-005).

import {
  type ApiSettlementStatus,
  answerSchemaOf,
  type CheckStatus,
  consensusRatio,
  currentBounty,
  fromMicro,
  openSlots,
  type TaskType,
  toMicro,
} from "@proofmarket/core";
import {
  type GetVerificationResponse,
  levelOf,
  type VerificationResult,
} from "@proofmarket/core/schemas/api";
import { type Db, schema } from "@proofmarket/db";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import { proofLinks } from "../proof";
import { bountyOf } from "./bounty";
import { activeReport } from "./store-service";
import type { TaskRow } from "./task-engine";
import { taskLocation } from "./task-location";

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
    // Text: `answer` is the SHA-256 commitment in the result hash; the texts themselves are in `answers`.
    answer:
      res.finalAnswer !== null && task.answerKind === "text"
        ? (`sha256:${createHash("sha256").update(res.finalAnswer).digest("hex")}` as const)
        : (res.finalAnswer ?? null),
    ...(task.answerKind === "text" ? { answers: await acceptedTexts(db, res.acceptedSubmissionIds) } : {}),
    ...(await reviewsOf(db, res.acceptedSubmissionIds)),
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

/** 01 §4.13: the shop's report as of the result (or now while the task is still running). */
async function reportTime(db: Db, task: TaskRow): Promise<Date> {
  const [r] = await db
    .select({ at: schema.verificationResults.finalizedAt })
    .from(schema.verificationResults)
    .where(eq(schema.verificationResults.verificationId, task.id));
  return r?.at ?? new Date();
}

/** 01 §4.12: the recheck created by a dispute of this task, if any. */
async function recheckView(db: Db, task: TaskRow): Promise<GetVerificationResponse["recheck"]> {
  const [child] = await db
    .select()
    .from(schema.verificationRequests)
    .where(eq(schema.verificationRequests.recheckOf, task.id));
  if (!child) return null;
  const results = await db
    .select()
    .from(schema.verificationResults)
    .where(inArray(schema.verificationResults.verificationId, [task.id, child.id]));
  const mine = results.find((r) => r.verificationId === task.id);
  const theirs = results.find((r) => r.verificationId === child.id);
  return {
    verification_id: child.id as GetVerificationResponse["verification_id"],
    status: child.status as GetVerificationResponse["status"],
    answer: theirs?.finalAnswer ?? null,
    matches_original:
      theirs?.outcome === "VERIFIED" && mine?.finalAnswer ? theirs.finalAnswer === mine.finalAnswer : null,
  };
}

/** The requester's own result carries the links to show its user (01 §4.21). */
async function withProof(result: Promise<VerificationResult | null>): Promise<VerificationResult | null> {
  const r = await result;
  return r ? { ...r, proof: proofLinks(r.verification_id) } : null;
}

/** AI review per accepted submission (01 §4.16), oldest first. Omitted when nothing was reviewed. */
async function reviewsOf(db: Db, ids: readonly string[]): Promise<Pick<VerificationResult, "reviews">> {
  if (ids.length === 0) return {};
  const rows = await db
    .select({ details: schema.evidenceChecks.machineDetails, status: schema.evidenceChecks.status })
    .from(schema.evidenceChecks)
    .innerJoin(
      schema.witnessSubmissions,
      eq(schema.witnessSubmissions.id, schema.evidenceChecks.submissionId),
    )
    .where(
      and(
        inArray(schema.evidenceChecks.submissionId, [...ids]),
        eq(schema.evidenceChecks.checkType, "vision_consistency"),
      ),
    )
    .orderBy(asc(schema.witnessSubmissions.serverReceivedAt));
  const reviewed = rows.filter((r) => r.status !== "not_run");
  if (reviewed.length === 0) return {};
  return {
    reviews: reviewed.map((r) => {
      const d = (r.details ?? {}) as { verdict?: string; reason?: string; observed?: string; model?: string };
      return {
        verdict: d.verdict === "pass" || d.verdict === "uncertain" ? d.verdict : "unavailable",
        reason: d.reason ?? "",
        observed: d.observed ?? "",
        model: d.model ?? null,
      };
    }),
  };
}

/** Every accepted text answer, oldest first (01 §4.15). Requester-only: never on public pages. */
async function acceptedTexts(db: Db, ids: readonly string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({ answer: schema.witnessSubmissions.answer })
    .from(schema.witnessSubmissions)
    .where(inArray(schema.witnessSubmissions.id, [...ids]))
    .orderBy(asc(schema.witnessSubmissions.serverReceivedAt));
  return rows.map((r) => r.answer);
}

export async function buildVerificationView(
  db: Db,
  task: TaskRow,
  now: Date = new Date(),
): Promise<GetVerificationResponse> {
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
    type: task.type as TaskType,
    status: task.status as GetVerificationResponse["status"],
    question: task.question,
    acceptance_criteria: task.acceptanceCriteria ?? null,
    answer_schema: answerSchemaOf(
      task.answerKind,
      task.answerValues,
      task.answerSpec as Record<string, unknown> | null,
    ),
    location: taskLocation(task),
    deadline: task.deadline.toISOString(),
    recheck_of: (task.recheckOf as GetVerificationResponse["recheck_of"]) ?? null,
    recheck: await recheckView(db, task),
    store_report: task.placeId ? await activeReport(db, task.placeId, await reportTime(db, task)) : null,
    worker_requirements: task.minWorkerTier
      ? { min_tier: task.minWorkerTier as "standard" | "trusted" }
      : null,
    assurance: {
      required_witnesses: task.requiredWitnesses,
      quorum: task.quorum,
      level: levelOf({ required_witnesses: task.requiredWitnesses, quorum: task.quorum }),
    },
    bounty: {
      asset: "USDC",
      amount: fromMicro(toMicro(task.bountyAmount)),
      network: "solana-devnet",
      max_amount: task.bountyMaxAmount === null ? null : fromMicro(toMicro(task.bountyMaxAmount)),
      ramp_minutes: task.bountyRampMinutes,
      current_amount: currentBounty(bountyOf(task), now),
    },
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
    result: await withProof(buildResult(db, task)),
    created_at: task.createdAt.toISOString(),
    updated_at: task.updatedAt.toISOString(),
  };
}
