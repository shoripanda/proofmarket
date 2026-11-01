// Pushes for general tasks (docs/architecture 15): a new task to the workers who may apply, and a worker's own
// seat events to that worker only. Never the title, description, message body or reason in the text.
import { PLATFORM_FEE_BPS } from "@proofmarket/core";
import { schema } from "@proofmarket/db";
import { beforeEach, describe, expect, it } from "vitest";
import {
  handleCreateTask,
  handleDecideApplication,
  handleDecideSeat,
  handleListApplications,
  handleSeatMessages,
  handleWorkerApply,
  handleWorkerDeliver,
  handleWorkerListSeats,
} from "../lib/handlers/market-tasks";
import { setFlag } from "../lib/services/admin-service";
import { tick } from "../lib/services/jobs";
import { runNotifyMarketTask, runNotifyWorkers, savePushSubscription } from "../lib/services/push-service";
import { call, createTestApp, jsonReq } from "./support/app";
import { onboardWorker, openTask } from "./support/worker";

let t: Awaited<ReturnType<typeof createTestApp>>;
let alice: string;
let bob: string;
let aliceId: string;
let bobId: string;

beforeEach(async () => {
  t = await createTestApp();
  t.app.config.platformFeeBps = PLATFORM_FEE_BPS;
  await setFlag(t.db, "tasks_enabled", true, "test");
  alice = (await onboardWorker(t, "alice")).token;
  bob = (await onboardWorker(t, "bob")).token;
  const ws = await t.db.select().from(schema.workers);
  aliceId = ws.find((w) => w.privyUserId === "alice")?.id ?? "";
  bobId = ws.find((w) => w.privyUserId === "bob")?.id ?? "";
});

const sub = (n: string) => ({
  endpoint: `https://fcm.googleapis.com/fcm/send/${n}`,
  keys: { p256dh: "BPk", auth: "au" },
});
const EP_A = sub("a").endpoint;
const EP_B = sub("b").endpoint;
const TITLE = "Photograph the opening hours sign";
const DESCRIPTION =
  "Go to the bakery near Shibuya station and photograph the opening hours sign at the door.";

