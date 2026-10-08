// 13 §9 PR 7: coarse public places and the location commitment.
import { describe, expect, it } from "vitest";
import {
  COARSE_PRECISION_M,
  coarseLocation,
  geohashCenter,
  geohashEncode,
  publicLocation,
} from "../src/domain/location-privacy.ts";
import { locationCommitment } from "../src/evidence/bundle.ts";
import { haversineM } from "../src/verification/checks.ts";

describe("geohash", () => {
  it("matches known values", () => {
    expect(geohashEncode(57.64911, 10.40744, 11)).toBe("u4pruydqqvj"); // the Wikipedia example
    expect(geohashEncode(35.6595, 139.7005)).toBe("xn76fg"); // Shibuya
    expect(geohashEncode(35.6812, 139.7671)).toBe("xn76ur"); // Tokyo Station
    expect(geohashEncode(-33.8688, 151.2093, 5)).toBe("r3gx2");
  });

  it("decodes to the centre of the cell, which encodes back to the same cell", () => {
    const c = geohashCenter("xn76fg");
    expect(geohashEncode(c.lat, c.lng)).toBe("xn76fg");
    expect(c).toEqual({ lat: 35.658875, lng: 139.696655 });
    expect(() => geohashCenter("xn7a")).toThrow();
  });
});

describe("coarseLocation", () => {
  it("is the cell's centre, within the stated precision of the real place", () => {
    const c = coarseLocation(35.6595, 139.7005);
    expect(c).toEqual({ ...geohashCenter("xn76fg"), precision_m: COARSE_PRECISION_M });
    expect(haversineM({ lat: 35.6595, lng: 139.7005 }, c)).toBeLessThan(COARSE_PRECISION_M / 2);
  });

  it("gives every point in a cell the same public place", () => {
    expect(coarseLocation(35.6595, 139.7005)).toEqual(coarseLocation(35.6601, 139.7013));
  });

  it("publicLocation leaves exact places alone", () => {
    expect(publicLocation(35.6595, 139.7005, "exact")).toEqual({
      location: { lat: 35.6595, lng: 139.7005 },
      location_precision_m: null,
    });
    expect(publicLocation(35.6595, 139.7005, "coarse").location_precision_m).toBe(1200);
  });
});

describe("locationCommitment", () => {
  it("is SHA-256 of the domain, the place to 6 decimals and the salt", async () => {
    const { createHash } = await import("node:crypto");
    const want = createHash("sha256")
      .update("proofmarket:location:v1:35.659500,139.700500:abc")
      .digest("hex");
    expect(locationCommitment(35.6595, 139.7005, "abc")).toBe(`sha256:${want}`);
    expect(locationCommitment(35.6595, 139.7005, "abd")).not.toBe(
      locationCommitment(35.6595, 139.7005, "abc"),
    );
  });
});
