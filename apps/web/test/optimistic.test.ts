// 13 §3 — optimistic verification: one person's answer is provisional for challenge_minutes; anyone with an API
// key may challenge it for a bond of twice the bounty, which pays a 2-person recheck.
import { schema } from "@proofmarket/db";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { handleChallenge, handleCreate, handleGet } from "../lib/handlers/requester";
import { proofChallengeLine, proofHeadline } from "../lib/proof-text";
import { createPrincipal, issueApiKey, topUp } from "../lib/services/admin-service";
import { tick } from "../lib/services/jobs";
import { publicResult } from "../lib/services/public-service";
import { call, createBody, createTestApp, jsonReq } from "./support/app";
import { onboardWorker, witness } from "./support/worker";

let t: Awaited<ReturnType<typeof createTestApp>>;
let other: { credentialId: string; apiKey: string };
let alice: string;
let bob: string;
let carol: string;
beforeEach(async () => {
  t = await createTestApp();
  const principalId = await createPrincipal(t.db, { displayName: "Someone Else", type: "organization" });
  other = await issueApiKey(t.db, {
    principalId,
    requesterName: "challenger",
    maxTaskAmount: "5",
    dailySpendLimit: "20",
    operator: "test",
  });
  await topUp(t.db, other.credentialId, "10");
  alice = (await onboardWorker(t, "alice")).token;
  bob = (await onboardWorker(t, "bob")).token;
  carol = (await onboardWorker(t, "carol")).token;
});

const OPTIMISTIC = { assurance: { level: "optimistic", challenge_minutes: 30 } };

const challenge = async (id: string, key = other.apiKey, idem = crypto.randomUUID()) => {
  const res = await call(
    (r) => handleChallenge(t.app, r, id),
    jsonReq("POST", `/v1/verifications/${id}/challenge`, { key, idem, body: { reason: "looked closed" } }),
  );
  // biome-ignore lint/suspicious/noExplicitAny: test convenience
  return { status: res.status, body: (await res.json()) as Record<string, any> };
};
// biome-ignore lint/suspicious/noExplicitAny: test convenience
const view = async (id: string): Promise<any> =>
  (
    await call((r) => handleGet(t.app, r, id), jsonReq("GET", `/v1/verifications/${id}`, { key: t.apiKey }))
  ).json();
const balance = async (credentialId: string) => {
  const [r] = await t.db
    .select({ s: sql<string>`coalesce(sum(amount), 0)` })
    .from(schema.requesterLedger)
    .where(eq(schema.requesterLedger.credentialId, credentialId));
  return Number(r?.s ?? 0);
};
const challengeRow = async (id: string) =>
  (
    await t.db
      .select()
      .from(schema.verificationChallenges)
      .where(eq(schema.verificationChallenges.verificationId, id))
  )[0];

/** Create through the API and let tick fund it on the fake chain, so settlement can run later. */
async function funded(o: Record<string, unknown> = OPTIMISTIC) {
  const res = await call(
    (r) => handleCreate(t.app, r),
    jsonReq("POST", "/v1/verifications", {
      key: t.apiKey,
      body: createBody(t.principalId, o),
      idem: crypto.randomUUID(),
    }),
  );
  const { verification_id: id } = (await res.json()) as { verification_id: string };
  await tick(t.app);
  return id;
}

/** An optimistic task with alice's OPEN as the provisional answer. */
async function provisional() {
  const id = await funded();
  expect((await witness(t, alice, id, { answer: "OPEN" })).body.state).toBe("VALID");
  return id;
}

/** Fund and open the recheck (tick runs FUND_TASK), then two people answer it. */
async function recheckAnswers(recheck: string, answer: string) {
  await tick(t.app);
  await witness(t, bob, recheck, { answer });
  await witness(t, carol, recheck, { answer });
}

