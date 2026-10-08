// Rising bounty (13 §1): reserve the ceiling, fix the amount at the first claim, hand the rest back, settle it.
import { schema } from "@proofmarket/db";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { handleCreate, handleGet } from "../lib/handlers/requester";
import { tick } from "../lib/services/jobs";
import { parseX402Body } from "../lib/services/x402-service";
import { call, createBody, createTestApp, jsonReq } from "./support/app";
import { onboardWorker, W, witness } from "./support/worker";

let t: Awaited<ReturnType<typeof createTestApp>>;
let alice: string;
let bob: string;
beforeEach(async () => {
  t = await createTestApp();
  alice = (await onboardWorker(t, "alice")).token;
  bob = (await onboardWorker(t, "bob")).token;
});

const RISING = { asset: "USDC", amount: "0.30", max_amount: "0.60", network: "solana-devnet" };
const TWO = { required_witnesses: 2, quorum: 2 };
const MIN = 60_000;

const post = (o: Record<string, unknown>) =>
  call(
    (r) => handleCreate(t.app, r),
    jsonReq("POST", "/v1/verifications", {
      key: t.apiKey,
      body: createBody(t.principalId, o),
      idem: crypto.randomUUID(),
    }),
  );
const create = async (o: Record<string, unknown>) => {
  const res = await post(o);
  expect(res.status).toBe(201);
  return ((await res.json()) as { verification_id: string }).verification_id;
};
// biome-ignore lint/suspicious/noExplicitAny: test convenience
const view = async (id: string): Promise<any> =>
  (
    await call((r) => handleGet(t.app, r, id), jsonReq("GET", `/v1/verifications/${id}`, { key: t.apiKey }))
  ).json();
const balance = async () =>
  (
    await t.db
      .select()
      .from(schema.requesterLedger)
      .where(eq(schema.requesterLedger.credentialId, t.credentialId))
  ).reduce((a, l) => a + Number(l.amount), 0);
const ledger = async (id: string) =>
  (await t.db.select().from(schema.requesterLedger).where(eq(schema.requesterLedger.verificationId, id)))
    .map((l) => `${l.entryType}:${Number(l.amount)}`)
    .sort();
const task = async (id: string) =>
  (await t.db.select().from(schema.verificationRequests).where(eq(schema.verificationRequests.id, id)))[0];
const claims = async (id: string) =>
  (await t.db.select().from(schema.claims).where(eq(schema.claims.verificationId, id))).map(
    (c) => c.rewardAmount,
  );
// biome-ignore lint/suspicious/noExplicitAny: test convenience
const listed = async (token: string, id: string): Promise<any> =>
  ((await (await W(t, token).list()).json()) as { tasks: { verification_id: string }[] }).tasks.find(
    (x) => x.verification_id === id,
  );

