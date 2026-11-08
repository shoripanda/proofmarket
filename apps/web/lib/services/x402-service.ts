import "server-only";
// Pay-per-request with x402 (01 §4.19, 05 §2.9). No API key up front: the agent pays USDC from its own wallet,
// we verify the transaction as our own facilitator, co-sign as fee payer, send it, and only then create the
// verification through the same createVerification path the API key flow uses (TOPUP then RESERVE).

import { ApiError, fromMicro, newId, platformFeeMicro, TASK_TYPES, toMicro } from "@proofmarket/core";
import {
  type CreateVerificationRequest,
  X402CreateVerificationRequestSchema,
  X402CreateVerificationResponseSchema,
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
import { z } from "zod";
import type { RequesterAuth } from "../auth/requester";
import { clusterText } from "../cluster-public";
import type { AppContext } from "../context";
import { createPrincipal, issueApiKey, topUp } from "./admin-service";
import { requestHash } from "./idempotency";
import { type CreateResult, createdBody, createVerification } from "./requester-service";

/** Values stored on the credential each payment gets. No ceiling: the payment itself is the bound (owner, 2026-10-15). */
export const X402_LIMITS = { maxTaskAmount: null, dailySpendLimit: null, rateLimitPerMin: 30 } as const;
/** About twice a blockhash lifetime: a PENDING row older than this is abandoned and may be retried. */
const PENDING_STALE_MS = 120_000;
const explorer = (sig: string) => clusterText().explorerTx(sig);

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
  // 15 §3.3: the x402 "exact" scheme moves an SPL token; payments stay in USDC.
  if (r.data.bounty.asset !== "USDC") {
    throw new ApiError("UNSUPPORTED_ASSET", { field: "bounty.asset", reason: "x402_usdc_only" });
  }
  // 13 §1: a rising bounty hands back what is not paid, but an x402 payment is exact and its credential is
  // throwaway, so the difference would have nowhere to go. Rising bounties need an API key.
  if (r.data.bounty.max_amount !== undefined) {
    throw new ApiError("VALIDATION_FAILED", { field: "bounty.max_amount", reason: "not_for_x402" });
  }
  // 13 §3: a challenge can charge the requester for the recheck, which a throwaway credential cannot pay.
  if ("challenge_minutes" in r.data.assurance) {
    throw new ApiError("VALIDATION_FAILED", { field: "assurance.level", reason: "not_for_x402" });
  }
  return { ...r.data, principal_ref: "" };
}

/** What an x402 request costs: bounty × witnesses plus the platform fee (13 §6.1). */
export function x402TotalMicro(body: CreateVerificationRequest, feeBps: number): bigint {
  const bounty = toMicro(body.bounty.amount) * BigInt(body.assurance.required_witnesses);
  return bounty + platformFeeMicro(bounty, feeBps);
}

