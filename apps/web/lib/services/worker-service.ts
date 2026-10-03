import "server-only";
// Worker API services (05 §3). Task/claim mutations lock the task row first (02 §4.2).

import {
  ApiError,
  CLAIMABLE_STATUSES,
  fromMicro,
  haversineM,
  LIMITS,
  newId,
  openSlots,
  toMicro,
} from "@proofmarket/core";
import { type Db, schema } from "@proofmarket/db";
import { and, eq, gt, inArray } from "drizzle-orm";
import type { AppContext } from "../context";
import { LEGAL_VERSIONS } from "../legal";
import { appendAudit } from "./audit";
import { randomToken, sha256 } from "./crypto";
import { reasonMessage } from "./messages";
import { applyTaskEvent, lockTask, type TaskRow, taskCounts } from "./task-engine";

export const SAFETY_NOTES_VERSION = LEGAL_VERSIONS.safety_rules;
export const CONSENT_DOCS = ["worker_terms", "safety_rules", "privacy_notice"] as const;

/** The client must send the versions it showed; anything else (outdated or made up) is refused (S-10). */
function assertCurrentConsents(consents: Record<(typeof CONSENT_DOCS)[number], string>) {
  const stale = CONSENT_DOCS.filter((d) => consents?.[d] !== LEGAL_VERSIONS[d]);
  if (stale.length)
    throw new ApiError("VALIDATION_FAILED", { reason: "consent_version_outdated", documents: stale });
}

// ---------- onboarding ----------

export async function onboard(
  app: AppContext,
  privyUserId: string,
  body: { invite_code: string; consents: Record<(typeof CONSENT_DOCS)[number], string> },
): Promise<string> {
  assertCurrentConsents(body.consents);
  const now = app.now();
  const payout = await app.identity.payoutAddress(privyUserId);
  if (!payout) throw new ApiError("VALIDATION_FAILED", { reason: "no_embedded_solana_wallet" });
  return app.db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(schema.workers)
      .where(eq(schema.workers.privyUserId, privyUserId));
    if (existing) return existing.id;
    const [invite] = await tx
      .select()
      .from(schema.inviteCodes)
      .where(eq(schema.inviteCodes.codeHash, sha256(body.invite_code.trim().toUpperCase())))
      .for("update");
    if (!invite || invite.expiresAt <= now || invite.usedCount >= invite.maxUses)
      throw new ApiError("INVITE_INVALID");
    await tx
      .update(schema.inviteCodes)
      .set({ usedCount: invite.usedCount + 1 })
      .where(eq(schema.inviteCodes.id, invite.id));
    const workerId = newId("worker");
    await tx
      .insert(schema.workers)
      .values({ id: workerId, privyUserId, payoutPubkey: payout, inviteCodeId: invite.id });
    for (const doc of CONSENT_DOCS) {
      await tx
        .insert(schema.workerConsents)
        .values({ workerId, document: doc, version: body.consents[doc], acceptedAt: now });
    }
    await appendAudit(tx, {
      verificationId: null,
      actorType: "worker",
      actorRef: workerId,
      eventType: "operator_action",
      beforeState: null,
      afterState: null,
      correlationId: workerId,
      metadata: { action: "worker_onboarded", invite_id: invite.id },
    });
    return workerId;
  });
}

export async function issueInvite(db: Db, o: { uses: number; expiresAt: Date }): Promise<string> {
  const raw = randomToken(6)
    .replace(/[^A-Za-z0-9]/g, "")
    .toUpperCase()
    .slice(0, 8)
    .padEnd(8, "X");
  const code = `PM-${raw.slice(0, 4)}-${raw.slice(4, 8)}`;
  await db.insert(schema.inviteCodes).values({
    id: newId("invite"),
    codeHash: sha256(code),
    maxUses: o.uses,
    expiresAt: o.expiresAt,
  });
  return code;
}

