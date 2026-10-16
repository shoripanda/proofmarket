import "server-only";
// Requester API services (05 §2). Check order follows 05 §2.1 exactly; the first failing check is returned.

import {
  ApiError,
  amountDecimals,
  answerSchemaOf,
  type EnabledAsset,
  evaluateQuestion,
  type FundingStatus,
  fractionDigits,
  fromMicro,
  fundedPerWitnessMicro,
  haversineM,
  inBBox,
  LIMITS,
  locationRequired,
  newId,
  type Outcome,
  POLICY_RULE_VERSION,
  platformFeeMicro,
  type SettlementStatus,
  SPEND_LIMIT_TIMEZONE,
  settledPerWitnessMicro,
  storedAnswerKind,
  storedAnswerSpec,
  TASK_STATUSES,
  type TaskStatus,
  type TaskType,
  taskIdHash,
  toMicro,
  validateAnswerSchema,
} from "@proofmarket/core";
import {
  type Asset,
  type CreateVerificationBatchRequest,
  CreateVerificationBatchRequestSchema,
  type CreateVerificationRequest,
  CreateVerificationRequestSchema,
  DisputeRequestSchema,
  type ListVerificationsQuery,
  type ListVerificationsResponse,
  type Network,
  type QuoteResponse,
} from "@proofmarket/core/schemas/api";
import { type Db, schema } from "@proofmarket/db";
import { and, desc, eq, gte, inArray, lt, sql } from "drizzle-orm";
import type { RequesterAuth } from "../auth/requester";
import { clusterText } from "../cluster-public";
import type { AppContext } from "../context";
import { appendAudit } from "./audit";
import { bountyOf, feeMicro, reservedMicro } from "./bounty";
import { sha256 } from "./crypto";
import { flagEnabled } from "./flags";
import { requestHash } from "./idempotency";
import {
  applyTaskEvent,
  enqueueJob,
  lockCredential,
  lockTask,
  microToDecimal,
  type TaskRow,
} from "./task-engine";
import { buildResult, buildVerificationView } from "./views";
import { activeEndpoint } from "./webhook-service";

