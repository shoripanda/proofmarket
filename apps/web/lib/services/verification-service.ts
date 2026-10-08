import "server-only";
// Consensus and result persistence (07 §4-5, 03 T08-T12).

import { createHash } from "node:crypto";
import {
  type CheckStatus,
  consensusRatio,
  decide,
  decideText,
  EVIDENCE_BUNDLE_SCHEMA,
  type EvidenceBundle,
  evidenceRoot,
  questionHash,
  resultHash,
  type TaskType,
  toSha256Hex,
} from "@proofmarket/core";
import { type Db, schema } from "@proofmarket/db";
import { and, asc, count, eq, inArray } from "drizzle-orm";
import type { AppContext } from "../context";
import { appendAudit } from "./audit";
import { witnessRef } from "./crypto";
import { applyTaskEvent, type TaskRow } from "./task-engine";

const BUNDLE_CHECKS = [
  "freshness",
  "geofence",
  "media_schema",
  "replay",
  "task_nonce",
  "duplicate",
  "vision_consistency",
] as const;
const RESULT_CHECKS = [
  "geofence",
  "freshness",
  "task_nonce",
  "replay",
  "media_schema",
  "duplicate",
  "vision_consistency",
] as const;

const worst = (s: CheckStatus[]): CheckStatus => {
  for (const x of ["fail", "warning", "pass"] as const) if (s.includes(x)) return x;
  return "not_run";
};

/** Build bundle + hashes and insert verification_results. finalized_at is decided here once (07 §5.2). */
export async function saveResult(
  tx: Db,
  app: AppContext,
  task: TaskRow,
  outcome: {
    status: "VERIFIED" | "REJECTED" | "EXPIRED";
    reason: "NO_CONSENSUS" | "INSUFFICIENT_WITNESSES" | null;
    answer: string | null;
  },
): Promise<void> {
  const finalizedAt = new Date(Math.floor(app.now().getTime() / 1000) * 1000);
  const valid = await tx
    .select()
    .from(schema.witnessSubmissions)
    .where(
      and(
        eq(schema.witnessSubmissions.verificationId, task.id),
        eq(schema.witnessSubmissions.state, "VALID"),
      ),
    );
  const ids = valid.map((v) => v.id);
  const evidence = ids.length
    ? await tx
        .select()
        .from(schema.evidenceObjects)
        .where(inArray(schema.evidenceObjects.submissionId, ids))
        .orderBy(asc(schema.evidenceObjects.id)) // photos in the order sent (01 §4.18)
    : [];
  const checks = ids.length
    ? await tx.select().from(schema.evidenceChecks).where(inArray(schema.evidenceChecks.submissionId, ids))
    : [];
  const rejected = await tx
    .select({ reason: schema.witnessSubmissions.reasonCode, n: count() })
    .from(schema.witnessSubmissions)
    .where(
      and(
        eq(schema.witnessSubmissions.verificationId, task.id),
        eq(schema.witnessSubmissions.state, "INVALID"),
      ),
    )
    .groupBy(schema.witnessSubmissions.reasonCode);

  // Text answers (01 §4.15): kept out of counts, and the public bundle carries only their SHA-256.
  const isText = task.answerKind === "text";
  const answerCounts: Record<string, number> = {};
  if (!isText) for (const v of valid) answerCounts[v.answer] = (answerCounts[v.answer] ?? 0) + 1;
  const publicAnswer = (a: string) => (isText ? toSha256Hex(createHash("sha256").update(a).digest()) : a);

  const bundle: EvidenceBundle = {
    schema: EVIDENCE_BUNDLE_SCHEMA,
    verification_id: task.id,
    task_id_hash: toSha256Hex(task.taskIdHash),
    type: task.type as TaskType,
    question_hash: questionHash(task.question),
    answer_values: [...task.answerValues],
    assurance: { required_witnesses: task.requiredWitnesses, quorum: task.quorum },
    submissions: valid.map((v) => ({
      witness_ref: witnessRef(app.config.workerRefSalt, v.workerId, task.id),
      answer: publicAnswer(v.answer),
      evidence_sha256: evidence.filter((e) => e.submissionId === v.id).map((e) => toSha256Hex(e.sha256)),
      server_received_at: new Date(Math.floor(v.serverReceivedAt.getTime() / 1000) * 1000)
        .toISOString()
        .replace(".000Z", "Z"),
      checks: Object.fromEntries(
        BUNDLE_CHECKS.map((t) => [
          t,
          (checks.find((c) => c.submissionId === v.id && c.checkType === t)?.status ??
            "not_run") as CheckStatus,
        ]),
      ),
    })),
    outcome: outcome.status,
    final_answer: outcome.answer === null ? null : publicAnswer(outcome.answer),
    finalized_at: finalizedAt.toISOString().replace(".000Z", "Z"),
  };
  const root = evidenceRoot(bundle);
  // Same field set the API returns minus RESULT_HASH_EXCLUDED_FIELDS, so anyone can recompute it (U-JCS-02).
  // RESULT_HASH_FIELDS in core lists these keys for verifyOnChain (13 §2); change both together.
  const hashInput = {
    verification_id: task.id,
    status: outcome.status,
    reason: outcome.reason,
    answer: outcome.answer === null ? null : publicAnswer(outcome.answer),
    witnesses: { valid: valid.length, required: task.requiredWitnesses, quorum: task.quorum },
    answer_counts: answerCounts,
    checks: Object.fromEntries(
      RESULT_CHECKS.map((t) => [
        t,
        worst(checks.filter((c) => c.checkType === t).map((c) => c.status as CheckStatus)),
      ]),
    ),
    rejected_submissions: Object.fromEntries(
      rejected.filter((r) => r.reason).map((r) => [r.reason, Number(r.n)]),
    ),
    evidence_root: toSha256Hex(root),
  };
  await tx.insert(schema.verificationResults).values({
    verificationId: task.id,
    outcome: outcome.status,
    outcomeReason: outcome.reason,
    finalAnswer: outcome.answer,
    validWitnessCount: valid.length,
    requiredWitnesses: task.requiredWitnesses,
    quorum: task.quorum,
    consensusRatio: String(consensusRatio(answerCounts) ?? 0),
    answerCounts,
    acceptedSubmissionIds: ids,
    evidenceBundle: bundle,
    evidenceRoot: Buffer.from(root),
    resultHash: Buffer.from(resultHash(hashInput)),
    finalizedAt,
  });
  // 01 §4.12: a recheck that disagrees with the disputed result is flagged for operator review.
  if (task.recheckOf && outcome.status === "VERIFIED") {
    const [orig] = await tx
      .select({ answer: schema.verificationResults.finalAnswer })
      .from(schema.verificationResults)
      .where(eq(schema.verificationResults.verificationId, task.recheckOf));
    if (orig && orig.answer !== outcome.answer) {
      await appendAudit(tx, {
        verificationId: task.recheckOf,
        actorType: "system",
        actorRef: null,
        eventType: "operator_action",
        beforeState: null,
        afterState: null,
        correlationId: task.recheckOf,
        metadata: {
          action: "recheck_mismatch",
          recheck: task.id,
          original: orig.answer,
          recheck_answer: outcome.answer,
        },
      });
    }
  }
}

