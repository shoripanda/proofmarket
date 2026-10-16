// General tasks (docs/architecture 13): apply, accept, deliver, release; the 24 h rule (D2); reject, cancel and
// expiry hand the money back; one on-chain Task per seat. 15% fee on top, kept only for released seats.
import { PLATFORM_FEE_BPS } from "@proofmarket/core";
import { schema } from "@proofmarket/db";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import {
  handleCancelTask,
  handleCreateTask,
  handleDecideApplication,
  handleDecideSeat,
  handleGetTask,
  handleListApplications,
  handleWorkerApply,
  handleWorkerDeliver,
  handleWorkerListMarketTasks,
  handleWorkerListSeats,
} from "../lib/handlers/market-tasks";
import { setFlag } from "../lib/services/admin-service";
import { __setWebhookDeps, tick } from "../lib/services/jobs";
import { registerWebhook, verifyWebhook } from "../lib/services/webhook-service";
import { call, createTestApp, jsonReq } from "./support/app";
import { onboardWorker } from "./support/worker";

let t: Awaited<ReturnType<typeof createTestApp>>;
let alice: string;
let bob: string;
const H = 3600_000;

beforeEach(async () => {
  t = await createTestApp();
  t.app.config.platformFeeBps = PLATFORM_FEE_BPS;
  await setFlag(t.db, "tasks_enabled", true, "test");
  alice = (await onboardWorker(t, "alice")).token;
  bob = (await onboardWorker(t, "bob")).token;
});

const taskBody = (o: Record<string, unknown> = {}) => ({
  title: "Photograph the opening hours sign",
  description: "Go to the bakery near Shibuya station and photograph the opening hours sign at the door.",
  completion_criteria: "One sharp photo where every line of the sign can be read",
  evidence_types: ["photo", "text"],
  area: "Shibuya, Tokyo",
  price: { asset: "USDC", amount: "1", network: "solana-devnet" },
  seats: 2,
  deadline: "2026-10-12T03:00:00Z",
  application_questions: [{ id: "eta", label: "When can you go?", required: true }],
  ...o,
});

// biome-ignore lint/suspicious/noExplicitAny: test convenience
const json = async (res: Response): Promise<any> => res.json();
const create = async (o: Record<string, unknown> = {}) => {
  const res = await call(
    (r) => handleCreateTask(t.app, r),
    jsonReq("POST", "/v1/tasks", { key: t.apiKey, body: taskBody(o), idem: crypto.randomUUID() }),
  );
  expect(res.status).toBe(201);
  return (await json(res)).task_id as string;
};
const get = async (id: string) =>
  json(await call((r) => handleGetTask(t.app, r, id), jsonReq("GET", `/v1/tasks/${id}`, { key: t.apiKey })));
const apply = (token: string, id: string, answers: Record<string, string> = { eta: "this afternoon" }) =>
  call(
    (r) => handleWorkerApply(t.app, r, id),
    jsonReq("POST", `/v1/worker/market-tasks/${id}/apply`, { key: token, body: { answers } }),
  );
const applications = async (id: string) =>
  (
    await json(
      await call(
        (r) => handleListApplications(t.app, r, id),
        jsonReq("GET", `/v1/tasks/${id}/applications`, { key: t.apiKey }),
      ),
    )
  ).applications as { application_id: string; state: string }[];
const decideApp = (id: string, appId: string, action: string, body: unknown = {}) =>
  call(
    (r) => handleDecideApplication(t.app, r, id, appId, action),
    jsonReq("POST", `/v1/tasks/${id}/applications/${appId}/${action}`, { key: t.apiKey, body }),
  );
const decideSeat = (id: string, seatId: string, action: string, body: unknown = {}) =>
  call(
    (r) => handleDecideSeat(t.app, r, id, seatId, action),
    jsonReq("POST", `/v1/tasks/${id}/seats/${seatId}/${action}`, { key: t.apiKey, body }),
  );
const deliver = (token: string, seatId: string, body = "Photo taken at 14:05; the sign says 8:00-18:00.") =>
  call(
    (r) => handleWorkerDeliver(t.app, r, seatId),
    jsonReq("POST", `/v1/worker/market-seats/${seatId}/deliver`, { key: token, body: { body } }),
  );
const mySeats = async (token: string) =>
  (
    await json(
      await call(
        (r) => handleWorkerListSeats(t.app, r),
        jsonReq("GET", "/v1/worker/market-seats", { key: token }),
      ),
    )
  ).seats as { seat_id: string; state: string }[];
const balance = async () =>
  (
    await t.db
      .select()
      .from(schema.requesterLedger)
      .where(eq(schema.requesterLedger.credentialId, t.credentialId))
  ).reduce((a, l) => a + Number(l.amount), 0);
const taskLedger = async (id: string) =>
  (await t.db.select().from(schema.requesterLedger).where(eq(schema.requesterLedger.marketTaskId, id)))
    .map((l) => `${l.entryType}:${Number(l.amount)}`)
    .sort();