export async function workerMe(app: AppContext, privyUserId: string) {
  const [w] = await app.db.select().from(schema.workers).where(eq(schema.workers.privyUserId, privyUserId));
  if (!w)
    return {
      worker_id: "",
      onboarded: false,
      status: "active" as const,
      consents: {},
      yen_payout_interest: false,
    };
  const consents = await app.db
    .select()
    .from(schema.workerConsents)
    .where(eq(schema.workerConsents.workerId, w.id));
  return {
    worker_id: w.id,
    onboarded: true,
    status: w.status as "active" | "suspended",
    consents: Object.fromEntries(consents.map((c) => [c.document, c.version])),
    yen_payout_interest: w.yenPayoutInterestAt !== null,
  };
}

/** 01 §4.10: record (or withdraw) interest in yen payouts. Nothing else about payment is collected. */
export async function setYenPayoutInterest(app: AppContext, workerId: string, raw: unknown) {
  const v = (raw as { yen_interest?: unknown } | null)?.yen_interest;
  if (typeof v !== "boolean") throw new ApiError("VALIDATION_FAILED", { field: "yen_interest" });
  await app.db
    .update(schema.workers)
    .set({ yenPayoutInterestAt: v ? app.now() : null })
    .where(eq(schema.workers.id, workerId));
  return { yen_payout_interest: v };
}

// ---------- tasks ----------

function workerTaskView(t: TaskRow, distanceM: number, slots: number) {
  return {
    verification_id: t.id,
    type: t.type,
    question: t.question,
    answer_values: t.answerValues,
    location: { lat: t.targetLat, lng: t.targetLng, radius_m: t.radiusM },
    distance_m: Math.round(distanceM),
    reward: { asset: "USDC" as const, amount: fromMicro(toMicro(t.bountyAmount)) },
    deadline: t.deadline.toISOString(),
    freshness_max_age_seconds: t.freshnessMaxAgeS,
    open_slots: slots,
    requirements: ["photo", "location", "task_nonce"] as const,
    safety_notes_version: SAFETY_NOTES_VERSION,
  };
}

/** Location arrives rounded by the client and is neither stored nor logged (05 §3.2). */
export async function listTasks(
  app: AppContext,
  workerId: string,
  q: { lat: number; lng: number; radius_km: number },
) {
  const now = app.now();
  const rows = await app.db
    .select()
    .from(schema.verificationRequests)
    .where(
      and(
        inArray(schema.verificationRequests.status, [...CLAIMABLE_STATUSES]),
        gt(schema.verificationRequests.deadline, now),
      ),
    );
  const mine = await app.db
    .select({ v: schema.claims.verificationId })
    .from(schema.claims)
    .where(eq(schema.claims.workerId, workerId));
  const claimed = new Set(mine.map((m) => m.v));
  const out = [];
  for (const t of rows) {
    if (claimed.has(t.id)) continue;
    const d = haversineM(q, { lat: t.targetLat, lng: t.targetLng });
    if (d > q.radius_km * 1000) continue;
    const c = await taskCounts(app.db, t.id);
    const slots = openSlots({ requiredWitnesses: t.requiredWitnesses, ...c });
    if (slots > 0) out.push(workerTaskView(t, d, slots));
  }
  out.sort((a, b) => a.distance_m - b.distance_m);
  return { tasks: out };
}

export async function taskDetail(app: AppContext, verificationId: string) {
  const [t] = await app.db
    .select()
    .from(schema.verificationRequests)
    .where(eq(schema.verificationRequests.id, verificationId));
  if (!t || !(CLAIMABLE_STATUSES as readonly string[]).includes(t.status))
    throw new ApiError("VERIFICATION_NOT_FOUND");
  const c = await taskCounts(app.db, t.id);
  return workerTaskView(t, 0, openSlots({ requiredWitnesses: t.requiredWitnesses, ...c }));
}

// ---------- claims / challenges ----------

