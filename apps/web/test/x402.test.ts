// x402 pay-per-request (01 §4.19, 05 §2.9): 402 terms, a verified payment creating the task, and every
// facilitator MUST of the exact SVM scheme refusing a bad transaction before the fee payer signs.
import { schema } from "@proofmarket/db";
import {
  buildExactSvmPayment,
  decodePaymentHeader,
  encodeHeader,
  type PaymentRequirements,
} from "@proofmarket/solana";
import { Keypair, PublicKey, SystemProgram, TransactionInstruction } from "@proofmarket/solana/web3";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { handleGet } from "../lib/handlers/requester";
import { handleX402Create } from "../lib/handlers/x402";
import { call, createBody, createTestApp, jsonReq } from "./support/app";

let t: Awaited<ReturnType<typeof createTestApp>>;
const agent = Keypair.fromSeed(new Uint8Array(32).fill(3));
const BLOCKHASH = "GHtXQBsoZHVnNfa9YevAzFr17DJjgHXk3ycTKD5xD3Zi";

beforeEach(async () => {
  t = await createTestApp();
});

// x402 bodies carry no principal_ref.
const body = (o: Record<string, unknown> = {}) => {
  const { principal_ref: _, ...b } = createBody("unused", o);
  return b;
};
const post = (b: unknown, payment?: string) =>
  call(
    async (r) => (await handleX402Create(t.app, r)).res,
    jsonReq("POST", "/v1/x402/verifications", {
      body: b,
      headers: payment ? { "payment-signature": payment } : {},
    }),
  );
const decode = (h: string | null) => JSON.parse(Buffer.from(h ?? "", "base64").toString("utf8"));

async function terms(b = body()): Promise<PaymentRequirements> {
  const res = await post(b);
  expect(res.status).toBe(402);
  const req = decode(res.headers.get("payment-required"));
  return req.accepts[0];
}

function pay(req: PaymentRequirements, o: Partial<Parameters<typeof buildExactSvmPayment>[0]> = {}) {
  const transaction = buildExactSvmPayment({
    requirements: req,
    owner: agent,
    recentBlockhash: BLOCKHASH,
    decimals: 6,
    ...o,
  });
  return encodeHeader({ x402Version: 2, accepted: req, payload: { transaction } });
}

async function rejectedWith(res: Response): Promise<string> {
  expect(res.status).toBe(402);
  return decode(res.headers.get("payment-response")).errorReason;
}

