// Platform fee, 15% on top (docs/architecture 13 §6.1): quoted with the bounty, reserved with it, kept only for
// the witnesses who are paid, and handed back with everything that is not paid. Rechecks carry no fee.
import { PLATFORM_FEE_BPS } from "@proofmarket/core";
import { schema } from "@proofmarket/db";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { handleCancel, handleCreate, handleDispute, handleQuote } from "../lib/handlers/requester";
import { tick } from "../lib/services/jobs";
import { paymentRequirements } from "../lib/services/x402-service";
import { call, createBody, createTestApp, jsonReq } from "./support/app";
import { onboardWorker, witness } from "./support/worker";

let t: Awaited<ReturnType<typeof createTestApp>>;
let alice: string;
beforeEach(async () => {
  t = await createTestApp();
  t.app.config.platformFeeBps = PLATFORM_FEE_BPS;
  alice = (await onboardWorker(t, "alice")).token;
});

const MIN = 60_000;
const TWO = { required_witnesses: 2, quorum: 2 };

const create = async (o: Record<string, unknown> = {}) => {
  const res = await call(
    (r) => handleCreate(t.app, r),
    jsonReq("POST", "/v1/verifications", {
      key: t.apiKey,
      body: createBody(t.principalId, o),
      idem: crypto.randomUUID(),
    }),
  );
  expect(res.status).toBe(201);
  return ((await res.json()) as { verification_id: string }).verification_id;
};
const ledger = async (id: string) =>
  (await t.db.select().from(schema.requesterLedger).where(eq(schema.requesterLedger.verificationId, id)))
    .map((l) => `${l.entryType}:${Number(l.amount)}`)
    .sort();
const balance = async () =>
  (
    await t.db
      .select()
      .from(schema.requesterLedger)
      .where(eq(schema.requesterLedger.credentialId, t.credentialId))
  ).reduce((a, l) => a + Number(l.amount), 0);
const task = async (id: string) =>
  (await t.db.select().from(schema.verificationRequests).where(eq(schema.verificationRequests.id, id)))[0];

describe("platform fee (13 §6.1)", () => {
  it("the quote shows the bounty, the fee and the total", async () => {
    const res = await call(
      (r) => handleQuote(t.app, r),
      jsonReq("POST", "/v1/verifications/quote", {
        key: t.apiKey,
        body: createBody(t.principalId, { assurance: TWO }),
      }),
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      bounty_total: "1",
      platform_fee: { rate_bps: 1500, amount: "0.15" },
      total: "1.15",
      balance: "10",
      balance_after: "8.85",
    });
  });

  it("reserves bounty + fee, escrows the bounty only, and keeps the whole fee when everyone is paid", async () => {
    const before = await balance();
    const id = await create();
    expect(await ledger(id)).toEqual(["RESERVE:-0.575"]);
    expect(await task(id)).toMatchObject({ platformFeeAmount: "0.075000", feeRateBps: 1500 });
    const [fund] = await t.db
      .select()
      .from(schema.paymentRecords)
      .where(eq(schema.paymentRecords.verificationId, id));
    expect(Number(fund?.amount)).toBe(0.5);
    await tick(t.app);
    expect([...t.chain.tasks.values()][0]?.amountPerWitness).toBe(500_000n);

    await witness(t, alice, id);
    await tick(t.app);
    expect((await task(id))?.status).toBe("SETTLED");
    expect((await task(id))?.platformFeeEarned).toBe("0.075000");
    expect(await ledger(id)).toEqual(["RESERVE:-0.575"]);
    expect(await balance()).toBeCloseTo(before - 0.575, 6);
  });

  it("one witness paid of two: the fee is kept for that one, the rest comes back with the unpaid bounty", async () => {
    const id = await create({ assurance: TWO });
    expect(await ledger(id)).toEqual(["RESERVE:-1.15"]);
    await tick(t.app);
    await witness(t, alice, id);
    t.advance(60 * MIN);
    await tick(t.app); // deadline -> EXPIRED with one valid
    await tick(t.app); // settle
    expect((await task(id))?.platformFeeEarned).toBe("0.075000");
    expect(await ledger(id)).toEqual(["RELEASE:0.575", "RESERVE:-1.15"]);
  });

  it("nobody comes: bounty and fee are refunded in full", async () => {
    const before = await balance();
    const id = await create({ assurance: TWO });
    await tick(t.app);
    t.advance(60 * MIN);
    await tick(t.app);
    await tick(t.app);
    expect((await task(id))?.status).toBe("REFUNDED");
    expect(await ledger(id)).toEqual(["REFUND:1.15", "RESERVE:-1.15"]);
    expect(await balance()).toBeCloseTo(before, 6);
  });

  it("a cancel before anyone claims gives the fee back too", async () => {
    const before = await balance();
    const id = await create();
    const res = await call(
      (r) => handleCancel(t.app, r, id),
      jsonReq("POST", `/v1/verifications/${id}/cancel`, { key: t.apiKey }),
    );
    expect(res.status).toBe(200);
    await tick(t.app);
    expect(await balance()).toBeCloseTo(before, 6);
  });

  it("a dispute's recheck carries no fee", async () => {
    const id = await create();
    await tick(t.app);
    await witness(t, alice, id);
    const res = await call(
      (r) => handleDispute(t.app, r, id),
      jsonReq("POST", `/v1/verifications/${id}/dispute`, { key: t.apiKey, body: {} }),
    );
    expect(res.status).toBe(201);
    const recheck = ((await res.json()) as { recheck_verification_id: string }).recheck_verification_id;
    expect(await task(recheck)).toMatchObject({ platformFeeAmount: "0.000000", feeRateBps: 0 });
    expect(await ledger(recheck)).toEqual(["RESERVE:-1"]); // 2 witnesses × 0.5, no fee
  });

  it("x402 asks for bounty + fee", () => {
    const { principal_ref: _, ...b } = createBody("unused");
    const req = paymentRequirements(t.app.x402(), { ...b, principal_ref: "" } as never, PLATFORM_FEE_BPS);
    expect(req.amount).toBe("575000");
  });
});