export function parseCreateBody(raw: unknown, index?: number): CreateVerificationRequest {
  const r = CreateVerificationRequestSchema.safeParse(raw);
  if (!r.success) {
    throw new ApiError("VALIDATION_FAILED", {
      ...(index === undefined ? {} : { index }),
      issues: r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  return r.data;
}

/** 01 §4.25: the batch body, then each item laid over the template and checked like a single request. */
export function parseBatchBody(raw: unknown): CreateVerificationRequest[] {
  const r = CreateVerificationBatchRequestSchema.safeParse(raw);
  if (!r.success) {
    throw new ApiError("VALIDATION_FAILED", {
      issues: r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  const { template, items }: CreateVerificationBatchRequest = r.data;
  return items.map((item, index) => parseCreateBody({ ...template, ...item }, index));
}

/** Start of "today" in Asia/Tokyo (UTC+9, no DST) as a UTC instant (01 §4.7). */
export function startOfSpendDay(now: Date): Date {
  if (SPEND_LIMIT_TIMEZONE !== "Asia/Tokyo") throw new Error("only Asia/Tokyo is supported");
  const jst = new Date(now.getTime() + 9 * 3600_000);
  return new Date(Date.UTC(jst.getUTCFullYear(), jst.getUTCMonth(), jst.getUTCDate()) - 9 * 3600_000);
}

async function matchPlace(db: Db, lat: number, lng: number): Promise<string | null> {
  const places = await db.select().from(schema.places).where(eq(schema.places.status, "active"));
  let best: { id: string; d: number } | null = null;
  for (const p of places) {
    const d = haversineM({ lat, lng }, { lat: p.lat, lng: p.lng });
    if (d <= LIMITS.placeMatchRadiusM && (!best || d < best.d)) best = { id: p.id, d };
  }
  return best?.id ?? null;
}

export interface CreateResult {
  status: 200 | 201;
  body: {
    verification_id: string;
    status: string;
    created_at: string;
    funding: { status: string };
    reused?: true;
    result?: Record<string, unknown>;
  };
}

/** Types whose answer does not depend on the question wording, so a result can serve another request. */
const REUSABLE_TYPES: readonly string[] = [
  "PLACE_STATUS_VERIFICATION",
  "QUEUE_LENGTH",
  "CROWD_LEVEL",
  "SEAT_AVAILABILITY",
  "PARKING_AVAILABILITY",
];

/** 01 §4.9: newest shared VERIFIED result for the same place, type and answer set, within max age. */
async function findReusable(
  tx: Db,
  placeId: string | null,
  body: CreateVerificationRequest,
  now: Date,
): Promise<CreateResult | null> {
  if (!body.reuse || !placeId || !REUSABLE_TYPES.includes(body.type) || body.answer_schema.type !== "enum")
    return null;
  const since = new Date(now.getTime() - body.reuse.max_age_seconds * 1000);
  const rows = await tx
    .select({ task: schema.verificationRequests })
    .from(schema.verificationRequests)
    .innerJoin(
      schema.verificationResults,
      eq(schema.verificationResults.verificationId, schema.verificationRequests.id),
    )
    .where(
      and(
        eq(schema.verificationRequests.placeId, placeId),
        eq(schema.verificationRequests.type, body.type),
        eq(schema.verificationRequests.allowReuse, true),
        eq(schema.verificationResults.outcome, "VERIFIED"),
        gte(schema.verificationResults.finalizedAt, since),
      ),
    )
    .orderBy(desc(schema.verificationResults.finalizedAt))
    .limit(5);
  const want = [...body.answer_schema.values].sort().join(",");
  const hit = rows.find((r) => [...r.task.answerValues].sort().join(",") === want);
  if (!hit) return null;
  const full = await buildResult(tx, hit.task);
  if (!full) return null;
  const { rejected_submissions: _omit, ...result } = full;
  return {
    status: 200,
    body: {
      verification_id: hit.task.id,
      status: "VERIFIED",
      created_at: hit.task.createdAt.toISOString(),
      funding: { status: "NONE" },
      reused: true,
      result,
    },
  };
}

/**
 * Checks 2 and 5-17 of 05 §2.1 (1 = auth and 3 = rate limit happen in the route; 4/7/9/11/13 are the zod schema).
 * Runs inside the idempotency transaction.
 */
export async function createVerification(
  app: AppContext,
  tx: Db,
  auth: RequesterAuth,
  body: CreateVerificationRequest,
  idempotencyKey: string,
  /** Rechecks (dispute, challenge) pass 0: their cost is the bond, not a new sale (13 §6.1). */
  opts: { feeBps?: number } = {},
): Promise<CreateResult> {
  const now = app.now();
  const idemHash = sha256(idempotencyKey);
  const reqHash = requestHash(body);

  // Beyond the 24h idempotency_keys retention, the per-credential unique key still guards (01 §4.7).
  const [existing] = await tx
    .select()
    .from(schema.verificationRequests)
    .where(
      and(
        eq(schema.verificationRequests.credentialId, auth.credentialId),
        eq(schema.verificationRequests.idempotencyKeyHash, idemHash),
      ),
    );
  if (existing) {
    if (!existing.requestHash.equals(reqHash)) throw new ApiError("IDEMPOTENCY_KEY_CONFLICT");
    return { status: 200, body: createdBody(existing) };
  }

  if (!(await flagEnabled(tx, "tasks_create_enabled"))) throw new ApiError("FEATURE_DISABLED");
  if (!auth.allowedTaskTypes.includes(body.type)) throw new ApiError("UNSUPPORTED_TASK_TYPE");
  if (body.principal_ref !== auth.principalId) throw new ApiError("PRINCIPAL_MISMATCH");
  // 15 §4.1: a request names the chain it expects; a body written for Devnet must not spend mainnet funds.
  const expectedNetwork = clusterText(app.config.cluster).network;
  if (body.bounty.network !== expectedNetwork) {
    throw new ApiError("VALIDATION_FAILED", {
      field: "bounty.network",
      reason: "wrong_network",
      expected: expectedNetwork,
    });
  }
  validateAnswerSchema(body.type, body.answer_schema);
  const loc = body.location ?? null;
  if (!loc && locationRequired(body.type)) {
    throw new ApiError("VALIDATION_FAILED", { field: "location", reason: "required_for_type" });
  }
  // The map shows a place and a short answer; text answers stay with the requester (01 §4.22).
  if (body.publish && !loc)
    throw new ApiError("VALIDATION_FAILED", { field: "publish", reason: "needs_location" });
  if (body.publish && storedAnswerKind(body.answer_schema) === "text") {
    throw new ApiError("VALIDATION_FAILED", { field: "publish", reason: "not_for_text_answers" });
  }
  // 13 §3: a recheck decides a challenge by comparing answers, which free text never matches word for word.
  const challengeMinutes = "challenge_minutes" in body.assurance ? body.assurance.challenge_minutes : null;
  if (challengeMinutes !== null && !["enum", "number"].includes(storedAnswerKind(body.answer_schema))) {
    throw new ApiError("VALIDATION_FAILED", { field: "assurance.level", reason: "optimistic_not_for_text" });
  }
  if (body.location_privacy === "coarse" && !loc)
    throw new ApiError("VALIDATION_FAILED", { field: "location_privacy", reason: "needs_location" });
  const deadline = new Date(body.deadline);
  const minMs = LIMITS.deadlineFromNow.minMinutes * 60_000;
  // Work with no place may wait up to a week (01 §4.25); work at a place stays within a day.
  const maxMs = (loc ? LIMITS.deadlineFromNow.maxHours : LIMITS.deadlineFromNow.maxHoursAnywhere) * 3600_000;
  if (deadline.getTime() - now.getTime() < minMs || deadline.getTime() - now.getTime() > maxMs) {
    throw new ApiError("DEADLINE_OUT_OF_RANGE");
  }
  // 01 §4.15: any location may be asked for. A per-key bbox, if an operator set one, still applies;
  // a registered place under the location is recorded for reuse and shop reports but is not required.
  const bbox = auth.limits.allowedBbox
    ? {
        minLat: auth.limits.allowedBbox[0] ?? 0,
        minLng: auth.limits.allowedBbox[1] ?? 0,
        maxLat: auth.limits.allowedBbox[2] ?? 0,
        maxLng: auth.limits.allowedBbox[3] ?? 0,
      }
    : null;
  if (loc && bbox && !inBBox(loc, bbox)) throw new ApiError("LOCATION_OUT_OF_PILOT_AREA");
  const placeId = loc ? await matchPlace(tx, loc.lat, loc.lng) : null;
  const { required_witnesses: n, quorum } = body.assurance;
  if (n > app.config.maxWitnesses || quorum > n) {
    throw new ApiError("VALIDATION_FAILED", { field: "assurance", max_witnesses: app.config.maxWitnesses });
  }
  // 13 §1: a rising bounty needs program v1.1 on chain; until then the flag keeps it off.
  const maxAmount = body.bounty.max_amount ?? null;
  if (maxAmount !== null && !app.config.risingBountyEnabled) {
    throw new ApiError("VALIDATION_FAILED", { field: "bounty.max_amount", reason: "disabled" });
  }
  // Default ramp: until the deadline, within the 10-1440 minutes the column allows.
  const rampMinutes =
    maxAmount === null
      ? null
      : (body.bounty.ramp_minutes ??
        Math.min(1440, Math.max(10, Math.floor((deadline.getTime() - now.getTime()) / 60_000))));
  checkBountyAsset(app, body.bounty);
  const policy = evaluateQuestion(body.question);
  if (!policy.ok) throw new ApiError("TASK_POLICY_VIOLATION", { rule_id: policy.ruleId });

  const reused = await findReusable(tx, placeId, body, now);
  if (reused) return reused;

  // 15-17 under a credential row lock so parallel creates cannot overdraw (02 §4.2, I-RACE-03).
  await lockCredential(tx, auth.credentialId);
  // The ceiling is reserved and escrowed; the part not paid comes back at the first claim (13 §1).
  const bountyTotal = fundedPerWitnessMicro({ amount: body.bounty.amount, maxAmount }) * BigInt(n);
  // 15% on top (13 §6.1): reserved with the bounty, kept only for the witnesses who are paid.
  const feeBps = opts.feeBps ?? app.config.platformFeeBps;
  const fee = platformFeeMicro(bountyTotal, feeBps);
  const total = bountyTotal + fee;
  // A quote names this body (without the quote_id itself) and this key, and is used once (04 §4.2).
  if (body.quote_id) {
    const { quote_id, ...quoted } = body;
    await consumeQuote(tx, auth, quote_id, requestHash(quoted), now);
  }
  // Spend policy (docs/architecture 04 §4.3): the key's own ceilings, when the operator set any, then the balance.
  await checkSpendPolicy(tx, auth, body.bounty.asset, total, now);
  if ((await balanceMicro(tx, auth.credentialId, body.bounty.asset)) < total) {
    throw new ApiError("INSUFFICIENT_BALANCE");
  }

  const id = newId("verification");
  const [row] = await tx
    .insert(schema.verificationRequests)
    .values({
      id,
      credentialId: auth.credentialId,
      principalId: auth.principalId,
      type: body.type,
      question: body.question,
      acceptanceCriteria: body.acceptance_criteria ?? null,
      attestation: body.attestation ?? null,
      answerValues: body.answer_schema.type === "enum" ? body.answer_schema.values : [],
      answerKind: storedAnswerKind(body.answer_schema),
      answerSpec: storedAnswerSpec(body.answer_schema),
      targetLat: loc?.lat ?? null,
      targetLng: loc?.lng ?? null,
      placeId,
      radiusM: loc?.radius_m ?? null,
      deadline,
      freshnessMaxAgeS: body.freshness.max_age_seconds,
      requiredWitnesses: n,
      quorum,
      bountyAsset: body.bounty.asset,
      bountyAmount: body.bounty.amount,
      bountyNetwork: body.bounty.network,
      platformFeeAmount: fromMicro(fee),
      feeRateBps: feeBps,
      bountyMaxAmount: maxAmount,
      bountyRampMinutes: rampMinutes,
      challengeMinutes,
      status: "CREATED",
      fundingStatus: "PENDING",
      taskIdHash: Buffer.from(taskIdHash(id)),
      idempotencyKeyHash: idemHash,
      requestHash: reqHash,
      policyRuleVersion: POLICY_RULE_VERSION,
      callbackEndpointId: await activeEndpoint(tx, auth.credentialId),
      allowReuse: body.allow_reuse ?? false,
      publishResult: body.publish ?? false,
      locationPrivacy: body.location_privacy ?? "exact",
      minWorkerTier: body.worker_requirements?.min_tier ?? null,
      createdAt: now,
      updatedAt: now,
    })
    .returning();
  if (!row) throw new Error("insert returned no row");
  await tx.insert(schema.requesterLedger).values({
    credentialId: auth.credentialId,
    verificationId: id,
    entryType: "RESERVE",
    amount: microToDecimal(-total),
    asset: body.bounty.asset,
    createdAt: now,
  });
  await tx.insert(schema.paymentRecords).values({
    id: newId("payment"),
    verificationId: id,
    kind: "FUND",
    asset: body.bounty.asset,
    amount: fromMicro(bountyTotal),
    network: body.bounty.network,
    status: "PENDING",
  });
  await enqueueJob(tx, "FUND_TASK", `FUND_TASK:${id}`, { verification_id: id }, now);
  if (body.quote_id) {
    await tx
      .update(schema.verificationQuotes)
      .set({ verificationId: id })
      .where(eq(schema.verificationQuotes.id, body.quote_id));
  }
  await appendAudit(tx, {
    verificationId: id,
    actorType: "requester",
    actorRef: auth.keyPrefix,
    eventType: "request_created",
    beforeState: null,
    afterState: "CREATED",
    correlationId: id,
    metadata: {
      place_id: placeId,
      total: fromMicro(total),
      platform_fee: fromMicro(fee),
      ...(body.quote_id ? { quote_id: body.quote_id } : {}),
    },
  });
  return { status: 201, body: createdBody(row) };
}

/** The balance of one asset, in micro units (each asset is its own balance, 15 §3.3). */
async function balanceMicro(tx: Db, credentialId: string, asset: string): Promise<bigint> {
  const [bal] = await tx
    .select({ s: sql<string>`coalesce(sum(amount), 0)` })
    .from(schema.requesterLedger)
    .where(
      and(eq(schema.requesterLedger.credentialId, credentialId), eq(schema.requesterLedger.asset, asset)),
    );
  return toMicro(String(bal?.s ?? "0"));
}

/**
 * Spend policy (docs/architecture 04 §4.3, 08 §4.1). Both ceilings are per credential and null by default,
 * which means no ceiling (the owner's decision of 2026-10-15; PR #14 had removed the checks). The limits are
 * written in the bounty's asset units and compared without conversion, so a key with limits in USDC terms
 * bounds every asset by the same number. The day is the spend-limit day (Asia/Tokyo, 01 §4.5).
 */
export async function checkSpendPolicy(
  tx: Db,
  auth: RequesterAuth,
  asset: string,
  total: bigint,
  now: Date,
): Promise<void> {
  if (auth.limits.maxTaskAmount !== null && total > toMicro(auth.limits.maxTaskAmount)) {
    throw new ApiError("TASK_AMOUNT_LIMIT_EXCEEDED", { max_task_amount: auth.limits.maxTaskAmount });
  }
  if (auth.limits.dailySpendLimit === null) return;
  // Reserved today, net of what came back today (RELEASE / REFUND carry the task's id too).
  const [today] = await tx
    .select({ s: sql<string>`coalesce(sum(-amount), 0)` })
    .from(schema.requesterLedger)
    .where(
      and(
        eq(schema.requesterLedger.credentialId, auth.credentialId),
        eq(schema.requesterLedger.asset, asset),
        inArray(schema.requesterLedger.entryType, ["RESERVE", "RELEASE", "REFUND"]),
        gte(schema.requesterLedger.createdAt, startOfSpendDay(now)),
      ),
    );
  if (toMicro(String(today?.s ?? "0")) + total > toMicro(auth.limits.dailySpendLimit)) {
    throw new ApiError("DAILY_SPEND_LIMIT_EXCEEDED", { daily_spend_limit: auth.limits.dailySpendLimit });
  }
}

// ---------- quotes (docs/architecture 04 §4.2) ----------

export const QUOTE_TTL_MS = 5 * 60_000;
/** The checks POST /v1/verifications runs before reserving, in order; a quote means they all passed. */
const QUOTE_CHECKS = [
  "task_type",
  "network",
  "answer_schema",
  "location",
  "deadline",
  "policy",
  "spend_limit",
];

class Rollback extends Error {
  constructor(readonly result: CreateResult) {
    super("rollback");
  }
}

/**
 * Run the create inside a transaction that is always rolled back: every check runs, nothing is reserved. The
 * x402 window does the same before it asks for money (01 §4.19).
 */
export async function dryRunCreate(
  app: AppContext,
  auth: RequesterAuth,
  body: CreateVerificationRequest,
): Promise<CreateResult> {
  try {
    await app.db.transaction(async (tx) => {
      throw new Rollback(await createVerification(app, tx, auth, body, `dry-run:${newId("quote")}`));
    });
  } catch (e) {
    if (e instanceof Rollback) return e.result;
    throw e;
  }
  throw new Error("unreachable");
}

/**
 * POST /v1/verifications/quote: what this body would cost and whether it would be accepted now. Nothing is
 * reserved; the quote row holds the body's hash so the confirm must send the same body.
 */
export async function quoteVerification(
  app: AppContext,
  auth: RequesterAuth,
  body: CreateVerificationRequest,
): Promise<QuoteResponse> {
  const now = app.now();
  const preview = await dryRunCreate(app, auth, body);
  const n = body.assurance.required_witnesses;
  const bountyTotal =
    fundedPerWitnessMicro({ amount: body.bounty.amount, maxAmount: body.bounty.max_amount ?? null }) *
    BigInt(n);
  const fee = platformFeeMicro(bountyTotal, app.config.platformFeeBps);
  const total = bountyTotal + fee;
  const balance = await balanceMicro(app.db, auth.credentialId, body.bounty.asset);
  const id = newId("quote");
  const expiresAt = new Date(now.getTime() + QUOTE_TTL_MS);
  await app.db.insert(schema.verificationQuotes).values({
    id,
    credentialId: auth.credentialId,
    requestHash: requestHash(body),
    asset: body.bounty.asset,
    total: fromMicro(total),
    createdAt: now,
    expiresAt,
  });
  return {
    quote_id: id,
    bounty: { asset: body.bounty.asset, amount: body.bounty.amount, required_witnesses: n },
    bounty_total: fromMicro(bountyTotal),
    platform_fee: { rate_bps: app.config.platformFeeBps, amount: fromMicro(fee) },
    total: fromMicro(total),
    balance: fromMicro(balance),
    balance_after: fromMicro(balance - total),
    policy: { checked: QUOTE_CHECKS, ok: true },
    reuse: preview.body.reused ? { verification_id: preview.body.verification_id } : null,
    expires_at: expiresAt.toISOString(),
  };
}

/** The quote must exist for this key, be unexpired, unused and quoted for this exact body. */
async function consumeQuote(tx: Db, auth: RequesterAuth, quoteId: string, reqHash: Buffer, now: Date) {
  const [q] = await tx
    .select()
    .from(schema.verificationQuotes)
    .where(
      and(
        eq(schema.verificationQuotes.id, quoteId),
        eq(schema.verificationQuotes.credentialId, auth.credentialId),
      ),
    )
    .for("update");
  if (!q) throw new ApiError("QUOTE_NOT_FOUND");
  if (q.consumedAt) throw new ApiError("QUOTE_EXPIRED", { reason: "already_used" });
  if (q.expiresAt.getTime() <= now.getTime()) throw new ApiError("QUOTE_EXPIRED");
  if (!q.requestHash.equals(reqHash)) throw new ApiError("QUOTE_MISMATCH");
  await tx
    .update(schema.verificationQuotes)
    .set({ consumedAt: now })
    .where(eq(schema.verificationQuotes.id, quoteId));
}

// ---------- GET /v1/verifications (docs/architecture 04 §4.1) ----------

export async function listVerifications(
  app: AppContext,
  auth: RequesterAuth,
  q: ListVerificationsQuery,
): Promise<ListVerificationsResponse> {
  const statuses = q.status
    ? q.status
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  for (const s of statuses) {
    if (!(TASK_STATUSES as readonly string[]).includes(s)) {
      throw new ApiError("VALIDATION_FAILED", { field: "status", allowed: TASK_STATUSES });
    }
  }
  const where = [eq(schema.verificationRequests.credentialId, auth.credentialId)];
  if (statuses.length) where.push(inArray(schema.verificationRequests.status, statuses));
  if (q.created_after) where.push(gte(schema.verificationRequests.createdAt, new Date(q.created_after)));
  // IDs are ULIDs, so "older than the cursor" is "smaller than the cursor" (04 §1); the cursor itself is excluded.
  if (q.cursor) where.push(lt(schema.verificationRequests.id, q.cursor));
  const rows = await app.db
    .select({ task: schema.verificationRequests, outcome: schema.verificationResults.outcome })
    .from(schema.verificationRequests)
    .leftJoin(
      schema.verificationResults,
      eq(schema.verificationResults.verificationId, schema.verificationRequests.id),
    )
    .where(and(...where))
    .orderBy(desc(schema.verificationRequests.id))
    .limit(q.limit + 1);
  const page = rows.slice(0, q.limit);
  return {
    verifications: page.map(({ task, outcome }) => ({
      verification_id: task.id,
      type: task.type as TaskType,
      status: task.status as TaskStatus,
      funding_status: task.fundingStatus as FundingStatus,
      settlement_status: task.settlementStatus as SettlementStatus,
      result_status: (outcome as Outcome | null) ?? null,
      bounty: {
        asset: task.bountyAsset as Asset,
        amount: task.bountyAmount,
        network: task.bountyNetwork as Network,
      },
      required_witnesses: task.requiredWitnesses,
      recheck_of: task.recheckOf,
      deadline: task.deadline.toISOString(),
      created_at: task.createdAt.toISOString(),
      updated_at: task.updatedAt.toISOString(),
    })),
    next_cursor: rows.length > q.limit ? (page[page.length - 1]?.task.id ?? null) : null,
  };
}

/**
 * 01 §4.25: every item is created like a single request, in this one transaction, so a batch either
 * exists in full or not at all. Item i uses `<key>#i` as its idempotency key; limits 15-17 add up.
 */
export async function createVerificationBatch(
  app: AppContext,
  tx: Db,
  auth: RequesterAuth,
  bodies: CreateVerificationRequest[],
  idempotencyKey: string,
): Promise<{ status: 201; body: { verifications: CreateResult["body"][] } }> {
  const verifications: CreateResult["body"][] = [];
  for (const [index, body] of bodies.entries()) {
    try {
      verifications.push((await createVerification(app, tx, auth, body, `${idempotencyKey}#${index}`)).body);
    } catch (e) {
      if (e instanceof ApiError) throw new ApiError(e.code, { ...e.details, index });
      throw e;
    }
  }
  return { status: 201, body: { verifications } };
}

export function createdBody(row: TaskRow): CreateResult["body"] {
  return {
    verification_id: row.id,
    status: "CREATED",
    created_at: row.createdAt.toISOString(),
    funding: { status: "PENDING" },
  };
}

async function loadOwned(db: Db, auth: RequesterAuth, id: string): Promise<TaskRow> {
  const [row] = await db
    .select()
    .from(schema.verificationRequests)
    .where(
      and(
        eq(schema.verificationRequests.id, id),
        eq(schema.verificationRequests.credentialId, auth.credentialId),
      ),
    );
  if (!row) throw new ApiError("VERIFICATION_NOT_FOUND");
  return row;
}

export async function getVerification(app: AppContext, auth: RequesterAuth, id: string) {
  const row = await loadOwned(app.db, auth, id);
  return buildVerificationView(app.db, row, app.now(), app.config.workerRefSalt);
}

/** T14 / T15. Idempotent: CANCELLED / REFUNDED return the current view. */
export async function cancelVerification(app: AppContext, auth: RequesterAuth, id: string) {
  await loadOwned(app.db, auth, id);
  return app.db.transaction(async (tx) => {
    const task = await lockTask(tx, id);
    if (task.status === "CANCELLED" || task.status === "REFUNDED")
      return buildVerificationView(tx, task, app.now(), app.config.workerRefSalt);
    const total = reservedMicro(task) + feeMicro(task);
    const [fund] = await tx
      .select()
      .from(schema.paymentRecords)
      .where(and(eq(schema.paymentRecords.verificationId, id), eq(schema.paymentRecords.kind, "FUND")));
    const txSent =
      (fund?.signatures.length ?? 0) > 0 || fund?.status === "SUBMITTED" || fund?.status === "CONFIRMED";
    if (task.status === "CREATED" && txSent) {
      // Funding in flight: wait for confirmation, then cancel via T15 (03 §2.2).
      throw new ApiError("TASK_NOT_CANCELLABLE", { reason: "funding_in_flight" }, true);
    }
    await applyTaskEvent(
      tx,
      app,
      task,
      "CANCEL_REQUESTED",
      {
        actorType: "requester",
        actorRef: auth.keyPrefix,
        correlationId: id,
        funding: { txSent, retryLimitReached: false, allBlockhashesExpired: false },
        creditBackMicro: total,
      },
      "TASK_NOT_CANCELLABLE",
    );
    return buildVerificationView(tx, task, app.now(), app.config.workerRefSalt);
  });
}

/** 01 §4.12: dispute a finalized result once, within 24 h, by creating a recheck task the requester pays for. */
export async function disputeVerification(app: AppContext, auth: RequesterAuth, id: string, raw: unknown) {
  const r = DisputeRequestSchema.safeParse(raw ?? {});
  if (!r.success) {
    throw new ApiError("VALIDATION_FAILED", {
      issues: r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  const orig = await loadOwned(app.db, auth, id);
  const [res] = await app.db
    .select()
    .from(schema.verificationResults)
    .where(eq(schema.verificationResults.verificationId, orig.id));
  const now = app.now();
  if (
    !res ||
    !["VERIFIED", "REJECTED"].includes(res.outcome) ||
    now.getTime() - res.finalizedAt.getTime() > 24 * 3600_000 ||
    orig.recheckOf
  ) {
    throw new ApiError("DISPUTE_NOT_ALLOWED");
  }
  const body = CreateVerificationRequestSchema.parse({
    type: orig.type,
    question: orig.question,
    answer_schema: answerSchemaOf(
      orig.answerKind,
      orig.answerValues,
      orig.answerSpec as Record<string, unknown> | null,
    ),
    ...(orig.targetLat !== null && orig.targetLng !== null && orig.radiusM !== null
      ? {
          location: { lat: orig.targetLat, lng: orig.targetLng, radius_m: orig.radiusM },
          location_privacy: orig.locationPrivacy as "exact" | "coarse",
        }
      : {}),
    deadline: new Date(now.getTime() + (r.data.deadline_minutes ?? 60) * 60_000).toISOString(),
    freshness: { max_age_seconds: orig.freshnessMaxAgeS },
    evidence_requirements: { photo: true, task_nonce: true },
    assurance: r.data.assurance ?? { level: "standard" },
    bounty: {
      asset: orig.bountyAsset,
      // A recheck pays what the original paid: its fixed amount when the bounty rose (13 §1).
      amount: fromMicro(settledPerWitnessMicro(bountyOf(orig))),
      network: orig.bountyNetwork,
    },
    principal_ref: auth.principalId,
  });
  return app.db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: schema.verificationRequests.id })
      .from(schema.verificationRequests)
      .where(eq(schema.verificationRequests.recheckOf, orig.id));
    if (existing) throw new ApiError("DISPUTE_NOT_ALLOWED", { recheck_verification_id: existing.id });
    const created = await createVerification(app, tx, auth, body, `dispute:${orig.id}`, { feeBps: 0 });
    const recheckId = created.body.verification_id;
    await tx
      .update(schema.verificationRequests)
      .set({ recheckOf: orig.id })
      .where(eq(schema.verificationRequests.id, recheckId));
    await appendAudit(tx, {
      verificationId: orig.id,
      actorType: "requester",
      actorRef: auth.keyPrefix,
      eventType: "operator_action",
      beforeState: null,
      afterState: null,
      correlationId: orig.id,
      metadata: { action: "dispute_opened", recheck: recheckId, reason: r.data.reason ?? null },
    });
    return { verification_id: orig.id, recheck_verification_id: recheckId };
  });
}

/**
 * 16 §3.2 / §4: the asset must be enabled here, its amounts may not be finer than the asset allows (BONK:
 * 5 decimals), and an asset with a technical floor (SOL, 15 §3.2) must reach it.
 */
export function checkBountyAsset(
  app: AppContext,
  bounty: { asset: string; amount: string; max_amount?: string | null | undefined },
): EnabledAsset {
  const a = app.config.assets.find((x) => x.symbol === bounty.asset);
  if (!a) throw new ApiError("UNSUPPORTED_ASSET", { field: "bounty.asset" });
  const digits = amountDecimals(a.symbol);
  for (const [field, v] of [
    ["bounty.amount", bounty.amount],
    ["bounty.max_amount", bounty.max_amount],
  ] as const) {
    if (v != null && fractionDigits(v) > digits)
      throw new ApiError("VALIDATION_FAILED", { field, reason: "too_many_decimals", max_decimals: digits });
  }
  if (a.minBounty && toMicro(bounty.amount) < toMicro(a.minBounty)) {
    throw new ApiError("VALIDATION_FAILED", {
      field: "bounty.amount",
      reason: "below_min",
      min: a.minBounty,
    });
  }
  return a;
}
