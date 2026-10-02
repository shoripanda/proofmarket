// Evidence bundle, evidence_root and result_hash (07 §5). Canonicalization: RFC 8785 (npm `canonicalize`).

import type { AnswerValue, CheckStatus, Outcome } from "../domain/enums.ts";

export const EVIDENCE_BUNDLE_SCHEMA = "proofmarket.evidence-bundle.v1" as const;
export const TASK_ID_HASH_DOMAIN = "proofmarket:task:v1:" as const;

/** `sha256:<lowercase hex>` in JSON; raw 32 bytes on-chain. */
export type Sha256Hex = `sha256:${string}`;

export interface BundleSubmission {
  /** HMAC-SHA256(WORKER_REF_SALT, worker_id + ":" + verification_id) — differs per task (07 §5.1). */
  witness_ref: `hmac:${string}`;
  answer: AnswerValue;
  evidence_sha256: Sha256Hex[];
  server_received_at: string; // ISO 8601, UTC, second precision
  checks: Partial<
    Record<"freshness" | "geofence" | "media_schema" | "replay" | "task_nonce" | "duplicate", CheckStatus>
  >;
}

/**
 * Only public-safe content: no coordinates, photos, question text or worker identity.
 * submissions: VALID only, sorted by server_received_at then evidence_sha256. answer_values: sorted.
 */
export interface EvidenceBundle {
  schema: typeof EVIDENCE_BUNDLE_SCHEMA;
  verification_id: string;
  task_id_hash: Sha256Hex;
  type: "PLACE_STATUS_VERIFICATION";
  question_hash: Sha256Hex;
  answer_values: AnswerValue[];
  assurance: { required_witnesses: number; quorum: number };
  submissions: BundleSubmission[];
  outcome: Outcome;
  final_answer: AnswerValue | null;
  finalized_at: string; // decided once by the app, stored identically in DB (04 §3.13)
}

/** SHA-256("proofmarket:task:v1:" + verification_id). Used as the Task PDA seed. */
export function taskIdHash(_verificationId: string): Uint8Array {
  throw new Error("NOT_IMPLEMENTED: taskIdHash (PR-08)");
}

/** evidence_root = SHA-256(JCS(bundle)). Golden-vector test: U-JCS-01. */
export function evidenceRoot(_bundle: EvidenceBundle): Uint8Array {
  throw new Error("NOT_IMPLEMENTED: evidenceRoot (PR-08)");
}

/** Fields of VerificationResult excluded from result_hash input (07 §5.2, U-JCS-02). */
export const RESULT_HASH_EXCLUDED_FIELDS = [
  "result_hash",
  "consensus_ratio",
  "attestation",
  "settlement",
  "verified_at",
] as const;

/** result_hash = SHA-256(JCS(result without RESULT_HASH_EXCLUDED_FIELDS)). */
export function resultHash(_result: Record<string, unknown>): Uint8Array {
  throw new Error("NOT_IMPLEMENTED: resultHash (PR-08)");
}

export function toSha256Hex(_bytes: Uint8Array): Sha256Hex {
  throw new Error("NOT_IMPLEMENTED: toSha256Hex (PR-08)");
}
