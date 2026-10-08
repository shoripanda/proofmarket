// Recurring checks (04 §3.23): due runs create normal tasks, once per run; failures and suspension stop them.
import { schema } from "@proofmarket/db";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { authenticateApiKey } from "../lib/auth/requester";
import { setAllowedTaskTypes, suspendCredential } from "../lib/services/admin-service";
import {
  createSchedule,
  runDueSchedules,
  settleWatches,
  stopSchedule,
} from "../lib/services/schedule-service";
import { createBody, createTestApp } from "./support/app";
import { onboardWorker, openCreated, witness } from "./support/worker";

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

describe("watches (01 §4.23)", () => {
  const watch = (o: Record<string, unknown> = {}) => ({
    request: request(),
    deadline_minutes: 30,
    every_minutes: 60,
    stop_when: { answer: "OPEN" },
    ...o,
  });

  it("validates the mode and the stop condition against the answer schema", async () => {
    const a = await auth();
    expect(await err(createSchedule(t.app, a, { ...watch(), times_jst: ["12:30"], days_jst: [5] }))).toBe(
      "VALIDATION_FAILED",
    );
    expect(await err(createSchedule(t.app, a, { ...watch(), every_minutes: undefined }))).toBe(
      "VALIDATION_FAILED",
    );
    expect(await err(createSchedule(t.app, a, watch({ stop_when: { answer: "IN_STOCK" } })))).toBe(
      "VALIDATION_FAILED",
    );
    expect(await err(createSchedule(t.app, a, watch({ stop_when: { number: { min: 1 } } })))).toBe(
      "VALIDATION_FAILED",
    );
    const text = { ...request(), type: "SIGN_TRANSCRIPTION", answer_schema: { type: "text" } };
    expect(await err(createSchedule(t.app, a, watch({ request: text })))).toBe("VALIDATION_FAILED");
  });

  it("runs right away, then every interval, and stops with condition_met when a VERIFIED answer matches", async () => {
    const alice = (await onboardWorker(t, "alice")).token;
    const s = await createSchedule(t.app, await auth(), watch({ stop_when: { answer_in: ["OPEN"] } }));
    expect(s).toMatchObject({
      every_minutes: 60,
      runs: 0,
      stopped_reason: null,
      next_run_at: t.app.now().toISOString(),
    });
    const [first] = await runDueSchedules(t.app);
    expect(first).toBeDefined();
    await openCreated(t, first as string);
    // a CLOSED answer does not match: the watch keeps going
    await witness(t, alice, first as string, { answer: "CLOSED" });
    expect(await settleWatches(t.app)).toEqual([]);
    t.advance(60 * 60_000);
    const [second] = await runDueSchedules(t.app);
    expect(second).toBeDefined();
    expect(second).not.toBe(first);
    await openCreated(t, second as string);
    const bob = (await onboardWorker(t, "bob")).token;
    await witness(t, bob, second as string, { answer: "OPEN" });
    expect(await settleWatches(t.app)).toEqual([s.schedule_id]);
    t.advance(60 * 60_000);
    expect(await runDueSchedules(t.app)).toEqual([]); // stopped: no third run
    const [row] = await t.db.select().from(schema.verificationSchedules);
    expect(row).toMatchObject({
      active: false,
      runs: 2,
      stoppedReason: "condition_met",
      matchedVerificationId: second,
    });
  });

  it("number conditions, max_runs and a manual stop record their reason", async () => {
    const a = await auth();
    const priced = { ...request(), type: "PRICE_CHECK", answer_schema: { type: "number", unit: "yen" } };
    const s = await createSchedule(
      t.app,
      a,
      watch({ request: priced, stop_when: { number: { max: 300 } }, max_runs: 1 }),
    );
    expect(s.stop_when).toEqual({ number: { max: 300 } });
    const [id] = await runDueSchedules(t.app);
    expect(id).toBeDefined();
    let [row] = await t.db.select().from(schema.verificationSchedules);
    expect(row).toMatchObject({ active: false, runs: 1, stoppedReason: "max_runs" });
    const other = await createSchedule(t.app, a, watch({ every_minutes: 15 }));
    const stopped = await stopSchedule(t.app, a, other.schedule_id);
    expect(stopped).toMatchObject({ active: false, stopped_reason: "stopped" });
    [row] = await t.db
      .select()
      .from(schema.verificationSchedules)
      .where(eq(schema.verificationSchedules.id, s.schedule_id));
    expect(row?.stoppedReason).toBe("max_runs");
  });
});

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
    await t.db.delete(schema.requesterLedger); // nothing left to pay with
    for (let i = 0; i < 3; i++) {
      t.advance(30 * 60_000);
      expect(await runDueSchedules(t.app)).toEqual([]);
    }
    const [row] = await t.db.select().from(schema.verificationSchedules);
    expect(row).toMatchObject({
      active: false,
      consecutiveFailures: 3,
      lastError: "INSUFFICIENT_BALANCE",
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
    await setAllowedTaskTypes(t.db, t.credentialId, ["PLACE_STATUS_VERIFICATION"], "test");
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
