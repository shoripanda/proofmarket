// 09-test-plan.md §3.1 — implemented in PR-06/07/14.
import { describe, it } from "vitest";

describe("evidence checks", () => {
  it.todo("U-CHK-01: media_schema boundaries (exactly 8 MiB, 480px short edge, non-JPEG magic)");
  it.todo("U-CHK-02: replay maps a unique-violation to EVIDENCE_REPLAYED");
  it.todo("U-CHK-03: geofence distance exactly = radius passes; radius + 1 m fails (D4)");
  it.todo("U-CHK-04: geofence accuracy exactly 100 m passes; 101 m fails");
  it.todo("U-CHK-05: freshness exactly max_age passes; +1 s is EVIDENCE_STALE");
  it.todo("U-CHK-06: client clock skew >= 120 s only adds risk flag clock_skew");
  it.todo("U-CHK-07: distance + accuracy > radius only adds risk flag edge_of_geofence");
  it.todo("U-CHK-08: runChecks stops at first fail and marks the rest not_run (REQ-X-V-101)");
});
