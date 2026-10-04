import "server-only";
// Pay-per-request with x402 (01 §4.19, 05 §2.9). No API key up front: the agent pays USDC from its own wallet,
// we verify the transaction as our own facilitator, co-sign as fee payer, send it, and only then create the
// verification through the same createVerification path the API key flow uses (TOPUP then RESERVE).

import { ApiError, fromMicro, newId, TASK_TYPES, toMicro } from "@proofmarket/core";
import {
  type CreateVerificationRequest,
  X402CreateVerificationRequestSchema,
} from "@proofmarket/core/schemas/api";
import { type Db, schema } from "@proofmarket/db";
import {
  decodePaymentHeader,
  type PaymentRequirements,
  verifyExactSvmPayment,
  X402_VERSION,
  type X402Facilitator,
} from "@proofmarket/solana";
import { eq } from "drizzle-orm";
import type { RequesterAuth } from "../auth/requester";
import type { AppContext } from "../context";
import { createPrincipal, issueApiKey, topUp } from "./admin-service";
import { requestHash } from "./idempotency";
import { type CreateResult, createdBody, createVerification } from "./requester-service";

/** Limits of the credential each payment gets. Above them the dry run refuses before anything is paid. */
export const X402_LIMITS = { maxTaskAmount: "5", dailySpendLimit: "20", rateLimitPerMin: 30 } as const;
/** About twice a blockhash lifetime: a PENDING row older than this is abandoned and may be retried. */
const PENDING_STALE_MS = 120_000;
const explorer = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