/** Task is VERIFYING: decide and apply T09 / T10. */
export async function evaluateConsensus(tx: Db, app: AppContext, task: TaskRow): Promise<void> {
  const valid = await tx
    .select({ answer: schema.witnessSubmissions.answer })
    .from(schema.witnessSubmissions)
    .where(
      and(
        eq(schema.witnessSubmissions.verificationId, task.id),
        eq(schema.witnessSubmissions.state, "VALID"),
      ),
    )
    .orderBy(asc(schema.witnessSubmissions.serverReceivedAt));
  const d = task.answerKind === "text" ? decideText(valid, task.quorum) : decide(valid, task.quorum);
  const verified = d.kind === "VERIFIED";
  await saveResult(tx, app, task, {
    status: verified ? "VERIFIED" : "REJECTED",
    reason: verified ? null : "NO_CONSENSUS",
    answer: verified ? d.answer : null,
  });
  await applyTaskEvent(tx, app, task, verified ? "CONSENSUS_REACHED" : "CONSENSUS_FAILED", {
    actorType: "system",
    actorRef: null,
    correlationId: task.id,
    metadata: { answer_counts: d.answerCounts },
  });
}

/** Deadline handling for one task (T08 / T11 / T12). Caller holds the row lock. */
export async function handleDeadline(tx: Db, app: AppContext, task: TaskRow): Promise<void> {
  const r = await applyTaskEvent(tx, app, task, "DEADLINE_REACHED", {
    actorType: "system",
    actorRef: null,
    correlationId: task.id,
  });
  if (r.rule.id === "T08") {
    await evaluateConsensus(tx, app, task);
  } else {
    await saveResult(tx, app, task, { status: "EXPIRED", reason: "INSUFFICIENT_WITNESSES", answer: null });
  }
}
