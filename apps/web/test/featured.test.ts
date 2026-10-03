// Featured results on the site's top page (05 §4): operator-only, result required, public-safe fields only.
import { beforeEach, describe, expect, it } from "vitest";
import { handleFeature } from "../lib/handlers/operator";
import { featuredResults } from "../lib/services/public-service";
import { call, createTestApp, jsonReq, SHOP } from "./support/app";
import { onboardWorker, openTask, witness } from "./support/worker";

const secrets = { adminToken: "a".repeat(32), cronSecret: "c".repeat(32) };
let t: Awaited<ReturnType<typeof createTestApp>>;
let alice: string;
beforeEach(async () => {
  t = await createTestApp();
  alice = (await onboardWorker(t, "alice")).token;
});
const feature = (id: string, featured: unknown, key = secrets.adminToken) =>
  call((r) => handleFeature(t.app, secrets, r, id), jsonReq("POST", "/x", { key, body: { featured } }));

describe("featured results", () => {
  it("nothing is listed until the operator features it; then only public-safe fields", async () => {
    const id = await openTask(t);
    await witness(t, alice, id, { answer: "OPEN" });
    expect(await featuredResults(t.app)).toEqual([]);

    expect((await feature(id, true)).status).toBe(200);
    const list = await featuredResults(t.app);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ verification_id: id, status: "VERIFIED", answer: "OPEN" });
    const text = JSON.stringify(list);
    expect(text).not.toMatch(/question|evidence_root|wkr_|Walletalice|storage\.test/);
    expect(text).not.toContain(String(SHOP.lat));

    expect((await feature(id, false)).status).toBe(200);
    expect(await featuredResults(t.app)).toEqual([]);
  });

  it("rejects tasks without a result, bad bodies and non-operators", async () => {
    const id = await openTask(t);
    expect((await feature(id, true)).status).toBe(404);
    expect((await feature(id, "yes")).status).toBe(400);
    expect((await feature(id, true, "b".repeat(32))).status).toBe(401);
  });
});
