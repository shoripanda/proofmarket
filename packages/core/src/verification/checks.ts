// Evidence checks (07-evidence-verification-design.md §3). Pure functions over already-loaded facts.
// Order: PRE_CHECKS (HTTP errors, not recorded) -> CHECK_ORDER (recorded; first failure stops, rest = not_run).

import type { CheckReasonCode, CheckStatus, CheckType, RiskFlag } from "../domain/enums.ts";

export interface CheckOutcome {
  type: CheckType;
  status: CheckStatus;
  reasonCode?: CheckReasonCode;
  /** Machine details stored in evidence_checks.machine_details (no coordinates, no secrets). */
  details?: Record<string, unknown>;
  riskFlags?: RiskFlag[];
}

export interface MediaFacts {
  declaredContentType: string;
  byteSize: number;
  magicBytes: Uint8Array; // first 12 bytes
  decoded: { width: number; height: number } | null; // null = sharp failed to decode
}

export interface FreshnessFacts {
  now: Date; // DB now()
  challengeIssuedAt: Date;
  storageObjectCreatedAt: Date;
  clientTimestamp: Date | null;
  freshnessMaxAgeS: number;
}

export interface GeofenceFacts {
  target: { lat: number; lng: number; radiusM: number };
  observed: { lat: number; lng: number; accuracyM: number };
}

export interface DuplicateFacts {
  dhash: bigint;
  /** dHashes of other submissions in the last 90 days, excluding earlier attempts of the same claim. */
  candidates: readonly { submissionId: string; dhash: bigint }[];
}

/** Check 1 — JPEG magic, size <= 8 MiB, decodable, short edge >= 480px. */
export function checkMediaSchema(_f: MediaFacts): CheckOutcome {
  throw new Error("NOT_IMPLEMENTED: checkMediaSchema (PR-07)");
}

/**
 * Check 2 — exact replay. Decided by the unique index on evidence_objects.sha256 (04 §3.10);
 * the caller passes whether the insert hit a unique violation.
 */
export function checkReplay(_insertConflicted: boolean): CheckOutcome {
  throw new Error("NOT_IMPLEMENTED: checkReplay (PR-07)");
}

/** Check 3 — now − challenge.issued_at <= freshness_max_age_s, object created after challenge; clock skew is a flag only. */
export function checkFreshness(_f: FreshnessFacts): CheckOutcome {
  throw new Error("NOT_IMPLEMENTED: checkFreshness (PR-06/07)");
}

/** Check 4 — accuracy <= 100 m and haversine distance <= radius; distance + accuracy > radius is a flag only. */
export function checkGeofence(_f: GeofenceFacts): CheckOutcome {
  throw new Error("NOT_IMPLEMENTED: checkGeofence (PR-06)");
}

/** Check 5 (P1) — Hamming distance of 64-bit dHash > 6 against candidates. */
export function checkDuplicate(_f: DuplicateFacts): CheckOutcome {
  throw new Error("NOT_IMPLEMENTED: checkDuplicate (PR-14)");
}

/** Great-circle distance in metres. */
export function haversineM(_a: { lat: number; lng: number }, _b: { lat: number; lng: number }): number {
  throw new Error("NOT_IMPLEMENTED: haversineM (PR-06)");
}

/** Run CHECK_ORDER, stopping at the first fail; remaining checks become not_run (REQ-X-V-101). */
export function runChecks(_steps: readonly (() => CheckOutcome)[]): CheckOutcome[] {
  throw new Error("NOT_IMPLEMENTED: runChecks (PR-07)");
}
