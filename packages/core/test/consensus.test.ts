// 09-test-plan.md §3.1 — U-CON-01..08.
import { describe, expect, it } from "vitest";
import { consensusRatio, decide } from "../src/verification/consensus.ts";

const v = (...answers: string[]) => answers.map((answer) => ({ answer }));

describe("consensus", () => {
  it("U-CON-01: 1/1 -> VERIFIED", () =>
    expect(decide(v("OPEN"), 1)).toMatchObject({ kind: "VERIFIED", answer: "OPEN" }));
  it("U-CON-02: 2/2 agree -> VERIFIED", () =>
    expect(decide(v("CLOSED", "CLOSED"), 2)).toMatchObject({ kind: "VERIFIED", answer: "CLOSED" }));
  it("U-CON-03: 2-of-3 agree -> VERIFIED", () =>
    expect(decide(v("OPEN", "CLOSED", "OPEN"), 2)).toMatchObject({ kind: "VERIFIED", answer: "OPEN" }));
  it("U-CON-04: 2-of-3 all differ -> REJECTED NO_CONSENSUS", () =>
    expect(decide(v("OPEN", "CLOSED", "UNCLEAR"), 2)).toMatchObject({
      kind: "REJECTED",
      reason: "NO_CONSENSUS",
    }));
  it("U-CON-05: UNCLEAR majority -> VERIFIED / UNCLEAR", () =>
    expect(decide(v("UNCLEAR", "UNCLEAR", "OPEN"), 2)).toMatchObject({
      kind: "VERIFIED",
      answer: "UNCLEAR",
    }));
  it("U-CON-06: tie at top -> REJECTED NO_CONSENSUS", () =>
    expect(decide(v("OPEN", "CLOSED"), 1)).toMatchObject({ kind: "REJECTED", reason: "NO_CONSENSUS" }));
  it("U-CON-07: valid < quorum -> EXPIRED INSUFFICIENT_WITNESSES", () =>
    expect(decide(v("OPEN"), 2)).toMatchObject({ kind: "EXPIRED", reason: "INSUFFICIENT_WITNESSES" }));
  it("U-CON-08: consensus_ratio = top / valid", () => {
    expect(consensusRatio({ OPEN: 2, CLOSED: 1 })).toBe(0.6667);
    expect(consensusRatio({ OPEN: 1 })).toBe(1);
    expect(consensusRatio({})).toBeNull();
  });
});