export function paymentRequirements(
  f: X402Facilitator,
  body: CreateVerificationRequest,
  feeBps: number,
): PaymentRequirements {
  const amount = x402TotalMicro(body, feeBps);
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

/**
 * A body an agent can send as it is: a hands-on task that needs no place, one witness, 0.10 USDC. It is the
 * example in the Bazaar extension below and what an empty probe is priced at (docs/ops/x402-discovery.md).
 */
export function exampleX402Body(app: AppContext): CreateVerificationRequest {
  return {
    type: "CUSTOM_TASK",
    question: "Write down, by hand, one thing an AI could not have checked for you today, and photograph it.",
    answer_schema: { type: "text" },
    deadline: new Date(app.now().getTime() + 60 * 60_000).toISOString(),
    freshness: { max_age_seconds: 300 },
    evidence_requirements: { photo: true, task_nonce: true },
    assurance: { required_witnesses: 1, quorum: 1 },
    bounty: { asset: "USDC", amount: "0.10", network: clusterText(app.config.cluster).network },
  } as CreateVerificationRequest;
}

/**
 * The top level of a request or response schema: each field with its type (and enum or const), nested objects
 * left open. The full schema (all task types) is about 14 KB and would ride in the PAYMENT-REQUIRED header, past
 * what some proxies pass; the details are in /openapi.json.
 */
function shallowSchema(s: z.ZodType, description: string) {
  const full = z.toJSONSchema(s, { target: "draft-2020-12", io: "input", unrepresentable: "any" }) as {
    properties?: Record<string, Record<string, unknown>>;
    required?: string[];
  };
  const keep = (p: Record<string, unknown>) => {
    const out: Record<string, unknown> = {};
    for (const k of ["type", "enum", "const", "description"] as const) if (k in p) out[k] = p[k];
    if (!("type" in out) && !("enum" in out) && !("const" in out)) {
      const alt = (p.anyOf ?? p.oneOf) as Record<string, unknown>[] | undefined;
      const types = [...new Set((alt ?? []).map((a) => a.type).filter(Boolean))];
      if (types.length === 1) out.type = types[0];
      else if (types.length > 1) out.type = types;
    }
    return out;
  };
  return {
    type: "object",
    description,
    properties: Object.fromEntries(Object.entries(full.properties ?? {}).map(([k, v]) => [k, keep(v)])),
    required: full.required ?? [],
  };
}
let bazaarSchemas: { body: unknown; output: unknown } | null = null;

/**
 * The x402 Bazaar discovery extension (coinbase/x402 specs/extensions/bazaar.md): how to call this resource and
 * what comes back, so directories such as x402scan can index it and an agent can build a valid body.
 */
function bazaarExtension(example: CreateVerificationRequest) {
  bazaarSchemas ??= {
    body: shallowSchema(
      X402CreateVerificationRequestSchema,
      "Same body as POST /v1/verifications without principal_ref; bounty.asset must be USDC. Every field: /openapi.json",
    ),
    output: shallowSchema(X402CreateVerificationResponseSchema, "201 response"),
  };
  return {
    info: {
      input: { type: "http", method: "POST", bodyType: "json", body: example },
      output: {
        type: "json",
        example: {
          verification_id: "vrf_01JEXAMPLE0000000000000000",
          status: "CREATED",
          created_at: "2026-11-08T12:00:00.000Z",
          funding: { status: "PENDING" },
          api_key: "<shown once: reads the result with GET /v1/verifications/{id}>",
          payment: {
            signature: "<base58 transaction signature>",
            explorer_url: "https://explorer.solana.com/tx/<signature>",
            network: example.bounty.network,
            payer: "<payer wallet>",
            amount: "<bounty x witnesses + fee>",
          },
        },
      },
    },
    schema: {
      $schema: "https://json-schema.org/draft/2020-12/schema",
      type: "object",
      properties: {
        input: {
          type: "object",
          properties: {
            type: { type: "string", const: "http" },
            method: { type: "string", enum: ["POST"] },
            bodyType: { type: "string", enum: ["json"] },
            body: bazaarSchemas.body,
          },
          required: ["type", "method", "bodyType", "body"],
          additionalProperties: false,
        },
        output: {
          type: "object",
          properties: { type: { type: "string" }, example: bazaarSchemas.output },
          required: ["type"],
        },
      },
      required: ["input"],
    },
  };
}

export function paymentRequired(
  resourceUrl: string,
  req: PaymentRequirements,
  error: string,
  example: CreateVerificationRequest,
) {
  return {
    x402Version: X402_VERSION,
    error,
    resource: {
      url: resourceUrl,
      description:
        "Create a ProofMarket verification: a person nearby checks something in the real world (a place, a printed page, an object, a phone call) and sends photos and an answer. Price = bounty x witnesses + 15%. The 201 response holds an API key to read the result.",
      mimeType: "application/json",
    },
    accepts: [req],
    extensions: { bazaar: bazaarExtension(example) },
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
      const amount = fromMicro(x402TotalMicro(body, app.config.platformFeeBps));
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

const isEmptyObject = (v: unknown) =>
  typeof v === "object" && v !== null && !Array.isArray(v) && Object.keys(v).length === 0;

export async function createWithPayment(
  app: AppContext,
  resourceUrl: string,
  raw: unknown,
  paymentHeader: string | null,
): Promise<X402Outcome> {
  const f = app.x402();
  const example = exampleX402Body(app);
  // A probe (no body, or {}) without a payment gets the terms for the example body rather than a 400, so
  // discovery tools (x402scan, docs/ops/x402-discovery.md) see a 402. A real body is still validated in full.
  if (!paymentHeader && (raw === undefined || isEmptyObject(raw))) {
    return {
      kind: "required",
      body: paymentRequired(
        resourceUrl,
        paymentRequirements(f, example, app.config.platformFeeBps),
        "PAYMENT-SIGNATURE header is required; send a body like extensions.bazaar.info.input.body",
        example,
      ),
    };
  }
  const body = parseX402Body(raw);
  const req = paymentRequirements(f, body, app.config.platformFeeBps);
  const reject = (reason: string, status: 400 | 402 = 402, payer = ""): X402Outcome => ({
    kind: "rejected",
    status,
    body: paymentRequired(resourceUrl, req, reason, example),
    settlement: { success: false, errorReason: reason, transaction: "", network: f.network, payer },
  });

  // Refuse what would be refused anyway before asking for money. A shared result costs nothing (01 §4.9).
  const preview = await dryRun(app, body);
  if (preview.body.reused) return { kind: "reused", result: preview };

  if (!paymentHeader) {
    return {
      kind: "required",
      body: paymentRequired(resourceUrl, req, "PAYMENT-SIGNATURE header is required", example),
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