const taskBody = (o: Record<string, unknown> = {}) => ({
  title: TITLE,
  description: DESCRIPTION,
  completion_criteria: "One sharp photo where every line of the sign can be read",
  evidence_types: ["photo", "text"],
  area: "Shibuya, Tokyo",
  price: { asset: "USDC", amount: "1", network: "solana-devnet" },
  seats: 1,
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
/** Run queued jobs and return the pushes they sent, emptying the fake push service. */
const sentAfterTick = async () => {
  await tick(t.app);
  const out = t.push.sent.map((s) => ({ endpoint: s.endpoint, ...JSON.parse(s.payload) }));
  t.push.sent.length = 0;
  return out;
};
const hire = async (id: string) => {
  await call(
    (r) => handleWorkerApply(t.app, r, id),
    jsonReq("POST", `/v1/worker/market-tasks/${id}/apply`, { key: alice, body: { answers: { eta: "now" } } }),
  );
  const apps = (
    await json(
      await call(
        (r) => handleListApplications(t.app, r, id),
        jsonReq("GET", `/v1/tasks/${id}/applications`, { key: t.apiKey }),
      ),
    )
  ).applications as { application_id: string }[];
  const appId = apps[0]?.application_id ?? "";
  await call(
    (r) => handleDecideApplication(t.app, r, id, appId, "accept"),
    jsonReq("POST", `/v1/tasks/${id}/applications/${appId}/accept`, { key: t.apiKey, body: {} }),
  );
  const seats = (
    await json(
      await call(
        (r) => handleWorkerListSeats(t.app, r),
        jsonReq("GET", "/v1/worker/market-seats", { key: alice }),
      ),
    )
  ).seats as { seat_id: string }[];
  return seats[0]?.seat_id ?? "";
};
const deliver = (seatId: string) =>
  call(
    (r) => handleWorkerDeliver(t.app, r, seatId),
    jsonReq("POST", `/v1/worker/market-seats/${seatId}/deliver`, { key: alice, body: { body: "Done." } }),
  );
const decide = (id: string, seatId: string, action: string, body: unknown = {}) =>
  call(
    (r) => handleDecideSeat(t.app, r, id, seatId, action),
    jsonReq("POST", `/v1/tasks/${id}/seats/${seatId}/${action}`, { key: t.apiKey, body }),
  );

describe("task pushes (15)", () => {
  it("a new task in an area goes to workers who chose an area, in the task's currency, without its text", async () => {
    await savePushSubscription(t.app, aliceId, { subscription: sub("a"), areas: ["shibuya"] });
    await savePushSubscription(t.app, bobId, { subscription: sub("b"), areas: [] });
    const id = await create();
    const sent = await sentAfterTick();
    expect(sent.map((s) => s.endpoint)).toEqual([EP_A]);
    expect(sent[0]).toMatchObject({ title: "新しい仕事", url: `/jobs/${id}`, tag: `task:${id}` });
    expect(sent[0].body).toMatch(/Shibuya, Tokyo・1人 1 USDC/);
    expect(JSON.stringify(sent)).not.toContain(TITLE);
    expect(JSON.stringify(sent)).not.toContain(DESCRIPTION);
  });

  it("work that can be done anywhere goes to every subscriber, in English for an English app", async () => {
    await savePushSubscription(t.app, aliceId, { subscription: sub("a"), areas: ["shibuya"], lang: "en" });
    await savePushSubscription(t.app, bobId, { subscription: sub("b"), areas: [] });
    const id = await create({ area: undefined, remote_ok: true });
    const sent = await sentAfterTick();
    expect(sent.map((s) => s.endpoint).sort()).toEqual([EP_A, EP_B]);
    const en = sent.find((s) => s.endpoint === EP_A);
    expect(en).toMatchObject({ title: "New task (no particular place)", url: `/en/jobs/${id}` });
    expect(en.body).toMatch(/^Anywhere · 1 USDC per person/);
  });

  it("blocked workers hear nothing; a preferred-only task reaches only preferred workers", async () => {
    await savePushSubscription(t.app, aliceId, { subscription: sub("a"), areas: ["shibuya"] });
    await savePushSubscription(t.app, bobId, { subscription: sub("b"), areas: ["shibuya"] });
    await t.db.insert(schema.requesterWorkerPrefs).values([
      { principalId: t.principalId, workerId: aliceId, kind: "block", createdAt: new Date() },
      { principalId: t.principalId, workerId: bobId, kind: "prefer", createdAt: new Date() },
    ]);
    await create();
    expect((await sentAfterTick()).map((s) => s.endpoint)).toEqual([EP_B]);
    await create({ audience: "preferred" });
    const sent = await sentAfterTick();
    expect(sent.map((s) => s.endpoint)).toEqual([EP_B]);
    expect(sent[0].title).toBe("あなたを推した依頼者から新しい仕事");
  });

  it("nothing goes out while tasks_enabled is off", async () => {
    await savePushSubscription(t.app, aliceId, { subscription: sub("a"), areas: ["shibuya"] });
    const id = await create();
    await setFlag(t.db, "tasks_enabled", false, "test");
    expect(await runNotifyMarketTask(t.app, id)).toEqual({ sent: 0 });
  });

  it("seat events reach only the seat's worker, with no message body or reason", async () => {
    await savePushSubscription(t.app, aliceId, { subscription: sub("a"), areas: [] });
    await savePushSubscription(t.app, bobId, { subscription: sub("b"), areas: [] });
    const id = await create({ area: undefined, remote_ok: true });
    await sentAfterTick(); // the new-task push
    const seat = await hire(id);
    let sent = await sentAfterTick();
    expect(sent.map((s) => [s.endpoint, s.title])).toEqual([[EP_A, "応募が通りました"]]);
    expect(sent[0]).toMatchObject({ url: `/jobs/seats/${seat}`, tag: `seat:${seat}` });

    const secret = "Please call me at 090-0000-0000 about the sign";
    await call(
      (r) => handleSeatMessages(t.app, r, id, seat),
      jsonReq("POST", `/v1/tasks/${id}/seats/${seat}/messages`, { key: t.apiKey, body: { body: secret } }),
    );
    sent = await sentAfterTick();
    expect(sent.map((s) => [s.endpoint, s.title])).toEqual([[EP_A, "依頼者からメッセージが届きました"]]);
    expect(JSON.stringify(sent)).not.toContain("090");

    await deliver(seat);
    expect((await decide(id, seat, "request-changes", { reason: "The photo is blurry" })).status).toBe(200);
    sent = await sentAfterTick();
    expect(sent.map((s) => s.title)).toEqual(["手直しの依頼が届きました"]);
    expect(JSON.stringify(sent)).not.toContain("blurry");

    await deliver(seat);
    expect((await decide(id, seat, "release", { acknowledge_release: true })).status).toBe(200);
    sent = await sentAfterTick();
    expect(sent.map((s) => [s.endpoint, s.title, s.body])).toEqual([[EP_A, "報酬が支払われます", "1 USDC"]]);
  });

  it("a rejected submission is pushed; the worker's own messages are not echoed back", async () => {
    await savePushSubscription(t.app, aliceId, { subscription: sub("a"), areas: [] });
    const id = await create({ area: undefined, remote_ok: true });
    const seat = await hire(id);
    await sentAfterTick();
    await deliver(seat);
    await decide(id, seat, "reject", { reason: "Wrong shop" });
    const sent = await sentAfterTick();
    expect(sent.map((s) => s.title)).toEqual(["提出は受け入れられませんでした"]);
    expect(JSON.stringify(sent)).not.toContain("Wrong shop");
  });
});

describe("verification pushes", () => {
  it("name the request's own currency, not always USDC (16 §3)", async () => {
    await savePushSubscription(t.app, aliceId, { subscription: sub("a"), areas: ["shibuya"] });
    const id = await openTask(t);
    await t.db.update(schema.verificationRequests).set({ bountyAsset: "PYUSD" });
    expect(await runNotifyWorkers(t.app, id)).toEqual({ sent: 1 });
    expect(JSON.parse(t.push.sent[0]?.payload ?? "{}").body).toMatch(/1人 [\d.]+ PYUSD/);
  });
});
