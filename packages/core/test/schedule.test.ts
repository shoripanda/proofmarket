// Recurring check times (04 §3.23).
import { describe, expect, it } from "vitest";
import { isHhmm, nextRunAt } from "../src/domain/schedule.ts";

// 2026-10-09 is a Friday. 03:00Z = 12:00 JST.
const FRI_NOON_JST = new Date("2026-10-09T03:00:00Z");

describe("nextRunAt", () => {
  it("picks a later time the same day", () => {
    expect(nextRunAt(["09:00", "15:30"], [5], FRI_NOON_JST).toISOString()).toBe("2026-10-09T06:30:00.000Z");
  });

  it("skips to the next allowed weekday (weekdays only: Fri noon -> Mon 09:00)", () => {
    expect(nextRunAt(["09:00"], [1, 2, 3, 4, 5], FRI_NOON_JST).toISOString()).toBe(
      "2026-10-12T00:00:00.000Z",
    );
  });

  it("is strictly after `from` and handles the JST date line", () => {
    const at = new Date("2026-10-09T00:00:00Z"); // Fri 09:00 JST exactly
    expect(nextRunAt(["09:00"], [5], at).toISOString()).toBe("2026-10-16T00:00:00.000Z");
    const lateUtc = new Date("2026-10-09T16:00:00Z"); // Sat 01:00 JST
    expect(nextRunAt(["00:30"], [0], lateUtc).toISOString()).toBe("2026-10-10T15:30:00.000Z"); // Sun 00:30 JST
  });

  it("validates HH:MM", () => {
    expect(isHhmm("09:00")).toBe(true);
    expect(isHhmm("24:00")).toBe(false);
    expect(isHhmm("9:00")).toBe(false);
  });
});
