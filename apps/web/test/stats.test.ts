// Public track record (05 §4.1): correct aggregates, nothing private in the output.
import { PublicStatsSchema } from "@proofmarket/core/schemas/api";
import { beforeEach, describe, expect, it } from "vitest";
import { handleFeature } from "../lib/handlers/operator";
import { handleCreate } from "../lib/handlers/requester";
import { tick } from "../lib/services/jobs";
import { publicStats } from "../lib/services/stats-service";
import { call, createBody, createTestApp, jsonReq, SHOP } from "./support/app";
import { onboardWorker, witness } from "./support/worker";

const secrets = { adminToken: "a".repeat(32), cronSecret: "c".repeat(32) };
let t: Awaited<ReturnType<typeof createTestApp>>;
let alice: string;
let bob: string;
beforeEach(async () => {
  t = await createTestApp();
  t.app.reviewer = t.reviewer;
  alice = (await onboardWorker(t, "alice")).token;
  bob = (await onboardWorker(t, "bob")).token;
});

const create = async (o: Record<string, unknown> = {}) => {
  const res = await call(
    (r) => handleCreate(t.app, r),
    jsonReq("POST", "/v1/verifications", {
      key: t.apiKey,
      body: createBody(t.principalId, o),
      idem: crypto.randomUUID(),
    }),
  );
  return ((await res.json()) as { verification_id: string }).verification_id;
};

describe("public stats", () => {
  it("is all zeros on an empty DB, with 14 days in the chart", async () => {
    const s = PublicStatsSchema.parse(await publicStats(t.app));
    expect(s.verifications).toEqual({ total: 0, completed: 0 });
    expect(s.paid_to_workers.amount).toBe("0");
    expect(s.median_seconds_to_result).toBeNull();
    expect(s.daily_completed).toHaveLength(14);
    expect(s.daily_completed.at(-1)).toEqual({ date: "2026-10-09", count: 0 });
    expect(s.recent_results).toEqual([]);
  });

  it("counts completed work, payouts, AI reviews and time to result; leaks nothing private", async () => {
    const question = "Is the bakery on the corner open?";
    const done1 = await create({ question });
    const done2 = await create({
      question,
      type: "CROWD_LEVEL",
      answer_schema: { type: "enum", values: ["EMPTY", "MODERATE", "CROWDED", "UNCLEAR"] },
    });
    const open = await create({ question });
    await tick(t.app); // fund all three

    t.advance(300_000);
    await witness(t, alice, done1, { answer: "OPEN" });
    t.advance(600_000);
    t.reviewer.next = { verdict: "uncertain", reason: "暗くて読めない", observed: "店の入口" };
    await witness(t, bob, done2, { answer: "MODERATE" });
    t.reviewer.next = { verdict: "fail", reason: "別の店", observed: "駐車場" };
    expect((await witness(t, bob, open, { answer: "OPEN" })).body).toMatchObject({ state: "INVALID" });
    await tick(t.app); // settle both

    const s = PublicStatsSchema.parse(await publicStats(t.app));
    expect(s.verifications).toEqual({ total: 3, completed: 2 });
    expect(s.workers_with_valid_submission).toBe(2);
    expect(s.requesters).toBe(1);
    expect(s.paid_to_workers).toEqual({ asset: "USDC", amount: "1", network: "solana-devnet" });
    expect(s.median_seconds_to_result).toBe(600); // 300 s and 900 s
    expect(s.ai_review).toEqual({ pass: 1, fail: 1, uncertain: 1 });
    expect(s.by_type).toEqual([
      { type: "PLACE_STATUS_VERIFICATION", total: 2, completed: 1 },
      { type: "CROWD_LEVEL", total: 1, completed: 1 },
    ]);
    expect(s.daily_completed.at(-1)).toEqual({ date: "2026-10-09", count: 2 });
    expect(s.recent_results).toHaveLength(2);
    expect(s.recent_results[0]).toMatchObject({ type: "CROWD_LEVEL", witnesses: 1, result_url: null });
    expect(s.recent_results[0]?.explorer_url).toMatch(
      /^https:\/\/explorer\.solana\.com\/tx\/.+cluster=devnet$/,
    );

    // Private fields: question, answers, location, worker IDs, payout addresses, requester names, task IDs.
    const text = JSON.stringify(s);
    for (const secret of [
      question,
      "MODERATE",
      '"OPEN"',
      String(SHOP.lat),
      "wkr_",
      "Wallet",
      "ver_",
      "Test Agent",
    ])
      expect(text).not.toContain(secret);
    expect(text).not.toContain("暗くて読めない");
  });

  it("links the result page only for featured results", async () => {
    const id = await create();
    await tick(t.app);
    await witness(t, alice, id);
    await tick(t.app);
    expect((await publicStats(t.app)).recent_results[0]?.result_url).toBeNull();
    await call(
      (r) => handleFeature(t.app, secrets, r, id),
      jsonReq("POST", "/x", { key: secrets.adminToken, body: { featured: true } }),
    );
    expect((await publicStats(t.app)).recent_results[0]?.result_url).toBe(`/r/${id}`);
  });
});