const chainStatuses = () => [...t.chain.tasks.values()].map((x) => x.status).sort();

/** Alice applies, gets accepted, and the seat is funded on chain. Returns her seat id. */
async function hire(id: string, token = alice): Promise<string> {
  expect((await apply(token, id)).status).toBe(200);
  const pending = (await applications(id)).filter((a) => a.state === "pending");
  const a = pending.at(-1);
  expect((await decideApp(id, a?.application_id ?? "", "accept")).status).toBe(200);
  await tick(t.app); // FUND_SEAT
  const seat = (await mySeats(token))[0];
  return seat?.seat_id ?? "";
}

describe("general tasks (13)", () => {
  it("stays closed until the operator turns on tasks_enabled", async () => {
    await setFlag(t.db, "tasks_enabled", false, "test");
    const res = await call(
      (r) => handleCreateTask(t.app, r),
      jsonReq("POST", "/v1/tasks", { key: t.apiKey, body: taskBody(), idem: "k1" }),
    );
    expect(res.status).toBe(404);
    expect((await json(res)).error.code).toBe("TASKS_NOT_ENABLED");
  });

  it("dry run shows price, 15% fee and total; the create reserves exactly that", async () => {
    const dry = await call(
      (r) => handleCreateTask(t.app, r),
      jsonReq("POST", "/v1/tasks", { key: t.apiKey, body: taskBody({ dry_run: true }) }),
    );
    expect(dry.status).toBe(200);
    expect(await json(dry)).toMatchObject({
      dry_run: true,
      cost: {
        price_per_seat: "1",
        seats: 2,
        platform_fee: { rate_bps: 1500, per_seat: "0.15" },
        total: "2.3",
      },
      balance_after: "7.7",
    });
    const before = await balance();
    const id = await create();
    expect(await taskLedger(id)).toEqual(["RESERVE:-2.3"]);
    expect(await balance()).toBeCloseTo(before - 2.3, 6);
    expect((await get(id)).status).toBe("OPEN");
  });

  it("apply → accept → funded seat → deliver → release: the worker is paid on chain and the fee is kept", async () => {
    const id = await create();
    const listed = await json(
      await call(
        (r) => handleWorkerListMarketTasks(t.app, r),
        jsonReq("GET", "/v1/worker/market-tasks", { key: alice }),
      ),
    );
    expect(listed.tasks[0]).toMatchObject({ task_id: id, seats_open: 2, price: { amount: "1" } });
    expect((await apply(alice, id, {})).status).toBe(400); // the required question

    const seat = await hire(id);
    let v = await get(id);
    expect(v.seats[0]).toMatchObject({ seat_id: seat, state: "ASSIGNED", funded: true });
    expect(chainStatuses()).toEqual(["Funded"]);
    expect([...t.chain.tasks.values()][0]?.amountPerWitness).toBe(1_000_000n);

    expect((await deliver(alice, seat)).status).toBe(200);
    v = await get(id);
    expect(v.seats[0]).toMatchObject({ state: "IN_REVIEW", review_due_at: "2026-10-10T03:00:00.000Z" });
    expect((await decideSeat(id, seat, "release", {})).status).toBe(400); // must acknowledge
    expect((await decideSeat(id, seat, "release", { acknowledge_release: true })).status).toBe(200);
    await tick(t.app); // SETTLE_SEAT
    expect(chainStatuses()).toEqual(["Settled"]);
    const onChain = [...t.chain.tasks.values()][0];
    expect(onChain?.recipients).toEqual([t.identity.addresses.get("alice")]);
    expect((await get(id)).seats[0]).toMatchObject({ state: "RELEASED", released_by: "requester" });
  });

  it("D2: nobody decides for 24 hours, so the worker is paid", async () => {
    const id = await create({ seats: 1 });
    const seat = await hire(id);
    await deliver(alice, seat);
    t.advance(24 * H - 60_000);
    await tick(t.app);
    expect((await get(id)).seats[0].state).toBe("IN_REVIEW");
    t.advance(2 * 60_000);
    await tick(t.app); // release + settle in the same tick
    await tick(t.app);
    expect((await get(id)).seats[0]).toMatchObject({ state: "RELEASED", released_by: "timeout" });
    expect(chainStatuses()).toEqual(["Settled"]);
  });

  it("reject refunds the seat's escrow, the seat can be filled again, and cancel hands unpaid seats back", async () => {
    const before = await balance();
    const id = await create();
    const first = await hire(id);
    await deliver(alice, first);
    expect((await decideSeat(id, first, "reject", {})).status).toBe(400); // a reason is required
    expect(
      (await decideSeat(id, first, "reject", { reason: "The photo is of a different shop." })).status,
    ).toBe(200);
    await tick(t.app); // REFUND_SEAT
    expect(chainStatuses()).toEqual(["Refunded"]);

    // Bob takes the same seat number in a new round, delivers, and is released.
    const second = await hire(id, bob);
    expect(
      (await get(id)).seats.map((s: { seat_no: number; round: number }) => [s.seat_no, s.round]),
    ).toEqual([
      [1, 1],
      [1, 2],
    ]);
    await deliver(bob, second);
    await decideSeat(id, second, "release", { acknowledge_release: true });
    await tick(t.app);

    // Cancel: no live seats left, so the never-paid seat 2 comes back with its fee; seat 1 was paid.
    const res = await call(
      (r) => handleCancelTask(t.app, r, id),
      jsonReq("POST", `/v1/tasks/${id}/cancel`, { key: t.apiKey }),
    );
    expect((await json(res)).status).toBe("CANCELLED");
    expect(await taskLedger(id)).toEqual(["REFUND:1.15", "RESERVE:-2.3"]);
    expect(await balance()).toBeCloseTo(before - 1.15, 6);
  });

  it("at most three requests for changes", async () => {
    const id = await create({ seats: 1 });
    const seat = await hire(id);
    for (let i = 0; i < 3; i++) {
      await deliver(alice, seat, `Try ${i + 1}`);
      expect((await decideSeat(id, seat, "request-changes", { reason: "Closer, please." })).status).toBe(200);
    }
    await deliver(alice, seat, "Try 4");
    const res = await decideSeat(id, seat, "request-changes", { reason: "Again" });
    expect(res.status).toBe(409);
    expect((await get(id)).seats[0].delivery).toMatchObject({ round: 3, body: "Try 4" });
  });

  it("first come: applying takes a seat at once; a missed completion window frees it", async () => {
    const id = await create({ seats: 1, selection_mode: "first_come", completion_window_hours: 2 });
    expect((await apply(alice, id)).status).toBe(200);
    await tick(t.app);
    expect((await mySeats(alice))[0]?.state).toBe("ASSIGNED");
    t.advance(2 * H + 60_000);
    await tick(t.app); // EXPIRED + REFUND_SEAT
    await tick(t.app);
    expect((await get(id)).seats[0].state).toBe("EXPIRED");
    expect(chainStatuses()).toEqual(["Refunded"]);
    expect((await apply(bob, id)).status).toBe(200); // the seat is free again
  });

  it("the deadline closes the task; seats never released come back with their fee", async () => {
    const before = await balance();
    const id = await create(); // 2 seats
    const seat = await hire(id);
    await deliver(alice, seat);
    await decideSeat(id, seat, "release", { acknowledge_release: true });
    await apply(bob, id); // pending when the deadline passes
    t.setNow(new Date("2026-10-12T03:01:00Z"));
    await tick(t.app);
    const v = await get(id);
    expect(v.status).toBe("DONE");
    expect(await taskLedger(id)).toEqual(["REFUND:1.15", "RESERVE:-2.3"]);
    expect(await balance()).toBeCloseTo(before - 1.15, 6);
    expect((await applications(id)).map((a) => a.state).sort()).toEqual(["accepted", "rejected"]);
  });

  it("sends signed task.* webhooks: applied, assigned, delivered, released", async () => {
    const publicDns = async () => ["93.184.216.34"];
    const { secret } = await registerWebhook(t.app, {
      credentialId: t.credentialId,
      url: "https://hooks.example.com/pm",
      events: ["task.application_received", "task.seat_assigned", "task.submitted", "task.released"],
      by: "test",
      resolve: publicDns,
    });
    const got: { type: string; data: Record<string, string>; ok: boolean }[] = [];
    __setWebhookDeps({
      resolve: publicDns,
      fetch: (async (_u: URL, init: RequestInit) => {
        const body = String(init.body);
        const sig = new Headers(init.headers).get("proofmarket-signature") ?? "";
        const p = JSON.parse(body);
        got.push({
          type: p.type,
          data: p.data,
          ok: verifyWebhook(secret, sig, body, Math.floor(t.app.now().getTime() / 1000)),
        });
        return new Response(null, { status: 200 });
      }) as unknown as typeof fetch,
    });
    const id = await create({ seats: 1 });
    const seat = await hire(id);
    await deliver(alice, seat);
    await decideSeat(id, seat, "release", { acknowledge_release: true });
    await tick(t.app);
    __setWebhookDeps({});
    expect(got.map((g) => g.type)).toEqual([
      "task.application_received",
      "task.seat_assigned",
      "task.submitted",
      "task.released",
    ]);
    expect(got.every((g) => g.ok)).toBe(true);
    expect(got.at(-1)?.data).toEqual({ task_id: id, seat_id: seat, state: "RELEASED" });
  });

  it("another key cannot read or decide the task", async () => {
    const id = await create();
    const res = await call(
      (r) => handleGetTask(t.app, r, id),
      jsonReq("GET", `/v1/tasks/${id}`, { key: "pm_test_nope_nope" }),
    );
    expect(res.status).toBe(401);
  });
});
