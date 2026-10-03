// Worker trust tiers (01 §4.11).
import { describe, expect, it } from "vitest";
import { eligible, tierOf } from "../src/domain/trust.ts";

const rec = (o: Partial<{ valid: number; violations: number; compared: number; agreed: number }>) => ({
  valid: 0,
  violations: 0,
  compared: 0,
  agreed: 0,
  ...o,
});

describe("trust tiers", () => {
  it("assigns tiers in priority order", () => {
    expect(tierOf(rec({ valid: 50, violations: 1, compared: 10, agreed: 10 })).tier).toBe("restricted");
    expect(tierOf(rec({ valid: 2 })).tier).toBe("new");
    expect(tierOf(rec({ valid: 3 })).tier).toBe("standard");
    expect(tierOf(rec({ valid: 10, compared: 3, agreed: 3 })).tier).toBe("trusted");
    expect(tierOf(rec({ valid: 10, compared: 10, agreed: 8 })).tier).toBe("standard");
    expect(tierOf(rec({ valid: 10, compared: 2, agreed: 2 })).tier).toBe("standard");
  });

  it("restricted workers skip single-witness tasks; min_tier gates the rest", () => {
    expect(eligible("restricted", { minTier: null, requiredWitnesses: 1 })).toBe(false);
    expect(eligible("restricted", { minTier: null, requiredWitnesses: 3 })).toBe(true);
    expect(eligible("new", { minTier: "standard", requiredWitnesses: 2 })).toBe(false);
    expect(eligible("standard", { minTier: "standard", requiredWitnesses: 2 })).toBe(true);
    expect(eligible("standard", { minTier: "trusted", requiredWitnesses: 2 })).toBe(false);
    expect(eligible("trusted", { minTier: "trusted", requiredWitnesses: 1 })).toBe(true);
  });
});
