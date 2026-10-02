// 09-test-plan.md §3.1 — U-CHK-01..08 and D4.
import { describe, expect, it } from "vitest";
import {
  checkDuplicate,
  checkFreshness,
  checkGeofence,
  checkMediaSchema,
  checkReplay,
  hamming64,
  haversineM,
  runChecks,
} from "../src/verification/checks.ts";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
const media = (o: Partial<Parameters<typeof checkMediaSchema>[0]> = {}) =>
  checkMediaSchema({
    declaredContentType: "image/jpeg",
    byteSize: 1_000_000,
    magicBytes: JPEG,
    decoded: { width: 1920, height: 1080 },
    ...o,
  });

// Shibuya-ish target; 1e-5 deg lat ≈ 1.11 m
const target = { lat: 35.6595, lng: 139.7005, radiusM: 80 };
const north = (m: number) => ({ lat: target.lat + m / 111_195, lng: target.lng });

describe("evidence checks", () => {
  it("U-CHK-01: media_schema boundaries (exactly 8 MiB, 480px short edge, non-JPEG magic)", () => {
    expect(media({ byteSize: 8 * 1024 * 1024 }).status).toBe("pass");
    expect(media({ byteSize: 8 * 1024 * 1024 + 1 })).toMatchObject({
      status: "fail",
      reasonCode: "MEDIA_TOO_LARGE",
    });
    expect(media({ decoded: { width: 640, height: 480 } }).status).toBe("pass");
    expect(media({ decoded: { width: 640, height: 479 } })).toMatchObject({
      reasonCode: "MEDIA_DECODE_FAILED",
    });
    expect(media({ magicBytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]) })).toMatchObject({
      reasonCode: "MEDIA_TYPE_UNSUPPORTED",
    });
    expect(media({ declaredContentType: "image/png" })).toMatchObject({
      reasonCode: "MEDIA_TYPE_UNSUPPORTED",
    });
    expect(media({ decoded: null })).toMatchObject({ reasonCode: "MEDIA_DECODE_FAILED" });
  });

  it("U-CHK-02: replay maps a unique-violation to EVIDENCE_REPLAYED", () => {
    expect(checkReplay(true)).toMatchObject({ status: "fail", reasonCode: "EVIDENCE_REPLAYED" });
    expect(checkReplay(false).status).toBe("pass");
  });

  it("U-CHK-03: geofence distance exactly = radius passes; radius + 1 m fails (D4)", () => {
    const at = (m: number) => checkGeofence({ target, observed: { ...north(m), accuracyM: 5 } });
    expect(at(79.9).status).toBe("pass");
    expect(at(81)).toMatchObject({ status: "fail", reasonCode: "EVIDENCE_OUTSIDE_GEOFENCE" });
  });

  it("U-CHK-04: geofence accuracy exactly 100 m passes; 101 m fails", () => {
    expect(checkGeofence({ target, observed: { ...north(0), accuracyM: 100 } }).status).toBe("pass");
    expect(checkGeofence({ target, observed: { ...north(0), accuracyM: 101 } })).toMatchObject({
      reasonCode: "LOCATION_ACCURACY_TOO_LOW",
    });
  });

  const issued = new Date("2026-10-09T03:00:00Z");
  const fresh = (ageS: number, o: Partial<Parameters<typeof checkFreshness>[0]> = {}) =>
    checkFreshness({
      now: new Date(issued.getTime() + ageS * 1000),
      challengeIssuedAt: issued,
      storageObjectCreatedAt: new Date(issued.getTime() + 1000),
      clientTimestamp: null,
      freshnessMaxAgeS: 300,
      ...o,
    });

  it("U-CHK-05: freshness exactly max_age passes; +1 s is EVIDENCE_STALE", () => {
    expect(fresh(300).status).toBe("pass");
    expect(fresh(301)).toMatchObject({ status: "fail", reasonCode: "EVIDENCE_STALE" });
    expect(fresh(10, { storageObjectCreatedAt: new Date(issued.getTime() - 1000) })).toMatchObject({
      reasonCode: "EVIDENCE_STALE",
    });
  });

  it("U-CHK-06: client clock skew >= 120 s only adds risk flag clock_skew", () => {
    const r = fresh(30, { clientTimestamp: new Date(issued.getTime() + 30_000 - 200_000) });
    expect(r.status).toBe("pass");
    expect(r.riskFlags).toContain("clock_skew");
    expect(fresh(30, { clientTimestamp: new Date(issued.getTime() + 30_000) }).riskFlags).toBeUndefined();
  });

  it("U-CHK-07: distance + accuracy > radius only adds risk flag edge_of_geofence", () => {
    const r = checkGeofence({ target, observed: { ...north(70), accuracyM: 20 } });
    expect(r.status).toBe("pass");
    expect(r.riskFlags).toContain("edge_of_geofence");
  });

  it("U-CHK-08: runChecks stops at first fail and marks the rest not_run (REQ-X-V-101)", () => {
    let ranAfterFail = false;
    const out = runChecks(
      ["media_schema", "replay", "freshness", "geofence"],
      [
        () => media(),
        () => checkReplay(true),
        () => {
          ranAfterFail = true;
          return fresh(1);
        },
      ],
    );
    expect(out.map((o) => o.status)).toEqual(["pass", "fail", "not_run", "not_run"]);
    expect(ranAfterFail).toBe(false);
  });

  it("duplicate: Hamming <= 6 fails, > 6 passes", () => {
    const h = 0x0123456789abcdefn;
    expect(hamming64(h, h ^ 0b111111n)).toBe(6);
    expect(
      checkDuplicate({ dhash: h, candidates: [{ submissionId: "s", dhash: h ^ 0b111111n }] }),
    ).toMatchObject({
      reasonCode: "EVIDENCE_NEAR_DUPLICATE",
    });
    expect(
      checkDuplicate({ dhash: h, candidates: [{ submissionId: "s", dhash: h ^ 0b1111111n }] }).status,
    ).toBe("pass");
  });

  it("haversine: 0.001 deg latitude ≈ 111 m", () => {
    expect(haversineM({ lat: 35, lng: 139 }, { lat: 35.001, lng: 139 })).toBeCloseTo(111.2, 0);
  });
});