describe("optimistic verification (13 §3)", () => {
  it("no challenge: provisional at once, VERIFIED when the window closes, with the same hashes", async () => {
    const before = await balance(t.credentialId);
    const id = await provisional();
    const v = await view(id);
    expect(v.status).toBe("SUBMITTED");
    expect(v.assurance).toMatchObject({ level: "optimistic", challenge_minutes: 30 });
    expect(v.result).toMatchObject({
      provisional: true,
      status: "VERIFIED",
      answer: "OPEN",
      challenge: { minutes: 30, state: "open", until: "2026-10-09T03:30:00.000Z" },
    });
    // the requester's own key works too, and only once the answer is provisional
    t.advance(29 * 60_000);
    await tick(t.app);
    expect((await view(id)).status).toBe("SUBMITTED");
    t.advance(2 * 60_000);
    await tick(t.app);
    const done = await view(id);
    expect(done.status).toBe("SETTLED");
    expect(done.result.provisional).toBeUndefined();
    expect(done.result.challenge.state).toBe("closed");
    expect(done.result.result_hash).toBe(v.result.result_hash);
    expect(done.result.verified_at).toBe(v.result.verified_at);
    expect(await balance(t.credentialId)).toBeCloseTo(before - 0.5);
    const pub = await publicResult(t.app, id);
    expect(proofChallengeLine(pub, "ja")).toBe(
      "1 人が確かめました。30 分のあいだ、だれでも異議を出せました（出ませんでした）",
    );
  });

  it("challenge, recheck agrees: UPHELD, VERIFIED, the bond paid the recheck", async () => {
    const id = await provisional();
    const owner = await balance(t.credentialId);
    const c = await challenge(id);
    expect(c.status).toBe(201);
    expect(c.body).toMatchObject({ verification_id: id, bond: { amount: "1" }, state: "challenged" });
    expect((await challenge(id)).body.error.code).toBe("CHALLENGE_NOT_ALLOWED");
    expect(await balance(other.credentialId)).toBeCloseTo(9);
    const recheck = c.body.recheck_verification_id as string;
    // the recheck belongs to the requester, so the challenger never sees the question
    expect(await view(recheck)).toMatchObject({ recheck_of: id, assurance: { required_witnesses: 2 } });
    expect((await view(id)).result.challenge.state).toBe("challenged");

    await recheckAnswers(recheck, "OPEN");
    t.advance(60_000); // the original's window has not closed; the recheck alone decides it
    await tick(t.app);
    const v = await view(id);
    expect(v.result).toMatchObject({ status: "VERIFIED", answer: "OPEN", challenge: { state: "upheld" } });
    expect(await challengeRow(id)).toMatchObject({ state: "UPHELD" });
    expect(await t.db.select().from(schema.payoutAdjustments)).toEqual([]); // bond 1.00 - recheck 1.00 = 0
    expect(await balance(other.credentialId)).toBeCloseTo(9);
    expect(await balance(t.credentialId)).toBeCloseTo(owner);
  });

  it("challenge, recheck disagrees: OVERTURNED, REJECTED (CHALLENGED), bond back, requester pays the recheck", async () => {
    const id = await provisional();
    const owner = await balance(t.credentialId);
    const recheck = (await challenge(id)).body.recheck_verification_id as string;
    await recheckAnswers(recheck, "CLOSED");
    await tick(t.app);
    const v = await view(id);
    expect(v.result).toMatchObject({
      status: "REJECTED",
      reason: "CHALLENGED",
      answer: null,
      challenge: { state: "overturned" },
    });
    expect(v.recheck).toMatchObject({ verification_id: recheck, answer: "CLOSED" });
    expect(await challengeRow(id)).toMatchObject({ state: "OVERTURNED" });
    expect(await balance(other.credentialId)).toBeCloseTo(10);
    expect(await balance(t.credentialId)).toBeCloseTo(owner - 1);
    // the original worker still gets paid on chain: checks passed, the answer was contradicted (REJECTED is
    // finalized as NoConsensus by settlement-jobs, as for any REJECTED task)
    const [row] = await t.db
      .select({ h: schema.verificationRequests.taskIdHash })
      .from(schema.verificationRequests)
      .where(eq(schema.verificationRequests.id, id));
    const onChain = await t.chain.readTask(row?.h as Uint8Array);
    expect(onChain).toMatchObject({ status: "Settled" });
    expect(onChain?.recipients).toHaveLength(1);
    const pub = await publicResult(t.app, id);
    expect(proofHeadline(pub, "ja")).toBe("異議が出て確かめ直したところ、答えが違いました");
    expect(proofChallengeLine(pub, "en")).toBe(
      "One person checked. For 30 minutes, anyone could challenge the answer (it was challenged; 2 people rechecked and found a different answer).",
    );
  });

  it("refuses challenges outside the window, on ordinary tasks, and before the answer", async () => {
    const early = await funded();
    expect((await challenge(early)).status).toBe(409);
    const plain = await funded({});
    await witness(t, bob, plain, { answer: "OPEN" });
    expect((await challenge(plain)).body.error.code).toBe("CHALLENGE_NOT_ALLOWED");
    const id = await provisional();
    t.advance(30 * 60_000);
    const late = await challenge(id);
    expect(late.status).toBe(409);
    expect(late.body.error.code).toBe("CHALLENGE_NOT_ALLOWED");
  });

  it("is only for choice and number answers, and needs a window of 10 to 120 minutes", async () => {
    const create = async (o: Record<string, unknown>) =>
      call(
        (r) => handleCreate(t.app, r),
        jsonReq("POST", "/v1/verifications", {
          key: t.apiKey,
          body: createBody(t.principalId, o),
          idem: crypto.randomUUID(),
        }),
      );
    const text = await create({
      type: "SITE_REPORT",
      answer_schema: { type: "text" },
      assurance: { level: "optimistic" },
    });
    expect(text.status).toBe(400);
    expect((await create({ assurance: { level: "optimistic", challenge_minutes: 5 } })).status).toBe(400);
    const ok = await create({ assurance: { level: "optimistic" } });
    expect(ok.status).toBe(201);
    const { verification_id } = (await ok.json()) as { verification_id: string };
    expect((await view(verification_id)).assurance.challenge_minutes).toBe(30);
  });
});
