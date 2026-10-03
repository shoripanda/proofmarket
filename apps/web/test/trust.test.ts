// Worker trust tiers in the task list and claim (01 §4.11).
import { beforeEach, describe, expect, it } from "vitest";
import { handleMe } from "../lib/handlers/worker";
import { call, createTestApp, jsonReq } from "./support/app";
import { onboardWorker, openTask, photo, W, witness } from "./support/worker";

let t: Awaited<ReturnType<typeof createTestApp>>;
let alice: string;
beforeEach(async () => {
  t = await createTestApp();
  alice = (await onboardWorker(t, "alice")).token;
});
const ids = async (token: string) =>
  ((await (await W(t, token).list()).json()) as { tasks: { verification_id: string }[] }).tasks.map(
    (x) => x.verification_id,
  );
const code = async (r: Response) => ((await r.json()) as { error: { code: string } }).error.code;

describe("trust tiers", () => {
  it("a new worker neither sees nor claims a task that requires standard", async () => {
    const open = await openTask(t);
    const gated = await openTask(t, { worker_requirements: { min_tier: "standard" } });
    expect(await ids(alice)).toEqual([open]);
    const r = await W(t, alice).claim(gated);
    expect(r.status).toBe(403);
    expect(await code(r)).toBe("WORKER_NOT_ELIGIBLE");
  });

  it("a worker caught reusing a photo is kept off single-witness tasks only", async () => {
    const bytes = await photo();
    await witness(t, alice, await openTask(t), { bytes });
    const replay = await witness(t, alice, await openTask(t), { bytes });
    expect(replay.body).toMatchObject({ reason_code: "EVIDENCE_REPLAYED" });
    const single = await openTask(t);
    const multi = await openTask(t, { assurance: { required_witnesses: 2, quorum: 2 } });
    const visible = await ids(alice);
    expect(visible).toContain(multi);
    expect(visible).not.toContain(single);
    expect(await code(await W(t, alice).claim(single))).toBe("WORKER_NOT_ELIGIBLE");
    const me = (await (
      await call((r) => handleMe(t.app, r), jsonReq("GET", "/v1/worker/me", { key: alice }))
    ).json()) as { trust: { tier: string; record: { violations: number } } };
    expect(me.trust).toMatchObject({ tier: "restricted", record: { violations: 1 } });
  });
});
