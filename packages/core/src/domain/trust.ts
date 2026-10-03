// Worker trust tiers (01 §4.11). Four explainable tiers from the last 90 days; no numeric score.

export const WORKER_TIERS = ["restricted", "new", "standard", "trusted"] as const;
export type WorkerTier = (typeof WORKER_TIERS)[number];
export const REQUIRABLE_TIERS = ["standard", "trusted"] as const;
export type RequirableTier = (typeof REQUIRABLE_TIERS)[number];

export const TRUST_WINDOW_DAYS = 90;

export interface WorkerRecord {
  valid: number;
  /** Failures for replayed or near-duplicate photos. */
  violations: number;
  /** VERIFIED multi-witness tasks this worker answered, and how many matched the final answer. */
  compared: number;
  agreed: number;
}

export function tierOf(r: WorkerRecord): { tier: WorkerTier; reasons: string[] } {
  if (r.violations > 0) return { tier: "restricted", reasons: ["photo_reuse_or_near_duplicate"] };
  if (r.valid < 3) return { tier: "new", reasons: ["fewer_than_3_valid"] };
  const rate = r.compared ? r.agreed / r.compared : null;
  if (r.valid >= 10 && r.compared >= 3 && rate !== null && rate >= 0.9) {
    return { tier: "trusted", reasons: ["10_plus_valid", "agreement_90_percent"] };
  }
  return { tier: "standard", reasons: [] };
}

/** May a worker of `tier` take a task with these settings? */
export function eligible(
  tier: WorkerTier,
  task: { minTier: RequirableTier | null; requiredWitnesses: number },
) {
  if (tier === "restricted" && task.requiredWitnesses === 1) return false;
  if (task.minTier === "trusted") return tier === "trusted";
  if (task.minTier === "standard") return tier === "standard" || tier === "trusted";
  return true;
}
