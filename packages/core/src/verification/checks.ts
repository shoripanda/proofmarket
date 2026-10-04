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

import { LIMITS } from "../domain/limits.ts";

const pass = (type: CheckType, details?: Record<string, unknown>, riskFlags?: RiskFlag[]): CheckOutcome => ({
  type,
  status: "pass",
  ...(details ? { details } : {}),
  ...(riskFlags?.length ? { riskFlags } : {}),
});
const fail = (
  type: CheckType,
  reasonCode: CheckReasonCode,
  details?: Record<string, unknown>,
): CheckOutcome => ({
  type,
  status: "fail",
  reasonCode,
  ...(details ? { details } : {}),
});

const JPEG_MAGIC = [0xff, 0xd8, 0xff];

/** Check 1 — JPEG magic, size <= 8 MiB, decodable, short edge >= 480px. */
export function checkMediaSchema(f: MediaFacts): CheckOutcome {
  const t = "media_schema";
  if (
    f.declaredContentType !== LIMITS.media.contentType ||
    !JPEG_MAGIC.every((b, i) => f.magicBytes[i] === b)
  ) {
    return fail(t, "MEDIA_TYPE_UNSUPPORTED");
  }
  if (f.byteSize > LIMITS.media.maxBytes) return fail(t, "MEDIA_TOO_LARGE", { byte_size: f.byteSize });
  if (!f.decoded) return fail(t, "MEDIA_DECODE_FAILED");
  const shortEdge = Math.min(f.decoded.width, f.decoded.height);
  if (shortEdge < LIMITS.media.minShortEdgePx)
    return fail(t, "MEDIA_DECODE_FAILED", { short_edge_px: shortEdge });
  return pass(t, { width: f.decoded.width, height: f.decoded.height, byte_size: f.byteSize });
}

/**
 * Check 2 — exact replay. Decided by the unique index on evidence_objects.sha256 (04 §3.10);
 * the caller passes whether the insert hit a unique violation.
 */
export function checkReplay(insertConflicted: boolean): CheckOutcome {
  return insertConflicted ? fail("replay", "EVIDENCE_REPLAYED") : pass("replay");
}

/** Check 3 — now − challenge.issued_at <= freshness_max_age_s, object created after challenge; clock skew is a flag only. */
export function checkFreshness(f: FreshnessFacts): CheckOutcome {
  const ageS = (f.now.getTime() - f.challengeIssuedAt.getTime()) / 1000;
  const flags: RiskFlag[] = [];
  const details: Record<string, unknown> = { age_s: Math.round(ageS), max_age_s: f.freshnessMaxAgeS };
  if (f.clientTimestamp) {
    const skewS = Math.round((f.clientTimestamp.getTime() - f.now.getTime()) / 1000);
    if (Math.abs(skewS) >= LIMITS.clientClockSkewWarnS) {
      flags.push("clock_skew");
      details.client_clock_skew_s = skewS;
    }
  }
  if (ageS > f.freshnessMaxAgeS || f.storageObjectCreatedAt.getTime() < f.challengeIssuedAt.getTime()) {
    return { ...fail("freshness", "EVIDENCE_STALE", details), ...(flags.length ? { riskFlags: flags } : {}) };
  }
  return pass("freshness", details, flags);
}

/** Check 4 — accuracy <= 100 m and haversine distance <= radius; distance + accuracy > radius is a flag only. */
export function checkGeofence(f: GeofenceFacts): CheckOutcome {
  const t = "geofence";
  const distance = haversineM(f.target, f.observed);
  // Only rounded distance leaves this function (04 §3.11: 10 m units for requester/public).
  const details = {
    distance_m: Math.round(distance),
    radius_m: f.target.radiusM,
    accuracy_m: Math.round(f.observed.accuracyM),
  };
  if (f.observed.accuracyM > LIMITS.geofence.maxAccuracyM)
    return fail(t, "LOCATION_ACCURACY_TOO_LOW", details);
  if (distance > f.target.radiusM) return fail(t, "EVIDENCE_OUTSIDE_GEOFENCE", details);
  return pass(t, details, distance + f.observed.accuracyM > f.target.radiusM ? ["edge_of_geofence"] : []);
}

/** Check 5 (P1) — Hamming distance of 64-bit dHash > 6 against candidates. */
export function checkDuplicate(f: DuplicateFacts): CheckOutcome {
  let best: { submissionId: string; distance: number } | null = null;
  for (const c of f.candidates) {
    const d = hamming64(f.dhash, c.dhash);
    if (!best || d < best.distance) best = { submissionId: c.submissionId, distance: d };
  }
  if (best && best.distance <= LIMITS.duplicate.maxHammingForMatch) {
    return fail("duplicate", "EVIDENCE_NEAR_DUPLICATE", { hamming: best.distance });
  }
  return pass("duplicate", best ? { min_hamming: best.distance } : undefined);
}

export function hamming64(a: bigint, b: bigint): number {
  let x = BigInt.asUintN(64, a ^ b);
  let n = 0;
  while (x) {
    x &= x - 1n;
    n++;
  }
  return n;
}

const EARTH_RADIUS_M = 6_371_008.8;
const rad = (d: number) => (d * Math.PI) / 180;

/** Great-circle distance in metres. */
export function haversineM(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Run steps in order; stop at the first fail. Steps after it are reported as not_run (REQ-X-V-101).
 * `order` names every step so not_run entries can be produced without executing them.
 */
export function runChecks(
  order: readonly CheckType[],
  steps: readonly (() => CheckOutcome)[],
): CheckOutcome[] {
  const out: CheckOutcome[] = [];
  let failed = false;
  order.forEach((type, i) => {
    const step = steps[i];
    if (failed || !step) {
      out.push({ type, status: "not_run" });
      return;
    }
    const r = step();
    out.push(r);
    if (r.status === "fail") failed = true;
  });
  return out;
}

/**
 * One check over several photos of a submission (01 §4.18): the first photo that fails fails the check
 * (details.photo is its 1-based position), otherwise a warning on any photo makes it a warning.
 * A single photo is returned unchanged.
 */
export function combinePhotoOutcomes(outcomes: readonly CheckOutcome[]): CheckOutcome {
  const [only] = outcomes;
  if (!only) throw new Error("combinePhotoOutcomes needs at least one outcome");
  if (outcomes.length === 1) return only;
  const flags = [...new Set(outcomes.flatMap((o) => o.riskFlags ?? []))];
  const withFlags = (o: CheckOutcome): CheckOutcome => ({
    ...o,
    ...(flags.length ? { riskFlags: flags } : {}),
  });
  const i = outcomes.findIndex((o) => o.status === "fail");
  const failed = outcomes[i];
  if (failed) return withFlags({ ...failed, details: { ...(failed.details ?? {}), photo: i + 1 } });
  const status = outcomes.some((o) => o.status === "warning")
    ? "warning"
    : outcomes.every((o) => o.status === "not_run")
      ? "not_run"
      : "pass";
  return withFlags({ type: only.type, status, details: { photos: outcomes.map((o) => o.details ?? {}) } });
}

/** First failing check, if any. */
export function firstFailure(results: readonly CheckOutcome[]): CheckOutcome | undefined {
  return results.find((r) => r.status === "fail");
}
