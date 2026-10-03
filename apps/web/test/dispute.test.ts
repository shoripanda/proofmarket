// 01 §4.12: a disputed result gets one recheck task; a disagreeing recheck is flagged for review.
import { schema } from "@proofmarket/db";
import { beforeEach, describe, expect, it } from "vitest";
import { handleDispute, handleGet } from "../lib/handlers/requester";
import { applyTaskEvent, lockTask } from "../lib/services/task-engine";
import { call, createTestApp, jsonReq } from "./support/app";
import { onboardWorker, openTask, witness } from "./support/worker";

let t: Awaited<ReturnType<typeof createTestApp>>;
let alice: string;
let bob: string;
let carol: string;
beforeEach(async () => {
  t = await createTestApp();
  alice = (await onboardWorker(t, "alice")).token;
  bob = (await onboardWorker(t, "bob")).token;
  carol = (await onboardWorker(t, "carol")).token;
});
const dispute = async (id: string, body: unknown = {}) => {
  const res = await call(
    (r) => handleDispute(t.app, r, id),
    jsonReq("POST", `/v1/verifications/${id}/dispute`, { key: t.apiKey, body }),
  );
  return { status: res.status, body: (await res.json()) as Record<string, any> }; // biome-ignore lint/suspicious/noExplicitAny: test
};
// biome-ignore lint/suspicious/noExplicitAny: test convenience
const view = async (id: string): Promise<any> =>
  (
    await call((r) => handleGet(t.app, r, id), jsonReq("GET", `/v1/verifications/${id}`, { key: t.apiKey }))
  ).json();

/** Fund and open a task created by dispute (the FUND_TASK job does this in production). */
async function open(id: string) {
  await t.db.transaction(async (tx) => {
    const task = await lockTask(tx, id);
    await applyTaskEvent(tx, t.app, task, "FUNDING_CONFIRMED", {
      actorType: "system",
      actorRef: null,
      correlationId: id,
      chain: { fundingFinalized: true },
    });
    await applyTaskEvent(tx, t.app, task, "OPEN", { actorType: "system", actorRef: null, correlationId: id });
  });
}

describe("disputes", () => {
  it("creates one recheck (2 of 2 by default) linked both ways; a second dispute is refused", async () => {
    const id = await openTask(t);
    await witness(t, alice, id, { answer: "OPEN" });
    const d = await dispute(id, { reason: "閉店の張り紙を見た" });
    expect(d.status).toBe(201);
    const recheck = d.body.recheck_verification_id as string;
    expect(await view(recheck)).toMatchObject({
      recheck_of: id,
      assurance: { required_witnesses: 2, quorum: 2 },
    });
    expect((await view(id)).recheck).toMatchObject({ verification_id: recheck, matches_original: null });
    expect((await dispute(id)).body.error.code).toBe("DISPUTE_NOT_ALLOWED");
    expect((await dispute(recheck)).body.error.code).toBe("DISPUTE_NOT_ALLOWED"); // no result yet
  });

  it("a recheck that disagrees marks the original and is audited for review", async () => {
    const id = await openTask(t);
    await witness(t, alice, id, { answer: "OPEN" });
    const recheck = (await dispute(id)).body.recheck_verification_id as string;
    await open(recheck);
    await witness(t, bob, recheck, { answer: "CLOSED" });
    await witness(t, carol, recheck, { answer: "CLOSED" });
    expect((await view(id)).recheck).toMatchObject({
      status: "VERIFIED",
      answer: "CLOSED",
      matches_original: false,
    });
    const audit = (await t.db.select().from(schema.auditEvents)).map(
      (a) => (a.metadata as { action?: string }).action,
    );
    expect(audit).toContain("dispute_opened");
    expect(audit).toContain("recheck_mismatch");
  });

  it("only within 24 hours of the result", async () => {
    const id = await openTask(t);
    await witness(t, alice, id, { answer: "OPEN" });
    t.advance(25 * 3600_000);
    expect((await dispute(id)).body.error.code).toBe("DISPUTE_NOT_ALLOWED");
  });
});
