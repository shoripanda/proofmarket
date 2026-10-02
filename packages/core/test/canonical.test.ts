// 09-test-plan.md §3.1 — implemented in PR-08.
import { describe, it } from "vitest";

describe("canonicalization", () => {
  it.todo("U-JCS-01: golden bundle -> golden evidence_root; key order does not matter");
  it.todo(
    "U-JCS-02: result_hash input excludes result_hash, consensus_ratio, attestation, settlement, verified_at",
  );
});