export function parseX402Body(raw: unknown): CreateVerificationRequest {
  // principal_ref is not needed (the wallet is the principal); accept and drop it so SDK bodies work as is.
  let input = raw;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const { principal_ref: _, ...rest } = raw as Record<string, unknown>;
    input = rest;
  }
  const r = X402CreateVerificationRequestSchema.safeParse(input);
  if (!r.success) {
    throw new ApiError("VALIDATION_FAILED", {
      issues: r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  return { ...r.data, principal_ref: "" };
}

export function paymentRequirements(
  f: X402Facilitator,
  body: CreateVerificationRequest,
): PaymentRequirements {
  const amount = toMicro(body.bounty.amount) * BigInt(body.assurance.required_witnesses);
  return {
    scheme: "exact",
    network: f.network,
    amount: amount.toString(),
    asset: f.asset,
    payTo: f.payTo,
    maxTimeoutSeconds: 60,
    extra: { feePayer: f.feePayer },
  };
}

export function paymentRequired(resourceUrl: string, req: PaymentRequirements, error: string) {
  return {
    x402Version: X402_VERSION,
    error,
    resource: {
      url: resourceUrl,
      description: "Create a ProofMarket verification: a person checks it in the real world.",
      mimeType: "application/json",
    },
    accepts: [req],
  };
}

function authFor(credentialId: string, principalId: string, keyPrefix: string): RequesterAuth {
  return {
    credentialId,
    principalId,
    keyPrefix,
    allowedTaskTypes: [...TASK_TYPES],
    limits: {
      maxTaskAmount: X402_LIMITS.maxTaskAmount,
      dailySpendLimit: X402_LIMITS.dailySpendLimit,
      rateLimitPerMin: X402_LIMITS.rateLimitPerMin,
      allowedBbox: null,
    },
  };
}

/** Wallet -> principal (created on first payment), then a fresh credential holding exactly this payment. */
async function creditWallet(tx: Db, payer: string, amount: string) {
  await tx
    .insert(schema.x402Wallets)
    .values({ pubkey: payer, principalId: await createPrincipalFor(tx, payer) })
    .onConflictDoNothing();
  const [w] = await tx.select().from(schema.x402Wallets).where(eq(schema.x402Wallets.pubkey, payer));
  if (!w) throw new Error("x402 wallet row missing");
  const { credentialId, apiKey } = await issueApiKey(tx, {
    principalId: w.principalId,
    requesterName: "x402",
    maxTaskAmount: X402_LIMITS.maxTaskAmount,
    dailySpendLimit: X402_LIMITS.dailySpendLimit,
    rateLimitPerMin: X402_LIMITS.rateLimitPerMin,
    operator: "x402",
  });
  await topUp(tx, credentialId, amount);
  const prefix = apiKey.split("_")[2] ?? "";
  return { auth: authFor(credentialId, w.principalId, prefix), apiKey };
}

// A principal row per attempt would leak rows when the wallet already exists; only create when it is new.
async function createPrincipalFor(tx: Db, payer: string): Promise<string> {
  const [w] = await tx.select().from(schema.x402Wallets).where(eq(schema.x402Wallets.pubkey, payer));
  return (
    w?.principalId ?? createPrincipal(tx, { displayName: `x402:${payer.slice(0, 8)}`, type: "organization" })
  );
}

class Rollback {
  constructor(readonly result: CreateResult) {}
}

/**
 * Run the whole create against a throwaway wallet and roll it back, so a request that would be refused
 * (policy, deadline, limits...) is refused BEFORE anyone pays. Returns what createVerification returned.
 */
export async function dryRun(app: AppContext, body: CreateVerificationRequest): Promise<CreateResult> {
  try {
    await app.db.transaction(async (tx) => {
      const amount = fromMicro(toMicro(body.bounty.amount) * BigInt(body.assurance.required_witnesses));
      const { auth } = await creditWallet(tx, `dry-run-${newId("principal")}`, amount);
      const result = await createVerification(
        app,
        tx,
        auth,
        { ...body, principal_ref: auth.principalId },
        "x402:dry-run",
      );
      throw new Rollback(result);
    });
  } catch (e) {
    if (e instanceof Rollback) return e.result;
    throw e;
  }
  throw new Error("unreachable");
}

export type X402Outcome =
  | { kind: "required"; body: ReturnType<typeof paymentRequired> }
  | { kind: "reused"; result: CreateResult }
  | {
      kind: "rejected";
      body: ReturnType<typeof paymentRequired>;
      settlement: Record<string, unknown>;
      status: 400 | 402;
    }
  | {
      kind: "created";
      status: 200 | 201;
      body: Record<string, unknown>;
      settlement: Record<string, unknown>;
      verificationId: string | null;
    };

export async function createWithPayment(
  app: AppContext,
  resourceUrl: string,
  raw: unknown,
  paymentHeader: string | null,
): Promise<X402Outcome> {
  const body = parseX402Body(raw);
  const f = app.x402();
  const req = paymentRequirements(f, body);
  const reject = (reason: string, status: 400 | 402 = 402, payer = ""): X402Outcome => ({
    kind: "rejected",
    status,
    body: paymentRequired(resourceUrl, req, reason),
    settlement: { success: false, errorReason: reason, transaction: "", network: f.network, payer },
  });

  // Refuse what would be refused anyway before asking for money. A shared result costs nothing (01 §4.9).
  const preview = await dryRun(app, body);
  if (preview.body.reused) return { kind: "reused", result: preview };

  if (!paymentHeader) {
    return {
      kind: "required",
      body: paymentRequired(resourceUrl, req, "PAYMENT-SIGNATURE header is required"),
    };
  }
  const payload = decodePaymentHeader(paymentHeader);
  if (!payload) return reject("invalid_payload", 400);
  const v = verifyExactSvmPayment(payload, req, f.decimals);
  if (!v.ok) return reject(v.reason);
  if (!(await f.accountExists(v.source))) return reject("insufficient_funds", 402, v.payer);

  const signature = f.signatureOf(v.tx);
  const amount = fromMicro(v.amount);
  const reqHash = requestHash(raw);
  const settlement = { success: true, transaction: signature, network: f.network, payer: v.payer };
  const paymentInfo = {
    signature,
    explorer_url: explorer(signature),
    network: f.network,
    payer: v.payer,
    amount,
  };

  // Duplicate-settlement guard (scheme §"Duplicate Settlement Mitigation"), kept in the DB so it holds across
  // serverless instances. A payment that already made a verification is replayed, never spent twice.
  const claim = await app.db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(schema.x402Payments)
      .where(eq(schema.x402Payments.signature, signature))
      .for("update");
    if (row) {
      if (!row.requestHash.equals(reqHash)) throw new ApiError("PAYMENT_ALREADY_USED");
      if (row.state === "CONFIRMED") return { replay: row };
      if (row.state === "PENDING" && app.now().getTime() - row.updatedAt.getTime() < PENDING_STALE_MS) {
        throw new ApiError("PAYMENT_IN_PROGRESS");
      }
      await tx
        .update(schema.x402Payments)
        .set({ state: "PENDING", error: null, updatedAt: app.now() })
        .where(eq(schema.x402Payments.signature, signature));
      return { replay: null };
    }
    await tx.insert(schema.x402Payments).values({
      signature,
      payer: v.payer,
      amount,
      state: "PENDING",
      requestHash: reqHash,
      createdAt: app.now(),
      updatedAt: app.now(),
    });
    return { replay: null };
  });
  if (claim.replay) {
    if (!claim.replay.verificationId) throw new ApiError("PAYMENT_ALREADY_USED");
    const [task] = await app.db
      .select()
      .from(schema.verificationRequests)
      .where(eq(schema.verificationRequests.id, claim.replay.verificationId));
    if (!task) throw new Error("x402 payment points at a missing verification");
    return {
      kind: "created",
      status: 200,
      body: { ...createdBody(task), api_key: null, payment: paymentInfo },
      settlement,
      verificationId: null,
    };
  }

  const sent = await f.settle(v.tx);
  if (!sent.ok) {
    await app.db
      .update(schema.x402Payments)
      .set({ state: "FAILED", error: sent.error.slice(0, 300), updatedAt: app.now() })
      .where(eq(schema.x402Payments.signature, signature));
    return reject("invalid_transaction_state", 402, v.payer);
  }

  // Paid. Credit the wallet and create the verification in one transaction; if the create is refused now
  // (something changed since the dry run), the money stays as balance on the returned key instead.
  try {
    return await app.db.transaction(async (tx) => {
      const { auth, apiKey } = await creditWallet(tx, v.payer, amount);
      const created = await createVerification(
        app,
        tx,
        auth,
        { ...body, principal_ref: auth.principalId },
        `x402:${signature}`,
      );
      await tx
        .update(schema.x402Payments)
        .set({
          state: "CONFIRMED",
          credentialId: auth.credentialId,
          verificationId: created.body.verification_id,
          updatedAt: app.now(),
        })
        .where(eq(schema.x402Payments.signature, signature));
      return {
        kind: "created" as const,
        status: created.status,
        body: { ...created.body, api_key: apiKey, payment: paymentInfo },
        settlement,
        verificationId: created.status === 201 ? created.body.verification_id : null,
      };
    });
  } catch (e) {
    if (!(e instanceof ApiError)) throw e;
    const apiKey = await app.db.transaction(async (tx) => {
      const c = await creditWallet(tx, v.payer, amount);
      await tx
        .update(schema.x402Payments)
        .set({ state: "CONFIRMED", credentialId: c.auth.credentialId, updatedAt: app.now() })
        .where(eq(schema.x402Payments.signature, signature));
      return c.apiKey;
    });
    throw new ApiError(e.code, {
      ...e.details,
      x402: { paid: true, credited_to_api_key: apiKey, balance: amount, payment: paymentInfo },
    });
  }
}
