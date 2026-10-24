// Preferred and blocked workers (docs/architecture 14 §4): a blocked worker cannot see, open or apply to the
// requester's tasks but keeps a seat already held; preferred-only tasks reach preferred workers only; the worker is
// never told; applicants come back preferred first.
import { beforeEach, describe, expect, it } from "vitest";
import {
  handleCreateTask,
  handleDecideApplication,
  handleListApplications,
  handleWorkerApply,
  handleWorkerGetMarketTask,
  handleWorkerListMarketTasks,
} from "../lib/handlers/market-tasks";
import { handleWorkerPreferences } from "../lib/handlers/prefs";
import { handleWorkerProfile } from "../lib/handlers/profiles";
import { setFlag } from "../lib/services/admin-service";
import { call, createTestApp, jsonReq } from "./support/app";
import { onboardWorker } from "./support/worker";

let t: Awaited<ReturnType<typeof createTestApp>>;
let alice: string;
let bob: string;

beforeEach(async () => {
  t = await createTestApp();
  await setFlag(t.db, "tasks_enabled", true, "test");
  alice = (await onboardWorker(t, "alice")).token;
  bob = (await onboardWorker(t, "bob")).token;
});

// biome-ignore lint/suspicious/noExplicitAny: test convenience
const json = async (res: Response): Promise<any> => res.json();

const taskBody = (o: Record<string, unknown> = {}) => ({
  title: "Translate a short menu",
  description: "Translate a one-page cafe menu from Japanese into English and keep the prices as they are.",
  completion_criteria: "Every item translated, prices unchanged",
  evidence_types: ["text"],
  remote_ok: true,
  price: { asset: "USDC", amount: "1", network: "solana-devnet" },
  seats: 2,
  deadline: "2026-10-12T03:00:00Z",
  ...o,
});
const createRes = (o: Record<string, unknown> = {}) =>
  call(
    (r) => handleCreateTask(t.app, r),
    jsonReq("POST", "/v1/tasks", { key: t.apiKey, body: taskBody(o), idem: crypto.randomUUID() }),
  );
const create = async (o: Record<string, unknown> = {}) => {
  const res = await createRes(o);
  expect(res.status).toBe(201);
  return (await json(res)).task_id as string;
};
const apply = (tok: string, id: string) =>
  call(
    (r) => handleWorkerApply(t.app, r, id),
    jsonReq("POST", `/v1/worker/market-tasks/${id}/apply`, { key: tok, body: { answers: {} } }),
  );
const openList = async (tok: string) =>
  (
    await json(
      await call(
        (r) => handleWorkerListMarketTasks(t.app, r),
        jsonReq("GET", "/v1/worker/market-tasks", { key: tok }),
      ),
    )
  ).tasks.map((x: { task_id: string }) => x.task_id) as string[];
const openOne = (tok: string, id: string) =>
  call(
    (r) => handleWorkerGetMarketTask(t.app, r, id),
    jsonReq("GET", `/v1/worker/market-tasks/${id}`, { key: tok }),
  );
const applicants = async (id: string) =>
  (
    await json(
      await call(
        (r) => handleListApplications(t.app, r, id),
        jsonReq("GET", `/v1/tasks/${id}/applications`, { key: t.apiKey }),
      ),
    )
  ).applications as {
    application_id: string;
    worker_ref: string;
    preferred: boolean;
    public_id: string | null;
  }[];
const mark = (body: Record<string, unknown>) =>
  call(
    (r) => handleWorkerPreferences(t.app, r),
    jsonReq("POST", "/v1/worker-preferences", { key: t.apiKey, body }),
  );
const marks = async () =>
  (
    await json(
      await call(
        (r) => handleWorkerPreferences(t.app, r),
        jsonReq("GET", "/v1/worker-preferences", { key: t.apiKey }),
      ),
    )
  ).workers;

/** Both apply to a first task so the requester has met them; returns their worker_refs on it. */
async function meetBoth() {
  const id = await create();
  await apply(alice, id);
  await apply(bob, id);
  const list = await applicants(id);
  const [a, b] = list;
  return { id, aliceRef: a?.worker_ref ?? "", bobRef: b?.worker_ref ?? "", list };
}

