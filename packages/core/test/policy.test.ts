// 09-test-plan.md §3.1 — U-POL-01..13: each rule rejects ja/en examples and allows a near miss.
import { describe, expect, it } from "vitest";
import { evaluateQuestion, inBBox, type PolicyRuleId, parseBBox } from "../src/policy/rules.ts";

const CASES: [string, PolicyRuleId, string[], string[]][] = [
  ["U-POL-01", "TYPE_ALLOWLIST", [], []], // enforced by the request schema (type literal), see I-CRT tests
  [
    "U-POL-02",
    "PERSON_TRACKING",
    ["山田さんが店にいるか張り込みで確認", "Check the whereabouts of the owner"],
    ["Is the shop open right now?"],
  ],
  [
    "U-POL-03",
    "PRIVATE_RESIDENCE",
    ["この住所の自宅に明かりがついているか", "Is his house lit?"],
    ["Is the house-shaped sign lit?"],
  ],
  [
    "U-POL-04",
    "TRESPASS",
    ["裏口から中に入って確認して", "Sneak in through the back door"],
    ["Is the front door open?"],
  ],
  [
    "U-POL-05",
    "WEAPONS_DRUGS",
    ["大麻が売られているか", "Are they selling guns?"],
    ["Is the drugstore open?", "営業中のドラッグストアですか"],
  ],
  [
    "U-POL-06",
    "SEXUAL",
    ["風俗店が開いているか", "Is the escort agency open?"],
    ["Is the Sussex Cafe open?"],
  ],
  [
    "U-POL-07",
    "PROFESSIONAL_JUDGMENT",
    ["この株は買うべきか店頭で判断", "Should I buy this stock?"],
    ["Is the bank branch open?"],
  ],
  ["U-POL-08", "HARASSMENT", ["店長を脅して", "Confront the manager"], ["Is the manager's notice posted?"]],
  [
    "U-POL-09",
    "DANGER",
    ["台風の中で看板を確認", "Check from the rooftop"],
    ["Is the top-floor bar sign lit?"],
  ],
  [
    "U-POL-10",
    "EVASION",
    ["警察に見つからないように", "Avoid the cameras on the way"],
    ["Is the camera shop open?"],
  ],
  ["U-POL-11", "MINORS", ["小学生が何人いるか", "How many kids are inside?"], ["Is the kidney clinic open?"]],
  [
    "U-POL-12",
    "COVERT_RECORDING",
    ["気づかれずに店員を撮影", "Secretly film the cashier"],
    ["Is the secret menu board posted?"],
  ],
  [
    "U-POL-13",
    "IMPERSONATION",
    ["客のふりをして値段を聞く", "Pose as a customer"],
    ["Is the customer service desk open?"],
  ],
];

describe("policy rules", () => {
  for (const [id, rule, banned, allowed] of CASES) {
    it(`${id}: ${rule} rejects ja/en examples and allows a near miss`, () => {
      for (const q of banned) expect(evaluateQuestion(q), q).toEqual({ ok: false, ruleId: rule });
      for (const q of allowed) expect(evaluateQuestion(q), q).toEqual({ ok: true });
    });
  }

  it("normalizes full-width input (NFKC)", () => {
    expect(evaluateQuestion("ＧＵＮＳ for sale?")).toEqual({ ok: false, ruleId: "WEAPONS_DRUGS" });
  });

  it("bbox parse and containment", () => {
    const b = parseBBox("35.60,139.65,35.72,139.78");
    expect(inBBox({ lat: 35.66, lng: 139.7 }, b)).toBe(true);
    expect(inBBox({ lat: 35.8, lng: 139.7 }, b)).toBe(false);
    expect(() => parseBBox("1,2,3")).toThrow();
    expect(() => parseBBox("35.7,139,35.6,140")).toThrow();
  });
});
