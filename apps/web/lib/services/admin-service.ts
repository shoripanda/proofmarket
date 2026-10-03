import "server-only";

// Operator-side provisioning used by scripts/ and tests (04 §5): principals, API keys, places, top-ups.

import { randomBytes } from "node:crypto";
import { ApiError, newId, PLATFORM_FLAGS, type PlatformFlag } from "@proofmarket/core";
import { type Db, schema } from "@proofmarket/db";
import { and, eq } from "drizzle-orm";
import { appendAudit } from "./audit";
import { randomToken, sha256 } from "./crypto";

export async function createPrincipal(
  db: Db,
  p: { displayName: string; type: "person" | "organization" },
): Promise<string> {
  const id = newId("principal");
  await db.insert(schema.principals).values({ id, type: p.type, displayName: p.displayName });
  return id;
}

/** Returns the plaintext key ONCE; only SHA-256(secret) is stored. */
export async function issueApiKey(
  db: Db,
  o: {
    principalId: string;
    requesterName: string;
    maxTaskAmount: string;
    dailySpendLimit: string;
    rateLimitPerMin?: number;
    operator: string;
  },
): Promise<{ credentialId: string; apiKey: string }> {
  const prefix = randomBytes(4).toString("hex");
  const secret = randomToken();
  const credentialId = newId("credential");
  await db.insert(schema.requesterCredentials).values({
    id: credentialId,
    principalId: o.principalId,
    requesterName: o.requesterName,
    keyPrefix: prefix,
    secretHash: sha256(secret),
    maxTaskAmount: o.maxTaskAmount,
    dailySpendLimit: o.dailySpendLimit,
    rateLimitPerMin: o.rateLimitPerMin ?? 30,
  });
  await appendAudit(db, {
    verificationId: null,
    actorType: "operator",
    actorRef: o.operator,
    eventType: "operator_action",
    beforeState: null,
    afterState: null,
    correlationId: credentialId,
    metadata: { action: "issue_api_key", key_prefix: prefix },
  });
  return { credentialId, apiKey: `pm_test_${prefix}_${secret}` };
}

export async function topUp(db: Db, credentialId: string, amount: string): Promise<void> {
  await db.insert(schema.requesterLedger).values({ credentialId, entryType: "TOPUP", amount });
}

export async function registerPlace(
  db: Db,
  p: {
    name: string;
    lat: number;
    lng: number;
    category: "retail" | "restaurant" | "service" | "public_facility";
    by: string;
  },
): Promise<string> {
  const id = newId("place");
  await db
    .insert(schema.places)
    .values({ id, name: p.name, lat: p.lat, lng: p.lng, category: p.category, approvedBy: p.by });
  await appendAudit(db, {
    verificationId: null,
    actorType: "operator",
    actorRef: p.by,
    eventType: "operator_action",
    beforeState: null,
    afterState: null,
    correlationId: id,
    metadata: { action: "register_place", place_id: id },
  });
  return id;
}

// ---------- incident response (08 §6). Every action is audited as operator_action. ----------

async function audit(db: Db, by: string, action: string, ref: string, extra: Record<string, unknown> = {}) {
  await appendAudit(db, {
    verificationId: ref.startsWith("ver_") ? ref : null,
    actorType: "operator",
    actorRef: by,
    eventType: "operator_action",
    beforeState: null,
    afterState: null,
    correlationId: ref,
    metadata: { action, target: ref, ...extra },
  });
}

export async function setFlag(db: Db, key: PlatformFlag, value: boolean, by: string) {
  if (!PLATFORM_FLAGS.includes(key)) throw new ApiError("VALIDATION_FAILED", { key });
  await db
    .insert(schema.platformFlags)
    .values({ key, value, updatedBy: by })
    .onConflictDoUpdate({
      target: schema.platformFlags.key,
      set: { value, updatedBy: by, updatedAt: new Date() },
    });
  await audit(db, by, "set_flag", key, { value });
}

export async function suspendCredential(db: Db, id: string, by: string) {
  const r = await db
    .update(schema.requesterCredentials)
    .set({ status: "suspended" })
    .where(eq(schema.requesterCredentials.id, id))
    .returning();
  if (!r.length) throw new ApiError("VERIFICATION_NOT_FOUND", { credential: id });
  await audit(db, by, "suspend_credential", id);
}

export async function revokeCredential(db: Db, id: string, by: string, now: Date) {
  const r = await db
    .update(schema.requesterCredentials)
    .set({ status: "suspended", revokedAt: now })
    .where(eq(schema.requesterCredentials.id, id))
    .returning();
  if (!r.length) throw new ApiError("VERIFICATION_NOT_FOUND", { credential: id });
  await audit(db, by, "revoke_credential", id);
}

export async function suspendWorker(db: Db, id: string, by: string, now: Date) {
  await db.transaction(async (tx) => {
    const r = await tx
      .update(schema.workers)
      .set({ status: "suspended" })
      .where(eq(schema.workers.id, id))
      .returning();
    if (!r.length) throw new ApiError("VERIFICATION_NOT_FOUND", { worker: id });
    await tx
      .update(schema.claims)
      .set({ state: "EXPIRED", closedAt: now, closeReason: "WORKER_SUSPENDED" })
      .where(and(eq(schema.claims.workerId, id), eq(schema.claims.state, "ACTIVE")));
    await audit(tx, by, "suspend_worker", id);
  });
}

export async function revokeEvidenceAccess(db: Db, verificationId: string, by: string) {
  const r = await db
    .update(schema.verificationRequests)
    .set({ evidenceAccessRevoked: true })
    .where(eq(schema.verificationRequests.id, verificationId))
    .returning();
  if (!r.length) throw new ApiError("VERIFICATION_NOT_FOUND");
  await audit(db, by, "revoke_evidence_access", verificationId);
}

/** List (or unlist) a result on the site's top page (05 §4). Only tasks that already have a result. */
export async function setFeatured(db: Db, verificationId: string, featured: boolean, by: string, now: Date) {
  const [res] = await db
    .select({ id: schema.verificationResults.verificationId })
    .from(schema.verificationResults)
    .where(eq(schema.verificationResults.verificationId, verificationId));
  if (!res) throw new ApiError("VERIFICATION_NOT_FOUND", { reason: "no_result_yet" });
  await db
    .update(schema.verificationRequests)
    .set({ featuredAt: featured ? now : null })
    .where(eq(schema.verificationRequests.id, verificationId));
  await audit(db, by, featured ? "feature_result" : "unfeature_result", verificationId);
}

export async function requeueJob(db: Db, jobId: number, by: string, now: Date) {
  const r = await db
    .update(schema.outboxJobs)
    .set({ state: "PENDING", runAfter: now, attempts: 0, lockedBy: null, lockedUntil: null, updatedAt: now })
    .where(and(eq(schema.outboxJobs.id, jobId), eq(schema.outboxJobs.state, "DEAD")))
    .returning();
  if (!r.length) throw new ApiError("VALIDATION_FAILED", { job: jobId, reason: "not a DEAD job" });
  await audit(db, by, "requeue_job", String(jobId));
}