describe("preferred and blocked workers", () => {
  it("a blocked worker no longer sees, opens or applies to the requester's tasks; nothing says why", async () => {
    const met = await meetBoth();
    const res = await mark({ worker: { task_id: met.id, worker_ref: met.aliceRef }, kind: "block" });
    expect(res.status).toBe(200);
    expect((await json(res)).pref_ref).toMatch(/^pref_[0-9a-f]{32}$/);

    const next = await create();
    expect(await openList(alice)).not.toContain(next);
    expect(await openList(bob)).toContain(next);
    const opened = await openOne(alice, next);
    expect(opened.status).toBe(404);
    expect((await json(opened)).error.code).toBe("TASK_NOT_FOUND");
    expect((await apply(alice, next)).status).toBe(404);
    expect((await apply(bob, next)).status).toBe(200);
  });

  it("blocking does not take away a seat already held", async () => {
    const met = await meetBoth();
    const app = (await applicants(met.id)).find((a) => a.worker_ref === met.aliceRef);
    const acc = await call(
      (r) => handleDecideApplication(t.app, r, met.id, app?.application_id ?? "", "accept"),
      jsonReq("POST", `/v1/tasks/${met.id}/applications/x/accept`, { key: t.apiKey, body: {} }),
    );
    expect(acc.status).toBe(200);
    await mark({ worker: { task_id: met.id, worker_ref: met.aliceRef }, kind: "block" });
    expect(await openList(alice)).toContain(met.id);
    const view = await json(await openOne(alice, met.id));
    expect(view.mine.seat_id).toMatch(/^seat_/);
  });

  it("preferred-only tasks reach preferred workers only, and need at least one", async () => {
    const refused = await createRes({ audience: "preferred" });
    expect(refused.status).toBe(400);
    expect((await json(refused)).error.details.reason).toBe("no_preferred_workers");

    const met = await meetBoth();
    await mark({ worker: { task_id: met.id, worker_ref: met.bobRef }, kind: "prefer" });
    const only = await create({ audience: "preferred" });
    expect(await openList(bob)).toContain(only);
    expect(await openList(alice)).not.toContain(only);
    expect((await apply(alice, only)).status).toBe(404);
    expect((await apply(bob, only)).status).toBe(200);
    // The worker's view does not say the task is preferred-only.
    expect((await json(await openOne(bob, only))).audience).toBeUndefined();
  });

  it("lists preferred applicants first and shows a public profile id only when public", async () => {
    const met = await meetBoth();
    expect(met.list.map((a) => a.preferred)).toEqual([false, false]);
    await mark({ worker: { task_id: met.id, worker_ref: met.bobRef }, kind: "prefer" });
    await call(
      (r) => handleWorkerProfile(t.app, r),
      jsonReq("PUT", "/v1/worker/profile", { key: bob, body: { public: true, display_name: "Ben" } }),
    );
    const list = await applicants(met.id);
    expect(list[0]).toMatchObject({ worker_ref: met.bobRef, preferred: true });
    expect(list[0]?.public_id).toMatch(/^pw_/);
    expect(list[1]).toMatchObject({ worker_ref: met.aliceRef, preferred: false, public_id: null });
  });

  it("marks by public profile, lists, clears by pref_ref, and refuses strangers", async () => {
    const prof = await json(
      await call(
        (r) => handleWorkerProfile(t.app, r),
        jsonReq("PUT", "/v1/worker/profile", { key: alice, body: { public: true, display_name: "Aki" } }),
      ),
    );
    const res = await json(await mark({ worker: { public_id: prof.profile.public_id }, kind: "prefer" }));
    const listed = await marks();
    expect(listed).toEqual([
      expect.objectContaining({ pref_ref: res.pref_ref, kind: "prefer", display_name: "Aki" }),
    ]);
    expect((await mark({ worker: { pref_ref: res.pref_ref }, kind: "clear" })).status).toBe(200);
    expect(await marks()).toEqual([]);

    // A worker_ref from a task that is not the requester's, or made up, is not found.
    const stranger = await mark({
      worker: { task_id: "tsk_01J00000000000000000000000", worker_ref: `hmac:${"0".repeat(64)}` },
      kind: "block",
    });
    expect(stranger.status).toBe(404);
    expect((await json(stranger)).error.code).toBe("WORKER_NOT_FOUND");
  });

  it("answers 404 TASKS_NOT_ENABLED while tasks are off", async () => {
    await setFlag(t.db, "tasks_enabled", false, "test");
    const res = await call(
      (r) => handleWorkerPreferences(t.app, r),
      jsonReq("GET", "/v1/worker-preferences", { key: t.apiKey }),
    );
    expect(res.status).toBe(404);
  });
});
