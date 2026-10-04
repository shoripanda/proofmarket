// Evidence bundle, evidence_root and result_hash (07 §5). Canonicalization: RFC 8785 (npm `canonicalize`).

import { createHash } from "node:crypto";
import canonicalize from "canonicalize";
import type { CheckStatus, Outcome, TaskType } from "../domain/enums.ts";

export const EVIDENCE_BUNDLE_SCHEMA = "proofmarket.evidence-bundle.v1" as const;
export const TASK_ID_HASH_DOMAIN = "proofmarket:task:v1:" as const;

/** `sha256:<lowercase hex>` in JSON; raw 32 bytes on-chain. */
export type Sha256Hex = `sha256:${string}`;

export interface BundleSubmission {
  /** HMAC-SHA256(WORKER_REF_SALT, worker_id + ":" + verification_id) — differs per task (07 §5.1). */
  witness_ref: `hmac:${string}`;
  /** Fixed code or number as written; a text answer appears only as its SHA-256 (01 §4.15). */
  answer: string;
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
  type: TaskType;
  question_hash: Sha256Hex;
  answer_values: string[];
  assurance: { required_witnesses: number; quorum: number };
  submissions: BundleSubmission[];
  outcome: Outcome;
  final_answer: string | null;
  finalized_at: string; // decided once by the app, stored identically in DB (04 §3.13)
}

const sha256 = (data: string | Uint8Array): Uint8Array =>
  new Uint8Array(createHash("sha256").update(data).digest());

/** RFC 8785 canonical JSON. Throws on values JCS cannot represent (undefined, NaN, Infinity). */
export function jcs(value: unknown): string {
  const out = canonicalize(value);
  if (out === undefined) throw new Error("value cannot be canonicalized");
  return out;
}

/** SHA-256("proofmarket:task:v1:" + verification_id). Used as the Task PDA seed. */
export function taskIdHash(verificationId: string): Uint8Array {
  return sha256(TASK_ID_HASH_DOMAIN + verificationId);
}

export function questionHash(question: string): Sha256Hex {
  return toSha256Hex(sha256(question));
}

/** Sort submissions and answer_values as 07 §5.1 requires, without mutating the input. */
export function normalizeBundle(bundle: EvidenceBundle): EvidenceBundle {
  const submissions = [...bundle.submissions]
    .map((s) => ({ ...s, evidence_sha256: [...s.evidence_sha256].sort() }))
    .sort(
      (a, b) =>
        a.server_received_at.localeCompare(b.server_received_at) ||
        (a.evidence_sha256[0] ?? "").localeCompare(b.evidence_sha256[0] ?? ""),
    );
  return { ...bundle, answer_values: [...bundle.answer_values].sort(), submissions };
}

/** evidence_root = SHA-256(JCS(bundle)). Golden-vector test: U-JCS-01. */
export function evidenceRoot(bundle: EvidenceBundle): Uint8Array {
  return sha256(jcs(normalizeBundle(bundle)));
}

/** Fields of VerificationResult excluded from result_hash input (07 §5.2, U-JCS-02). */
export const RESULT_HASH_EXCLUDED_FIELDS = [
  "result_hash",
  "consensus_ratio",
  "attestation",
  "settlement",
  "verified_at",
  /** Text answers in full (01 §4.15). `answer` carries their commitment: the SHA-256 of the first one. */
  "answers",
] as const;

/** result_hash = SHA-256(JCS(result without RESULT_HASH_EXCLUDED_FIELDS)). */
export function resultHash(result: Record<string, unknown>): Uint8Array {
  const input = Object.fromEntries(
    Object.entries(result).filter(([k]) => !(RESULT_HASH_EXCLUDED_FIELDS as readonly string[]).includes(k)),
  );
  return sha256(jcs(input));
}

export function toSha256Hex(bytes: Uint8Array): Sha256Hex {
  if (bytes.length !== 32) throw new Error("sha256 digest must be 32 bytes");
  return `sha256:${Buffer.from(bytes).toString("hex")}`;
}

export function fromSha256Hex(hex: Sha256Hex): Uint8Array {
  const m = /^sha256:([0-9a-f]{64})$/.exec(hex);
  if (!m?.[1]) throw new Error("malformed sha256 hex");
  return new Uint8Array(Buffer.from(m[1], "hex"));
}