describe("POST /v1/x402/verifications", () => {
  it("without a payment: 402 with the exact SVM terms for bounty x witnesses, nothing created", async () => {
    const res = await post(body({ assurance: { required_witnesses: 2, quorum: 2 } }));
    expect(res.status).toBe(402);
    const header = decode(res.headers.get("payment-required"));
    expect(header).toEqual(await res.json());
    expect(header.x402Version).toBe(2);
    expect(header.accepts).toEqual([
      {
        scheme: "exact",
        network: "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
        amount: "1000000",
        asset: t.x402.asset,
        payTo: t.x402.payTo,
        maxTimeoutSeconds: 60,
        extra: { feePayer: t.x402.feePayer },
      },
    ]);
    expect(await t.db.select().from(schema.verificationRequests)).toHaveLength(0);
    expect(await t.db.select().from(schema.x402Wallets)).toHaveLength(0);
  });

  it("refuses an invalid request before asking for money", async () => {
    const res = await post(body({ deadline: "2026-10-09T03:01:00Z" }));
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("DEADLINE_OUT_OF_RANGE");
    // no cap on the bounty: a large one is simply priced
    const large = await post(body({ bounty: { asset: "USDC", amount: "600", network: "solana-devnet" } }));
    expect(large.status).toBe(402);
    expect(((await large.json()) as { accepts: { amount: string }[] }).accepts[0]?.amount).toBe("600000000");
  });

  it("a valid payment settles, creates the task through TOPUP + RESERVE, and returns a working API key", async () => {
    const req = await terms();
    const res = await post(body(), pay(req));
    expect(res.status).toBe(201);
    const out = (await res.json()) as {
      verification_id: string;
      status: string;
      api_key: string;
      payment: { signature: string; explorer_url: string; payer: string; amount: string };
    };
    expect(out.status).toBe("CREATED");
    expect(out.payment.payer).toBe(agent.publicKey.toBase58());
    expect(out.payment.amount).toBe("0.5");
    expect(out.payment.explorer_url).toContain(out.payment.signature);
    expect(t.x402.settled).toEqual([out.payment.signature]);
    expect(decode(res.headers.get("payment-response"))).toMatchObject({
      success: true,
      transaction: out.payment.signature,
      payer: agent.publicKey.toBase58(),
    });

    const [wallet] = await t.db.select().from(schema.x402Wallets);
    expect(wallet?.pubkey).toBe(agent.publicKey.toBase58());
    const [principal] = await t.db
      .select()
      .from(schema.principals)
      .where(eq(schema.principals.id, wallet?.principalId ?? ""));
    expect(principal?.displayName).toBe(`x402:${agent.publicKey.toBase58().slice(0, 8)}`);
    const [task] = await t.db
      .select()
      .from(schema.verificationRequests)
      .where(eq(schema.verificationRequests.id, out.verification_id));
    const ledger = await t.db
      .select()
      .from(schema.requesterLedger)
      .where(eq(schema.requesterLedger.credentialId, task?.credentialId ?? ""));
    expect(ledger.map((l) => [l.entryType, l.amount])).toEqual([
      ["TOPUP", "0.500000"],
      ["RESERVE", "-0.500000"],
    ]);
    const [payment] = await t.db.select().from(schema.x402Payments);
    expect(payment).toMatchObject({ state: "CONFIRMED", verificationId: out.verification_id });

    const view = await call(
      (r) => handleGet(t.app, r, out.verification_id),
      jsonReq("GET", `/v1/verifications/${out.verification_id}`, { key: out.api_key }),
    );
    expect(view.status).toBe(200);
  });

  it("the same wallet keeps one principal; each payment gets its own key", async () => {
    const req = await terms();
    const a = (await (await post(body(), pay(req))).json()) as { api_key: string };
    const b = (await (await post(body(), pay(req))).json()) as { api_key: string };
    expect(a.api_key).not.toBe(b.api_key);
    expect(await t.db.select().from(schema.x402Wallets)).toHaveLength(1);
    expect(await t.db.select().from(schema.verificationRequests)).toHaveLength(2);
  });

  it("the same payment twice creates one task: the replay returns it without a key and is not sent again", async () => {
    const req = await terms();
    const header = pay(req);
    const first = (await (await post(body(), header)).json()) as { verification_id: string };
    const again = await post(body(), header);
    expect(again.status).toBe(200);
    expect(await again.json()).toMatchObject({ verification_id: first.verification_id, api_key: null });
    expect(t.x402.settled).toHaveLength(1);
    expect(await t.db.select().from(schema.verificationRequests)).toHaveLength(1);
    // ...and cannot be spent on a different request.
    const other = await post(body({ question: "Is the shutter down?" }), header);
    expect(other.status).toBe(409);
    expect(((await other.json()) as { error: { code: string } }).error.code).toBe("PAYMENT_ALREADY_USED");
  });

  it("a payment being settled right now is refused as in progress", async () => {
    const req = await terms();
    const header = pay(req);
    const sig = t.x402.signatureOf(
      (await import("@proofmarket/solana/web3")).VersionedTransaction.deserialize(
        Buffer.from(decodePaymentHeader(header)?.payload.transaction ?? "", "base64"),
      ),
    );
    const { requestHash } = await import("../lib/services/idempotency");
    await t.db.insert(schema.x402Payments).values({
      signature: sig,
      payer: agent.publicKey.toBase58(),
      amount: "0.5",
      state: "PENDING",
      requestHash: requestHash(body()),
      createdAt: t.app.now(),
      updatedAt: t.app.now(),
    });
    const res = await post(body(), header);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe("PAYMENT_IN_PROGRESS");
    expect(t.x402.settled).toHaveLength(0);
    // Abandoned after 120 s: the same payment may be settled.
    t.advance(121_000);
    expect((await post(body(), header)).status).toBe(201);
  });

  it("rejects a wrong amount", async () => {
    const req = await terms();
    expect(await rejectedWith(await post(body(), pay(req, { amount: 499_999n })))).toBe(
      "invalid_exact_svm_payload_amount_mismatch",
    );
  });

  it("rejects a transfer to anyone but the operator's token account", async () => {
    const req = await terms();
    const elsewhere = Keypair.generate().publicKey;
    expect(await rejectedWith(await post(body(), pay(req, { destination: elsewhere })))).toBe(
      "invalid_exact_svm_payload_recipient_mismatch",
    );
  });

  it("rejects another mint", async () => {
    const req = await terms();
    expect(await rejectedWith(await post(body(), pay(req, { mint: Keypair.generate().publicKey })))).toBe(
      "invalid_exact_svm_payload_mint",
    );
  });

  it("rejects payment terms the client changed (cheaper amount in `accepted`)", async () => {
    const req = await terms();
    const cheap = { ...req, amount: "1" };
    expect(await rejectedWith(await post(body(), pay(cheap)))).toBe("invalid_payment_requirements");
  });

  it("rejects any use of the fee payer inside the instructions", async () => {
    const req = await terms();
    const feePayer = new PublicKey(req.extra.feePayer);
    // A trailing instruction that would drain the fee payer's SOL.
    const drain = SystemProgram.transfer({ fromPubkey: feePayer, toPubkey: agent.publicKey, lamports: 1 });
    expect(await rejectedWith(await post(body(), pay(req, { extraInstructions: [drain] })))).toBe(
      "invalid_exact_svm_payload_fee_payer",
    );
    // Same account hidden in a memo's account list.
    const memo = new TransactionInstruction({
      programId: new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr"),
      keys: [{ pubkey: feePayer, isSigner: false, isWritable: false }],
      data: Buffer.from("x"),
    });
    expect(await rejectedWith(await post(body(), pay(req, { extraInstructions: [memo] })))).toBe(
      "invalid_exact_svm_payload_fee_payer",
    );
  });

  it("rejects extra instructions from other programs and an expensive compute price", async () => {
    const req = await terms();
    const other = SystemProgram.transfer({
      fromPubkey: agent.publicKey,
      toPubkey: Keypair.generate().publicKey,
      lamports: 1,
    });
    expect(await rejectedWith(await post(body(), pay(req, { extraInstructions: [other] })))).toBe(
      "invalid_exact_svm_payload_instructions",
    );
    expect(await rejectedWith(await post(body(), pay(req, { computeUnitPrice: 5_000_001n })))).toBe(
      "invalid_exact_svm_payload_compute_price",
    );
  });

  it("rejects a source token account that does not exist, and a malformed header", async () => {
    const req = await terms();
    t.x402.existing.add("someone-else");
    expect(await rejectedWith(await post(body(), pay(req)))).toBe("insufficient_funds");
    const bad = await post(body(), "not-base64-json");
    expect(bad.status).toBe(400);
  });

  it("a failed settlement creates nothing and the same payment can be retried", async () => {
    const req = await terms();
    const header = pay(req);
    t.x402.settleMode = "fail";
    expect(await rejectedWith(await post(body(), header))).toBe("invalid_transaction_state");
    expect(await t.db.select().from(schema.verificationRequests)).toHaveLength(0);
    const [row] = await t.db.select().from(schema.x402Payments);
    expect(row?.state).toBe("FAILED");
    t.x402.settleMode = "ok";
    expect((await post(body(), header)).status).toBe(201);
  });
});
