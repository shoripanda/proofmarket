import { describe, expect, it } from "vitest";
import {
  bountyRisesUntil,
  currentBounty,
  fundedPerWitnessMicro,
  type RisingBounty,
  settledPerWitnessMicro,
} from "../src/index.ts";

const t0 = new Date("2026-10-08T00:00:00Z");
const at = (min: number) => new Date(t0.getTime() + min * 60_000);
const rising: RisingBounty = {
  amount: "0.3",
  maxAmount: "0.6",
  rampMinutes: 60,
  finalAmount: null,
  createdAt: t0,
};

describe("rising bounty (13 §1)", () => {
  it("climbs in a straight line and stops at the ceiling", () => {
    expect(currentBounty(rising, at(0))).toBe("0.3");
    expect(currentBounty(rising, at(24))).toBe("0.42");
    expect(currentBounty(rising, at(60))).toBe("0.6");
    expect(currentBounty(rising, at(600))).toBe("0.6");
    expect(currentBounty(rising, at(-5))).toBe("0.3");
  });

  it("floors to 6 decimals", () => {
    const b = { ...rising, amount: "0.1", maxAmount: "0.2", rampMinutes: 30 };
    expect(currentBounty(b, new Date(t0.getTime() + 1_000))).toBe("0.100055");
  });

  it("is the fixed amount once claimed, and fixed bounties never move", () => {
    expect(currentBounty({ ...rising, finalAmount: "0.45" }, at(59))).toBe("0.45");
    expect(currentBounty({ ...rising, maxAmount: null, rampMinutes: null }, at(59))).toBe("0.3");
    expect(bountyRisesUntil(rising)).toEqual(at(60));
    expect(bountyRisesUntil({ ...rising, finalAmount: "0.45" })).toBeNull();
    expect(bountyRisesUntil({ ...rising, maxAmount: null })).toBeNull();
  });

  it("funds the ceiling and settles the fixed amount", () => {
    expect(fundedPerWitnessMicro(rising)).toBe(600_000n);
    expect(settledPerWitnessMicro(rising)).toBe(600_000n);
    expect(settledPerWitnessMicro({ ...rising, finalAmount: "0.45" })).toBe(450_000n);
    expect(fundedPerWitnessMicro({ amount: "0.3", maxAmount: null })).toBe(300_000n);
  });
});
