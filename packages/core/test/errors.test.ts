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
