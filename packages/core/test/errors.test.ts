import { describe, expect, it } from "vitest";
import { ApiError, ERROR_CATALOG, type ErrorCode } from "../src/errors.ts";

describe("error catalog (05 §8)", () => {
  it("U-ERR-01: every code renders { code, message, retryable, details } without a stack", () => {
    for (const code of Object.keys(ERROR_CATALOG) as ErrorCode[]) {
      const body = new ApiError(code).toBody();
      expect(Object.keys(body.error).sort()).toEqual(["code", "details", "message", "retryable"]);
      expect(JSON.stringify(body)).not.toMatch(/\bat .*\(.*:\d+:\d+\)/);
    }
  });
});

import { fromMicro, toMicro } from "../src/domain/money.ts";

describe("money", () => {
  it("converts decimal strings to base units and back without floats", () => {
    expect(toMicro("0.50")).toBe(500_000n);
    expect(toMicro("12.345678")).toBe(12_345_678n);
    expect(toMicro("-1.5")).toBe(-1_500_000n);
    expect(fromMicro(500_000n)).toBe("0.5");
    expect(fromMicro(3_000_000n)).toBe("3");
    expect(fromMicro(-1_500_000n)).toBe("-1.5");
    expect(() => toMicro("abc")).toThrow();
  });
});
