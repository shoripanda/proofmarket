// 09-test-plan.md §3.1 — implemented in PR-03.
import { describe, it } from "vitest";

describe("task state machine", () => {
  it.todo("U-SM-ALL: only (status, event) pairs listed in 03 §2.2 succeed (REQ-S-001, REQ-N-004)");
  it.todo("U-SM-CAN: cancel is rejected with an ACTIVE claim or a valid submission");
});
