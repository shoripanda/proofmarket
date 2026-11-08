// pg_cron calls the tick only when proofmarket_tick_due() says so (migration 0038). An idle minute must answer
// false (or Vercel Hobby runs out of CPU again, 2026-11-06), and any real work must answer true.
import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { handleCreate } from "../lib/handlers/requester";
import { tick, tickDue } from "../lib/services/jobs";
import { call, createBody, createTestApp, jsonReq } from "./support/app";

let t: Awaited<ReturnType<typeof createTestApp>>;
beforeEach(async () => {
  t = await createTestApp();
});

const MIN = 60_000;
/** Long enough that the periodic pass never fires inside a test. */
const NO_IDLE = 24 * 60;

async function createTask() {
  const res = await call(
    (r) => handleCreate(t.app, r),
    jsonReq("POST", "/v1/verifications", {
      key: t.apiKey,
      body: createBody(t.principalId),
      idem: crypto.randomUUID(),
    }),
  );
  expect(res.status).toBe(201);
}

describe("proofmarket_tick_due", () => {
  it("is true before any tick ran, false once the tick has nothing left", async () => {
    expect(await tickDue(t.app)).toBe(true);
    await tick(t.app);
    expect(await tickDue(t.app)).toBe(false);
  });

  it("runs the periodic pass when no tick ran for the idle window", async () => {
    await tick(t.app);
    t.advance(14 * MIN);
    expect(await tickDue(t.app)).toBe(false);
    t.advance(2 * MIN);
    expect(await tickDue(t.app)).toBe(true);
  });

  it("is true for a due job and for a passed deadline", async () => {
    await tick(t.app);
    await createTask(); // queues FUND_TASK; the route only kicks it after the response
    expect(await tickDue(t.app, NO_IDLE)).toBe(true);
    await tick(t.app);
    expect(await tickDue(t.app, NO_IDLE)).toBe(false);
    // createBody's deadline is 04:00Z; the clock starts at 03:00Z
    t.setNow(new Date("2026-10-09T04:01:00Z"));
    expect(await tickDue(t.app, NO_IDLE)).toBe(true);
    await tick(t.app);
    expect(await tickDue(t.app, NO_IDLE)).toBe(false);
  }, 30_000); // three ticks; slow on a busy laptop

  it("answers true when its own query fails, so a broken gate never stops the tick", async () => {
    await tick(t.app);
    await t.db.execute(sql`alter table tick_runs rename to tick_runs_gone`);
    expect(await tickDue(t.app)).toBe(true);
  });
});
