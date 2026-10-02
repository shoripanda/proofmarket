import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { decryptLocation, encryptLocation, safeEqual, witnessRef } from "../lib/services/crypto";

describe("crypto", () => {
  it("location round-trips and ciphertext differs per call", () => {
    const key = randomBytes(32);
    const a = encryptLocation(key, 35.6595, 139.7005);
    expect(decryptLocation(key, a)).toEqual({ lat: 35.6595, lng: 139.7005 });
    expect(encryptLocation(key, 35.6595, 139.7005).equals(a)).toBe(false);
    expect(() => decryptLocation(randomBytes(32), a)).toThrow();
  });

  it("witness_ref differs per task for the same worker (07 §5.1)", () => {
    const a = witnessRef("salt-salt-salt-salt", "wkr_1", "ver_1");
    expect(a).toMatch(/^hmac:[0-9a-f]{64}$/);
    expect(witnessRef("salt-salt-salt-salt", "wkr_1", "ver_2")).not.toBe(a);
  });

  it("safeEqual", () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
  });
});