async function insertChallenge(tx: Db, claimId: string, issuedAt: Date, expiresAt: Date) {
  const nonce = randomToken(32);
  const id = newId("challenge");
  await tx
    .update(schema.challenges)
    .set({ state: "SUPERSEDED" })
    .where(and(eq(schema.challenges.claimId, claimId), eq(schema.challenges.state, "ISSUED")));
  await tx
    .insert(schema.challenges)
    .values({ id, claimId, nonceHash: sha256(nonce), state: "ISSUED", issuedAt, expiresAt });
  return { challenge_id: id, nonce, expires_at: expiresAt.toISOString() };
}

const minDate = (...d: Date[]) => new Date(Math.min(...d.map((x) => x.getTime())));

export async function claimTask(app: AppContext, workerId: string, verificationId: string) {
  return app.db.transaction(async (tx) => {
    const now = app.now();
    const task = await lockTask(tx, verificationId);
    if (now >= task.deadline) throw new ApiError("TASK_EXPIRED");
    const [existing] = await tx
      .select()
      .from(schema.claims)
      .where(and(eq(schema.claims.verificationId, verificationId), eq(schema.claims.workerId, workerId)));
    if (existing) throw new ApiError("ALREADY_CLAIMED");
    if (!(CLAIMABLE_STATUSES as readonly string[]).includes(task.status))
      throw new ApiError("TASK_NOT_CLAIMABLE");
    const c = await taskCounts(tx, task.id);
    if (openSlots({ requiredWitnesses: task.requiredWitnesses, ...c }) <= 0)
      throw new ApiError("NO_OPEN_SLOT");
    await applyTaskEvent(
      tx,
      app,
      task,
      "CLAIM_CREATED",
      { actorType: "worker", actorRef: workerId, correlationId: task.id },
      "TASK_NOT_CLAIMABLE",
    );
    const claimId = newId("claim");
    const expiresAt = minDate(new Date(now.getTime() + LIMITS.claimTtlS * 1000), task.deadline);
    await tx
      .insert(schema.claims)
      .values({ id: claimId, verificationId, workerId, state: "ACTIVE", acceptedAt: now, expiresAt });
    const challenge = await insertChallenge(tx, claimId, now, challengeExpiry(task, now, expiresAt));
    return { claim_id: claimId, status: "CLAIMED" as const, expires_at: expiresAt.toISOString(), challenge };
  });
}

function challengeExpiry(task: TaskRow, now: Date, claimExpiresAt: Date): Date {
  return minDate(new Date(now.getTime() + task.freshnessMaxAgeS * 1000), claimExpiresAt, task.deadline);
}

/** Load the worker's claim with its task locked. */
export async function lockOwnClaim(tx: Db, workerId: string, claimId: string) {
  const [claim] = await tx.select().from(schema.claims).where(eq(schema.claims.id, claimId));
  if (!claim || claim.workerId !== workerId) throw new ApiError("FORBIDDEN");
  const task = await lockTask(tx, claim.verificationId);
  const [locked] = await tx.select().from(schema.claims).where(eq(schema.claims.id, claimId)).for("update");
  if (!locked) throw new ApiError("FORBIDDEN");
  return { claim: locked, task };
}

function assertActive(claim: typeof schema.claims.$inferSelect, now: Date) {
  if (claim.state !== "ACTIVE" || claim.expiresAt <= now) throw new ApiError("CLAIM_NOT_ACTIVE");
}

export async function issueChallenge(app: AppContext, workerId: string, claimId: string) {
  return app.db.transaction(async (tx) => {
    const now = app.now();
    const { claim, task } = await lockOwnClaim(tx, workerId, claimId);
    assertActive(claim, now);
    if (now >= task.deadline) throw new ApiError("TASK_EXPIRED");
    return insertChallenge(tx, claimId, now, challengeExpiry(task, now, claim.expiresAt));
  });
}

