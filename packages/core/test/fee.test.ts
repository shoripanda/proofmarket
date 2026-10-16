import { describe, expect, it } from "vitest";
import { PLATFORM_FEE_BPS, platformFeeMicro } from "../src/domain/fee.ts";

describe("platformFeeMicro (13 §6.1)", () => {
  it("is 15% of the base", () => {
    expect(PLATFORM_FEE_BPS).toBe(1500);
    expect(platformFeeMicro(1_000_000n, PLATFORM_FEE_BPS)).toBe(150_000n);
    expect(platformFeeMicro(300_000n, PLATFORM_FEE_BPS)).toBe(45_000n);
  });
  it("rounds up to the smallest unit", () => {
    expect(platformFeeMicro(1n, PLATFORM_FEE_BPS)).toBe(1n);
    expect(platformFeeMicro(7n, PLATFORM_FEE_BPS)).toBe(2n); // 1.05 -> 2
    expect(platformFeeMicro(20n, PLATFORM_FEE_BPS)).toBe(3n); // exactly 3
  });
  it("is zero for a zero rate or base", () => {
    expect(platformFeeMicro(1_000_000n, 0)).toBe(0n);
    expect(platformFeeMicro(0n, PLATFORM_FEE_BPS)).toBe(0n);
  });
});
