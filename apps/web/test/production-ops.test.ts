// Production housekeeping: growing bookkeeping tables are trimmed daily, and /v1/health/ready tells an outside
// monitor whether the minute tick keeps up.
import { schema } from "@proofmarket/db";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { handleCreate } from "../lib/handlers/requester";
import { readiness, tick } from "../lib/services/jobs";
import { purgeBookkeeping } from "../lib/services/retention";
import { call, createBody, createTestApp, jsonReq } from "./support/app";

let t: Awaited<ReturnType<typeof createTestApp>>;
beforeEach(async () => {
  t = await createTestApp();
});

const DAY = 86_400_000;

describe("purgeBookkeeping", () => {
  it("drops old rate-limit windows and idempotency keys, keeps recent ones", async () => {
    const now = t.app.now();
    await t.db.insert(schema.rateLimitCounters).values([
      { scope: "old", windowStart: new Date(now.getTime() - 3 * DAY), count: 1 },
      { scope: "today", windowStart: new Date(now.getTime() - DAY / 2), count: 1 },
    ]);
    // rows the test app's own setup created are not part of this check
    await t.db.delete(schema.idempotencyKeys);
    const old = new Date(now.getTime() - 25 * 3_600_000);
    const h = Buffer.from("h");
    await t.db.insert(schema.idempotencyKeys).values([
      { scope: "old", endpoint: "e", keyHash: h, requestHash: h, state: "COMPLETED", createdAt: old },
      { scope: "new", endpoint: "e", keyHash: h, requestHash: h, state: "COMPLETED", createdAt: now },
    ]);
    const r = await purgeBookkeeping(t.db, now);
    expect(r).toMatchObject({ rateLimits: 1, idempotency: 1 });
    expect((await t.db.select().from(schema.rateLimitCounters)).map((x) => x.scope)).toEqual(["today"]);
    expect((await t.db.select().from(schema.idempotencyKeys)).map((x) => x.scope)).toEqual(["new"]);
  });
});

describe("readiness", () => {
  it("is ok on a fresh system and after a tick has drained the jobs", async () => {
    expect(await readiness(t.app)).toEqual({
      ok: true,
      checks: { database: true, jobs_draining: true, deadlines_on_time: true, no_dead_jobs: true },
      last_tick: null,
    });
  });

  it("reports how long the last tick took, step by step (docs/architecture 06 §4.3)", async () => {
    const r = await tick(t.app);
    expect(Object.keys(r.steps)).toEqual([
      "stale_reviews",
      "optimistic",
      "deadlines",
      "expiry",
      "purge_job",
      "schedules",
      "market_tasks",
      "deposits",
      "jobs",
      "warnings",
    ]);
    const { last_tick } = await readiness(t.app);
    expect(last_tick).toMatchObject({ jobs_run: expect.any(Number), failed: [], steps: r.steps });
    expect(last_tick?.duration_ms).toBeGreaterThanOrEqual(0);
    expect(last_tick?.started_at).toBe(t.app.now().toISOString());
  });

  it("flags jobs left undrained and deadlines left unhandled when the tick stops", async () => {
    await call(
      (r) => handleCreate(t.app, r),
      jsonReq("POST", "/v1/verifications", {
        key: t.apiKey,
        body: createBody(t.principalId),
        idem: crypto.randomUUID(),
      }),
    );
    // the tick stops before funding: the FUND_TASK job is left overdue
    t.advance(10 * 60_000);
    expect((await readiness(t.app)).checks.jobs_draining).toBe(false);
    await tick(t.app); // funded, the task is OPEN
    expect((await readiness(t.app)).ok).toBe(true);
    // then no tick for two days: the deadline passes unhandled
    t.advance(2 * DAY);
    expect((await readiness(t.app)).checks.deadlines_on_time).toBe(false);
    await tick(t.app);
    expect((await readiness(t.app)).checks.deadlines_on_time).toBe(true);
  });

  it("flags DEAD jobs", async () => {
    await t.db
      .insert(schema.outboxJobs)
      .values({ kind: "PURGE_EVIDENCE", dedupeKey: "dead-1", payload: {}, state: "DEAD" });
    expect((await readiness(t.app)).checks.no_dead_jobs).toBe(false);
  });
});

describe("tick warnings (08 §5)", () => {
  it("counts DEAD jobs and payments stuck for over 10 minutes", async () => {
    expect((await tick(t.app)).warnings).toEqual({
      dead_jobs: 0,
      stuck_payments: 0,
      operator_sol_low: false,
      treasury_over_cap: false,
    });
    await t.db
      .insert(schema.outboxJobs)
      .values({ kind: "PURGE_EVIDENCE", dedupeKey: "dead-2", payload: {}, state: "DEAD" });
    const res = await call(
      (r) => handleCreate(t.app, r),
      jsonReq("POST", "/v1/verifications", {
        key: t.apiKey,
        body: createBody(t.principalId),
        idem: crypto.randomUUID(),
      }),
    );
    const { verification_id: id } = (await res.json()) as { verification_id: string };
    await tick(t.app); // FUND_TASK runs on the fake chain and records its payment
    // backdate that payment and leave it unconfirmed
    await t.db
      .update(schema.paymentRecords)
      .set({ status: "PENDING", createdAt: new Date(t.app.now().getTime() - 11 * 60_000) })
      .where(eq(schema.paymentRecords.verificationId, id));
    expect((await tick(t.app)).warnings).toEqual({
      dead_jobs: 1,
      stuck_payments: 1,
      operator_sol_low: false,
      treasury_over_cap: false,
    });
  });

  it("warns when the operator wallet holds over 1.5x TREASURY_MAX_USDC or TREASURY_MAX_SOL (15 §4.2)", async () => {
    // the fake chain reports 1,000 USDC in the treasury and 5 SOL in the operator wallet
    t.app.config.treasuryMax = { usdcMicro: 600_000_000n, lamports: null }; // 1,000 > 1.5 × 600
    expect((await tick(t.app)).warnings?.treasury_over_cap).toBe(true);
    t.app.config.treasuryMax = { usdcMicro: 1_000_000_000n, lamports: 2_000_000_000n }; // 5 SOL > 1.5 × 2
    expect((await tick(t.app)).warnings?.treasury_over_cap).toBe(true);
    t.app.config.treasuryMax = { usdcMicro: 1_000_000_000n, lamports: 5_000_000_000n }; // exactly at cap
    expect((await tick(t.app)).warnings?.treasury_over_cap).toBe(false);
  });
});
