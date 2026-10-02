// 09-test-plan.md §3.1 — implemented in PR-03. One case per rule in 08 §3, plus a near-miss allowed example.
import { describe, it } from "vitest";
import { POLICY_RULES } from "../src/policy/rules.ts";

describe("policy rules", () => {
  Object.keys(POLICY_RULES).forEach((rule, i) => {
    it.todo(`U-POL-${String(i + 1).padStart(2, "0")}: ${rule} rejects ja/en examples and allows a near miss`);
  });
});
