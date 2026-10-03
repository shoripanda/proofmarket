// 01 §4.9: a recent shared VERIFIED result for the same place is returned instead of sending someone.
import { schema } from "@proofmarket/db";
import { beforeEach, describe, expect, it } from "vitest";
import { handleCreate } from "../lib/handlers/requester";
import { call, createBody, createTestApp, jsonReq } from "./support/app";
import { onboardWorker, openTask, witness } from "./support/worker";

let t: Awaited<ReturnType<typeof createTestApp>>;
let alice: string;
beforeEach(async () => {
  t = await createTestApp();
  alice = (await onboardWorker(t, "alice")).token;
});
const create = async (o: Record<string, unknown>) => {
  const res = await call(
    (r) => handleCreate(t.app, r),
    jsonReq("POST", "/v1/verifications", {
      key: t.apiKey,
      body: createBody(t.principalId, o),
      idem: crypto.randomUUID(),
    }),
  );
  return { status: res.status, body: (await res.json()) as Record<string, unknown> };
};
const verifiedSource = async (o: Record<string, unknown> = {}) => {
  const id = await openTask(t, { allow_reuse: true, ...o });
  await witness(t, alice, id, { answer: "CLOSED" });
  return id;
};
const taskCount = async () => (await t.db.select().from(schema.verificationRequests)).length;
const reserved = async () =>
  (await t.db.select().from(schema.requesterLedger)).filter((l) => l.entryType === "RESERVE").length;

describe("result reuse", () => {
  it("returns a shared recent result, final, without a new task or charge", async () => {
    const src = await verifiedSource();
    const [tasks, reserves] = [await taskCount(), await reserved()];
    const r = await create({ reuse: { max_age_seconds: 600 } });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      reused: true,
      verification_id: src,
      status: "VERIFIED",
      funding: { status: "NONE" },
    });
    expect(r.body.result).toMatchObject({ status: "VERIFIED", answer: "CLOSED" });
    expect(JSON.stringify(r.body)).not.toMatch(/question|rejected_submissions/);
    expect([await taskCount(), await reserved()]).toEqual([tasks, reserves]);
  });

  it("never reuses a result whose requester did not allow it", async () => {
    const id = await openTask(t);
    await witness(t, alice, id, { answer: "OPEN" });
    expect((await create({ reuse: { max_age_seconds: 600 } })).status).toBe(201);
  });

  it("respects max age and the answer set", async () => {
    await verifiedSource();
    t.advance(11 * 60_000);
    expect((await create({ reuse: { max_age_seconds: 600 } })).status).toBe(201);
    expect(
      (
        await create({
          reuse: { max_age_seconds: 3600 },
          answer_schema: { type: "enum", values: ["OPEN", "CLOSED"] },
        })
      ).status,
    ).toBe(201);
    expect((await create({ reuse: { max_age_seconds: 3600 } })).status).toBe(200);
  });

  it("without `reuse` a task is always created", async () => {
    await verifiedSource();
    expect((await create({})).status).toBe(201);
  });
});
