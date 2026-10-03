// Assurance presets (05 §2.1 row 12): a level is normalized to counts; counts map back to a level.
import { describe, expect, it } from "vitest";
import { AssuranceInputSchema, levelOf } from "../src/schemas/api.ts";

describe("assurance levels", () => {
  it("normalizes each level to counts", () => {
    expect(AssuranceInputSchema.parse({ level: "fast" })).toEqual({ required_witnesses: 1, quorum: 1 });
    expect(AssuranceInputSchema.parse({ level: "standard" })).toEqual({ required_witnesses: 2, quorum: 2 });
    expect(AssuranceInputSchema.parse({ level: "high" })).toEqual({ required_witnesses: 3, quorum: 2 });
  });

  it("still accepts explicit counts and keeps their rules", () => {
    expect(AssuranceInputSchema.parse({ required_witnesses: 4, quorum: 3 })).toEqual({
      required_witnesses: 4,
      quorum: 3,
    });
    expect(AssuranceInputSchema.safeParse({ required_witnesses: 1, quorum: 2 }).success).toBe(false);
  });

  it("rejects unknown levels and a level mixed with counts", () => {
    expect(AssuranceInputSchema.safeParse({ level: "max" }).success).toBe(false);
    expect(AssuranceInputSchema.safeParse({ level: "fast", quorum: 1 }).success).toBe(false);
  });

  it("maps counts back to a level, or null", () => {
    expect(levelOf({ required_witnesses: 3, quorum: 2 })).toBe("high");
    expect(levelOf({ required_witnesses: 4, quorum: 3 })).toBeNull();
  });
});
