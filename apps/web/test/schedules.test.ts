// Recurring checks (04 §3.23): due runs create normal tasks, once per run; failures and suspension stop them.
import { schema } from "@proofmarket/db";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { authenticateApiKey } from "../lib/auth/requester";
import { suspendCredential } from "../lib/services/admin-service";
import { createSchedule, runDueSchedules, stopSchedule } from "../lib/services/schedule-service";
import { createBody, createTestApp } from "./support/app";

let t: Awaited<ReturnType<typeof createTestApp>>; // starts Fri 2026-10-09 12:00 JST
beforeEach(async () => {
  t = await createTestApp();
});
const auth = () => authenticateApiKey(t.app, t.apiKey);
const request = () => {
  const { deadline: _d, ...rest } = createBody(t.principalId);
  return rest;
};
const body = (o: Record<string, unknown> = {}) => ({
  request: request(),
  deadline_minutes: 30,
  times_jst: ["12:30"],
  days_jst: [5],
  ...o,
});
const err = async (p: Promise<unknown>) => {
  try {
    await p;
    return null;
  } catch (e) {
    return (e as { code?: string }).code ?? String(e);
  }
};
const tasks = () => t.db.select().from(schema.verificationRequests);

describe("recurring checks", () => {
  it("creates one normal task at the due time, with the deadline window, and moves to the next week", async () => {
    const s = await createSchedule(t.app, await auth(), body());
    expect(s.next_run_at).toBe("2026-10-09T03:30:00.000Z");
    expect(await runDueSchedules(t.app)).toEqual([]); // not due yet
    t.advance(30 * 60_000);
    const [id] = await runDueSchedules(t.app);
    const [task] = await tasks();
    expect(task?.id).toBe(id);
    expect(task?.deadline.toISOString()).toBe("2026-10-09T04:00:00.000Z");
    const [row] = await t.db.select().from(schema.verificationSchedules);
    expect(row?.nextRunAt.toISOString()).toBe("2026-10-16T03:30:00.000Z");
    expect(await runDueSchedules(t.app)).toEqual([]);
  });

  it("a repeated run for the same scheduled time does not create a second task", async () => {
    await createSchedule(t.app, await auth(), body());
    t.advance(30 * 60_000);
    const [first] = await runDueSchedules(t.app);
    await t.db.update(schema.verificationSchedules).set({ nextRunAt: new Date("2026-10-09T03:30:00Z") });
    const [again] = await runDueSchedules(t.app);
    expect(again).toBe(first);
    expect(await tasks()).toHaveLength(1);
  });

  it("records failures and stops after three in a row", async () => {
    await createSchedule(
      t.app,
      await auth(),
      body({
        request: { ...request(), bounty: { asset: "USDC", amount: "5", network: "solana-devnet" } },
        times_jst: ["12:30", "13:00", "13:30"],
      }),
    );
    await t.db.update(schema.requesterCredentials).set({ maxTaskAmount: "1" });
    for (let i = 0; i < 3; i++) {
      t.advance(30 * 60_000);
      expect(await runDueSchedules(t.app)).toEqual([]);
    }
    const [row] = await t.db.select().from(schema.verificationSchedules);
    expect(row).toMatchObject({
      active: false,
      consecutiveFailures: 3,
      lastError: "TASK_AMOUNT_LIMIT_EXCEEDED",
    });
  });

  it("stops when the API key is suspended", async () => {
    await createSchedule(t.app, await auth(), body());
    await suspendCredential(t.db, t.credentialId, "test");
    t.advance(30 * 60_000);
    await runDueSchedules(t.app);
    const [row] = await t.db.select().from(schema.verificationSchedules);
    expect(row).toMatchObject({ active: false, lastError: "CREDENTIAL_SUSPENDED" });
  });

  it("validates up front, caps active schedules, and can be stopped by its owner", async () => {
    const a = await auth();
    expect(await err(createSchedule(t.app, a, body({ times_jst: ["25:00"] })))).toBe("VALIDATION_FAILED");
    expect(
      await err(createSchedule(t.app, a, body({ request: { ...request(), type: "QUEUE_LENGTH" } }))),
    ).toBe("UNSUPPORTED_TASK_TYPE");
    expect(
      await err(createSchedule(t.app, a, body({ request: { ...request(), question: "誰々の後をつけて" } }))),
    ).toBe("TASK_POLICY_VIOLATION");
    const ids = [];
    for (let i = 0; i < 10; i++) ids.push((await createSchedule(t.app, a, body())).schedule_id);
    expect(await err(createSchedule(t.app, a, body()))).toBe("VALIDATION_FAILED");
    const stopped = await stopSchedule(t.app, a, ids[0] ?? "");
    expect(stopped).toMatchObject({ active: false, next_run_at: null });
    const [row] = await t.db
      .select()
      .from(schema.verificationSchedules)
      .where(eq(schema.verificationSchedules.id, ids[0] ?? ""));
    expect(row?.active).toBe(false);
  });
});
