import "server-only";
// Requester API services (05 §2). Check order follows 05 §2.1 exactly; the first failing check is returned.

import {
  ApiError,
  evaluateQuestion,
  fromMicro,
  haversineM,
  inBBox,
  LIMITS,
  newId,
  POLICY_RULE_VERSION,
  SPEND_LIMIT_TIMEZONE,
  TASK_TYPE_ANSWERS,
  taskIdHash,
  toMicro,
} from "@proofmarket/core";
import {
  type CreateVerificationRequest,
  CreateVerificationRequestSchema,
} from "@proofmarket/core/schemas/api";
import { type Db, schema } from "@proofmarket/db";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import type { RequesterAuth } from "../auth/requester";
import type { AppContext } from "../context";
import { appendAudit } from "./audit";
import { sha256 } from "./crypto";
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

export function parseCreateBody(raw: unknown): CreateVerificationRequest {
  const r = CreateVerificationRequestSchema.safeParse(raw);
  if (!r.success) {
    throw new ApiError("VALIDATION_FAILED", {
      issues: r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  return r.data;
}

async function flagEnabled(db: Db, key: "tasks_create_enabled"): Promise<boolean> {
  const [row] = await db.select().from(schema.platformFlags).where(eq(schema.platformFlags.key, key));
  return row?.value ?? true;
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
const REUSABLE_TYPES: readonly string[] = ["PLACE_STATUS_VERIFICATION", "QUEUE_LENGTH"];

/** 01 §4.9: newest shared VERIFIED result for the same place, type and answer set, within max age. */
async function findReusable(
  tx: Db,
  placeId: string,
  body: CreateVerificationRequest,
  now: Date,
): Promise<CreateResult | null> {
  if (!body.reuse || !REUSABLE_TYPES.includes(body.type)) return null;
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
  if (new Set(body.answer_schema.values).size !== body.answer_schema.values.length) {
    throw new ApiError("VALIDATION_FAILED", { field: "answer_schema.values", reason: "duplicates" });
  }
  const allowedAnswers: readonly string[] = TASK_TYPE_ANSWERS[body.type];
  if (!body.answer_schema.values.every((v) => allowedAnswers.includes(v))) {
    throw new ApiError("VALIDATION_FAILED", {
      field: "answer_schema.values",
      reason: "not_for_type",
      allowed: allowedAnswers,
    });
  }
  const deadline = new Date(body.deadline);
  const minMs = LIMITS.deadlineFromNow.minMinutes * 60_000;
  const maxMs = LIMITS.deadlineFromNow.maxHours * 3600_000;
  if (deadline.getTime() - now.getTime() < minMs || deadline.getTime() - now.getTime() > maxMs) {
    throw new ApiError("DEADLINE_OUT_OF_RANGE");
  }
  const bbox = auth.limits.allowedBbox
    ? {
        minLat: auth.limits.allowedBbox[0] ?? 0,
        minLng: auth.limits.allowedBbox[1] ?? 0,
        maxLat: auth.limits.allowedBbox[2] ?? 0,
        maxLng: auth.limits.allowedBbox[3] ?? 0,
      }
    : app.config.pilotBBox;
  if (!inBBox(body.location, bbox)) throw new ApiError("LOCATION_OUT_OF_PILOT_AREA");
  const placeId = await matchPlace(tx, body.location.lat, body.location.lng);
  if (!placeId) throw new ApiError("LOCATION_NOT_ALLOWLISTED");
  const { required_witnesses: n, quorum } = body.assurance;
  if (n > app.config.maxWitnesses || quorum > n) {
    throw new ApiError("VALIDATION_FAILED", { field: "assurance", max_witnesses: app.config.maxWitnesses });
  }
  const policy = evaluateQuestion(body.question);
  if (!policy.ok) throw new ApiError("TASK_POLICY_VIOLATION", { rule_id: policy.ruleId });

  const reused = await findReusable(tx, placeId, body, now);
  if (reused) return reused;

  // 15-17 under a credential row lock so parallel creates cannot overdraw (02 §4.2, I-RACE-03).
  await lockCredential(tx, auth.credentialId);
  const total = toMicro(body.bounty.amount) * BigInt(n);
  if (total > toMicro(auth.limits.maxTaskAmount)) throw new ApiError("TASK_AMOUNT_LIMIT_EXCEEDED");
  const [today] = await tx
    .select({ s: sql<string>`coalesce(sum(-amount), 0)` })
    .from(schema.requesterLedger)
    .where(
      and(
        eq(schema.requesterLedger.credentialId, auth.credentialId),
        eq(schema.requesterLedger.entryType, "RESERVE"),
        gte(schema.requesterLedger.createdAt, startOfSpendDay(now)),
      ),
    );
  if (toMicro(String(today?.s ?? "0")) + total > toMicro(auth.limits.dailySpendLimit)) {
    throw new ApiError("DAILY_SPEND_LIMIT_EXCEEDED");
  }
  const [bal] = await tx
    .select({ s: sql<string>`coalesce(sum(amount), 0)` })
    .from(schema.requesterLedger)
    .where(eq(schema.requesterLedger.credentialId, auth.credentialId));
  if (toMicro(String(bal?.s ?? "0")) < total) throw new ApiError("INSUFFICIENT_BALANCE");

  const id = newId("verification");
  const [row] = await tx
    .insert(schema.verificationRequests)
    .values({
      id,
      credentialId: auth.credentialId,
      principalId: auth.principalId,
      type: body.type,
      question: body.question,
      answerValues: body.answer_schema.values,
      targetLat: body.location.lat,
      targetLng: body.location.lng,
      placeId,
      radiusM: body.location.radius_m,
      deadline,
      freshnessMaxAgeS: body.freshness.max_age_seconds,
      requiredWitnesses: n,
      quorum,
      bountyAsset: body.bounty.asset,
      bountyAmount: body.bounty.amount,
      bountyNetwork: body.bounty.network,
      status: "CREATED",
      fundingStatus: "PENDING",
      taskIdHash: Buffer.from(taskIdHash(id)),
      idempotencyKeyHash: idemHash,
      requestHash: reqHash,
      policyRuleVersion: POLICY_RULE_VERSION,
      callbackEndpointId: await activeEndpoint(tx, auth.credentialId),
      allowReuse: body.allow_reuse ?? false,
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
    amount: fromMicro(total),
    network: body.bounty.network,
    status: "PENDING",
  });
  await enqueueJob(tx, "FUND_TASK", `FUND_TASK:${id}`, { verification_id: id });
  await appendAudit(tx, {
    verificationId: id,
    actorType: "requester",
    actorRef: auth.keyPrefix,
    eventType: "request_created",
    beforeState: null,
    afterState: "CREATED",
    correlationId: id,
    metadata: { place_id: placeId, total: fromMicro(total) },
  });
  return { status: 201, body: createdBody(row) };
}

function createdBody(row: TaskRow): CreateResult["body"] {
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
  return buildVerificationView(app.db, row);
}

/** T14 / T15. Idempotent: CANCELLED / REFUNDED return the current view. */
export async function cancelVerification(app: AppContext, auth: RequesterAuth, id: string) {
  await loadOwned(app.db, auth, id);
  return app.db.transaction(async (tx) => {
    const task = await lockTask(tx, id);
    if (task.status === "CANCELLED" || task.status === "REFUNDED") return buildVerificationView(tx, task);
    const total = toMicro(task.bountyAmount) * BigInt(task.requiredWitnesses);
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
    return buildVerificationView(tx, task);
  });
}