export async function abandonClaim(app: AppContext, workerId: string, claimId: string) {
  await app.db.transaction(async (tx) => {
    const now = app.now();
    const { claim } = await lockOwnClaim(tx, workerId, claimId);
    if (claim.state !== "ACTIVE") return;
    await tx
      .update(schema.claims)
      .set({ state: "ABANDONED", closedAt: now, closeReason: "WORKER_ABANDONED" })
      .where(eq(schema.claims.id, claimId));
    await tx
      .update(schema.challenges)
      .set({ state: "SUPERSEDED" })
      .where(and(eq(schema.challenges.claimId, claimId), eq(schema.challenges.state, "ISSUED")));
    await appendAudit(tx, {
      verificationId: claim.verificationId,
      actorType: "worker",
      actorRef: workerId,
      eventType: "claim_abandoned",
      beforeState: "ACTIVE",
      afterState: "ABANDONED",
      correlationId: claim.verificationId,
    });
  });
  return claimDetail(app, workerId, claimId);
}

export async function createUpload(
  app: AppContext,
  workerId: string,
  claimId: string,
  body: { challenge_id: string; content_type: string; byte_size: number },
) {
  const now = app.now();
  const out = await app.db.transaction(async (tx) => {
    const { claim, task } = await lockOwnClaim(tx, workerId, claimId);
    assertActive(claim, now);
    if (now >= task.deadline) throw new ApiError("TASK_EXPIRED");
    const [ch] = await tx.select().from(schema.challenges).where(eq(schema.challenges.id, body.challenge_id));
    if (!ch || ch.claimId !== claimId || ch.state !== "ISSUED") throw new ApiError("NONCE_INVALID");
    if (ch.expiresAt <= now) throw new ApiError("NONCE_EXPIRED");
    const uploadId = newId("upload");
    const key = `${task.id}/${claimId}/${uploadId}.jpg`;
    await tx
      .insert(schema.uploads)
      .values({ id: uploadId, claimId, challengeId: ch.id, objectKey: key, state: "PENDING", issuedAt: now });
    return { uploadId, key };
  });
  const signed = await app.storage.createSignedUploadUrl(out.key);
  return {
    upload_id: out.uploadId,
    upload_url: signed.url,
    expires_in_seconds: signed.expiresInS,
    max_bytes: LIMITS.media.maxBytes,
  };
}

export async function claimDetail(app: AppContext, workerId: string, claimId: string) {
  const [claim] = await app.db.select().from(schema.claims).where(eq(schema.claims.id, claimId));
  if (!claim || claim.workerId !== workerId) throw new ApiError("FORBIDDEN");
  const subs = await app.db
    .select()
    .from(schema.witnessSubmissions)
    .where(eq(schema.witnessSubmissions.claimId, claimId))
    .orderBy(schema.witnessSubmissions.serverReceivedAt);
  const checks = subs.length
    ? await app.db
        .select()
        .from(schema.evidenceChecks)
        .where(
          inArray(
            schema.evidenceChecks.submissionId,
            subs.map((s) => s.id),
          ),
        )
    : [];
  const [result] = await app.db
    .select()
    .from(schema.verificationResults)
    .where(eq(schema.verificationResults.verificationId, claim.verificationId));
  const accepted = subs.some((s) => s.state === "VALID");
  const [task] = await app.db
    .select({
      type: schema.verificationRequests.type,
      answerValues: schema.verificationRequests.answerValues,
    })
    .from(schema.verificationRequests)
    .where(eq(schema.verificationRequests.id, claim.verificationId));
  return {
    claim_id: claim.id,
    verification_id: claim.verificationId,
    state: claim.state,
    expires_at: claim.expiresAt.toISOString(),
    attempts_remaining: Math.max(0, LIMITS.attemptsPerClaim - claim.attempts),
    submissions: subs.map((s) => ({
      submission_id: s.id,
      state: s.state as "VALID" | "INVALID",
      reason_code: s.reasonCode,
      reason_message_ja: s.reasonCode ? reasonMessage(s.reasonCode, {}) : null,
      retryable: s.state === "INVALID" && claim.state === "ACTIVE",
      checks: Object.fromEntries(
        checks.filter((c) => c.submissionId === s.id).map((c) => [c.checkType, c.status]),
      ),
    })),
    task_result: result && accepted ? { status: result.outcome, answer: result.finalAnswer } : null,
    type: task?.type ?? "PLACE_STATUS_VERIFICATION",
    answer_values: task?.answerValues ?? [],
  };
}
