// Structural checks on the transition table data (03 §2.2). Behavioural tests (U-SM-ALL etc.) come in PR-03.
import { describe, expect, it } from "vitest";
import { TASK_STATUSES } from "../src/domain/enums.ts";
import { GUARDS, TASK_EVENTS, TRANSITIONS } from "../src/task/transitions.ts";

describe("transition table (03 §2.2)", () => {
  it("has rules T01..T18 exactly once each", () => {
    const ids = TRANSITIONS.map((r) => r.id);
    expect(ids).toEqual(Array.from({ length: 18 }, (_, i) => `T${String(i + 1).padStart(2, "0")}`));
  });

  it("only references known statuses, events and guards", () => {
    for (const r of TRANSITIONS) {
      for (const s of r.from) expect(TASK_STATUSES).toContain(s);
      if (r.to !== "same") expect(TASK_STATUSES).toContain(r.to);
      expect(TASK_EVENTS).toContain(r.event);
      expect(Object.keys(GUARDS)).toContain(r.guard);
    }
  });

  it("never leaves a terminal money state", () => {
    for (const r of TRANSITIONS) {
      expect(r.from).not.toContain("SETTLED");
      expect(r.from).not.toContain("REFUNDED");
    }
  });

  it("uses every event at least once", () => {
    const used = new Set(TRANSITIONS.map((r) => r.event));
    for (const e of TASK_EVENTS) expect(used).toContain(e);
  });
});