describe("rising bounty (13 §1)", () => {
  it("reserves and escrows the ceiling; the ramp defaults to the time until the deadline", async () => {
    const id = await create({ bounty: RISING, assurance: TWO });
    expect(await ledger(id)).toEqual(["RESERVE:-1.2"]);
    const [fund] = await t.db
      .select()
      .from(schema.paymentRecords)
      .where(eq(schema.paymentRecords.verificationId, id));
    expect(Number(fund?.amount)).toBe(1.2);
    await tick(t.app);
    expect([...t.chain.tasks.values()][0]?.amountPerWitness).toBe(600_000n);
    expect((await view(id)).bounty).toEqual({
      asset: "USDC",
      amount: "0.3",
      network: "solana-devnet",
      max_amount: "0.6",
      ramp_minutes: 60, // created 03:00, deadline 04:00
      current_amount: "0.3",
    });
  });

  it("the first claim fixes the amount for everyone, hands the rest back, and settle pays it", async () => {
    const before = await balance();
    const id = await create({ bounty: { ...RISING, ramp_minutes: 60 }, assurance: TWO });
    await tick(t.app);
    expect((await listed(alice, id)).reward).toEqual({
      asset: "USDC",
      amount: "0.3",
      current: "0.3",
      max: "0.6",
      rises_until: "2026-10-09T04:00:00.000Z",
    });

    t.advance(24 * MIN);
    expect((await listed(alice, id)).reward).toMatchObject({ current: "0.42", max: "0.6" });
    expect((await view(id)).bounty.current_amount).toBe("0.42");
    await witness(t, alice, id);
    expect((await task(id))?.bountyFinalAmount).toBe("0.420000");
    // (0.60 - 0.42) × 2 is back in the balance at once.
    expect(await ledger(id)).toEqual(["RESERVE:-0.84"]);
    expect(await balance()).toBeCloseTo(before - 0.84, 6);

    // Later claims get the same amount, and the listing stops rising.
    t.advance(10 * MIN);
    expect((await listed(bob, id)).reward).toEqual({
      asset: "USDC",
      amount: "0.42",
      current: "0.42",
      max: "0.6",
      rises_until: null,
    });
    await witness(t, bob, id);
    expect(await claims(id)).toEqual(["0.420000", "0.420000"]);
    expect((await view(id)).status).toBe("VERIFIED");

    await tick(t.app);
    const v = await view(id);
    expect(v.status).toBe("SETTLED");
    expect(v.bounty.current_amount).toBe("0.42");
    expect(v.result.settlement.paid.map((p: { amount: string }) => p.amount)).toEqual(["0.42", "0.42"]);
    const onChain = [...t.chain.tasks.values()][0];
    expect([onChain?.amountPerWitness, onChain?.paidTotal]).toEqual([420_000n, 840_000n]);
    expect(await ledger(id)).toEqual(["RESERVE:-0.84"]); // all paid, nothing more to credit back
    const audit = await t.db
      .select()
      .from(schema.auditEvents)
      .where(eq(schema.auditEvents.verificationId, id));
    expect(audit.find((a) => a.eventType === "bounty_fixed")?.metadata).toEqual({
      amount: "0.42",
      released: "0.36",
    });
  });

  it("one valid of two at the deadline: paid the fixed amount, the rest released", async () => {
    const id = await create({ bounty: { ...RISING, ramp_minutes: 60 }, assurance: TWO });
    await tick(t.app);
    t.advance(30 * MIN);
    await witness(t, alice, id); // fixed at 0.45
    t.advance(30 * MIN);
    await tick(t.app); // deadline -> EXPIRED
    await tick(t.app); // settle
    const v = await view(id);
    expect(v.result.settlement.paid.map((p: { amount: string }) => p.amount)).toEqual(["0.45"]);
    expect(await ledger(id)).toEqual(["RELEASE:0.45", "RESERVE:-0.9"]);
  });

  it("nobody comes: the whole ceiling is refunded", async () => {
    const before = await balance();
    const id = await create({ bounty: RISING, assurance: TWO });
    await tick(t.app);
    t.advance(60 * MIN);
    await tick(t.app);
    await tick(t.app);
    expect((await view(id)).status).toBe("REFUNDED");
    expect(await ledger(id)).toEqual(["REFUND:1.2", "RESERVE:-1.2"]);
    expect(await balance()).toBeCloseTo(before, 6);
  });

  it("fixed bounties are unchanged: no max, no claim reward, finalize sends no amount", async () => {
    const id = await create({});
    await tick(t.app);
    expect((await listed(alice, id)).reward).toEqual({
      asset: "USDC",
      amount: "0.5",
      current: "0.5",
      max: null,
      rises_until: null,
    });
    await witness(t, alice, id);
    expect(await claims(id)).toEqual([null]);
    await tick(t.app);
    expect((await view(id)).bounty).toMatchObject({
      max_amount: null,
      ramp_minutes: null,
      current_amount: "0.5",
    });
  });

  it("refuses a ceiling below the start, a ramp without a ceiling, and any ceiling while the flag is off", async () => {
    const reason = async (res: Response) =>
      ((await res.json()) as { error: { code: string; details: unknown } }).error;
    const low = await post({ bounty: { ...RISING, max_amount: "0.2" } });
    expect(low.status).toBe(400);
    expect((await reason(low)).code).toBe("VALIDATION_FAILED");
    const ramp = await post({
      bounty: { asset: "USDC", amount: "0.3", network: "solana-devnet", ramp_minutes: 30 },
    });
    expect(ramp.status).toBe(400);
    expect((await post({ bounty: { ...RISING, ramp_minutes: 5 } })).status).toBe(400);

    t.app.config.risingBountyEnabled = false;
    const off = await post({ bounty: RISING });
    expect(off.status).toBe(400);
    expect((await reason(off)).details).toMatchObject({ field: "bounty.max_amount", reason: "disabled" });
    expect((await post({})).status).toBe(201);
  });

  it("x402 refuses a rising bounty (an exact payment has nowhere to return the difference)", () => {
    const body = { ...createBody(t.principalId, { bounty: RISING }) };
    expect(() => parseX402Body(body)).toThrow();
    expect(() => parseX402Body(createBody(t.principalId))).not.toThrow();
  });
});
