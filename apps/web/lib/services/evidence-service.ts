import "server-only";
import type { SubmitEvidenceRequest } from "@proofmarket/core/schemas/api";

/** Signed upload URL (Supabase Storage, bucket evidence-raw, 120 s). Bucket enforces 8 MiB + image/jpeg. PR-06. */
export async function createUpload(
  _workerId: string,
  _claimId: string,
  _challengeId: string,
  _byteSize: number,
) {
  throw new Error("NOT_IMPLEMENTED: createUpload (PR-06)");
}

/**
 * 05 §3.6 pre-checks (HTTP errors) -> record submission -> read object, sha256, insert evidence_objects
 * (replay = unique violation) -> sharp re-encode / EXIF strip / dHash -> checks in CHECK_ORDER ->
 * VALID/INVALID, claim transition, maybe QUORUM_READY. Task row locked throughout (REQ-X-V-102). PR-06/07.
 */
export async function submitEvidence(
  _workerId: string,
  _verificationId: string,
  _body: SubmitEvidenceRequest,
) {
  throw new Error("NOT_IMPLEMENTED: submitEvidence (PR-06)");
}
