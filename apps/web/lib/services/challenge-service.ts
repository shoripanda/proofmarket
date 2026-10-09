import "server-only";
// Optimistic verification (13 §3): one person answers, the answer is provisional for challenge_minutes, and
// anyone with an API key may challenge it once for a bond. The judgement itself is unchanged; this decides
// when the result is finalized and who may stop it.
//
// Money (bond k = bounty x 2 = what a 2-person recheck costs):
// - The recheck is owned by the original requester (so a third party never sees a private question), but its
//   RESERVE row is the challenger's: the bond is the recheck's funding. Anything the recheck does not spend
//   goes back to the challenger (task-engine credits whoever reserved).
// - UPHELD: the bond paid for the recheck. What is left after the recheck's cost goes to the original worker
//   as a payout adjustment; with k equal to that cost it is 0, and nothing is written.
// - OVERTURNED: the requester pays for the recheck and the challenger gets the bond back: a debit on the
//   requester and a credit on the challenger, with no verification_id (one RESERVE and one credit-back per task
//   are already taken by the tasks themselves). Nothing moves when they are the same key.

import {
  ApiError,
  answerSchemaOf,
  decide,
  fromMicro,
  LIMITS,
  newId,
  settledPerWitnessMicro,
  toMicro,
} from "@proofmarket/core";
import {
  CreateVerificationRequestSchema,
  ObjectionRequestSchema,
  type ObjectionResponseSchema,
} from "@proofmarket/core/schemas/api";
import { type Db, schema } from "@proofmarket/db";
import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import type { z } from "zod";
import type { RequesterAuth } from "../auth/requester";
import type { AppContext } from "../context";
import { appendAudit } from "./audit";
import { bountyOf } from "./bounty";
import { createVerification } from "./requester-service";
import { applyTaskEvent, enqueueJob, lockTask, microToDecimal, type TaskRow } from "./task-engine";
import { evaluateConsensus, saveResult } from "./verification-service";

type ObjectionResponse = z.infer<typeof ObjectionResponseSchema>;

const windowEnd = (task: TaskRow) =>
  task.provisionalAt && task.challengeMinutes !== null
    ? new Date(task.provisionalAt.getTime() + task.challengeMinutes * 60_000)
    : null;

/** POST /v1/verifications/{id}/challenge. Runs inside withIdempotency's transaction. */
export async function challengeVerification(
  app: AppContext,
  tx: Db,
  auth: RequesterAuth,
  id: string,
  raw: unknown,
): Promise<{ status: 201; body: ObjectionResponse }> {
  const r = ObjectionRequestSchema.safeParse(raw ?? {});
  if (!r.success) {
    throw new ApiError("VALIDATION_FAILED", {
      issues: r.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    });
  }
  const now = app.now();
  const orig = await lockTask(tx, id);
  const until = windowEnd(orig);
  if (!until || orig.status !== "SUBMITTED" || now >= until) throw new ApiError("CHALLENGE_NOT_ALLOWED");
  const [taken] = await tx
    .select({ id: schema.verificationChallenges.id })
    .from(schema.verificationChallenges)
    .where(eq(schema.verificationChallenges.verificationId, orig.id));
  if (taken) throw new ApiError("CHALLENGE_NOT_ALLOWED", { reason: "already_challenged" });

  // The same recheck as a dispute (01 §4.12): two agreeing people, same place, same question, 60 minutes.
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
    deadline: new Date(now.getTime() + 60 * 60_000).toISOString(),
    freshness: { max_age_seconds: orig.freshnessMaxAgeS },
    evidence_requirements: { photo: true, task_nonce: true },
    assurance: { level: "standard" },
    bounty: {
      asset: orig.bountyAsset,
      amount: fromMicro(settledPerWitnessMicro(bountyOf(orig))),
      network: orig.bountyNetwork,
    },
    principal_ref: auth.principalId,
  });
  // Balance, limits and the RESERVE row are the challenger's: that reservation is the bond.
  const created = await createVerification(app, tx, auth, body, `challenge:${orig.id}`);
  const recheckId = created.body.verification_id;
  await tx
    .update(schema.verificationRequests)
    .set({
      recheckOf: orig.id,
      credentialId: orig.credentialId,
      principalId: orig.principalId,
      callbackEndpointId: orig.callbackEndpointId,
    })
    .where(eq(schema.verificationRequests.id, recheckId));
  const bond = settledPerWitnessMicro(bountyOf(orig)) * BigInt(LIMITS.challenge.bondMultiple);
  await tx.insert(schema.verificationChallenges).values({
    id: newId("objection"),
    verificationId: orig.id,
    challengerCredentialId: auth.credentialId,
    bondAmount: microToDecimal(bond),
    recheckVerificationId: recheckId,
    state: "OPEN",
    createdAt: now,
  });
  await appendAudit(tx, {
    verificationId: orig.id,
    actorType: "requester",
    actorRef: auth.keyPrefix,
    eventType: "operator_action",
    beforeState: null,
    afterState: null,
    correlationId: orig.id,
    metadata: { action: "challenge_opened", recheck: recheckId, reason: r.data.reason ?? null },
  });
  if (orig.callbackEndpointId) {
    await enqueueJob(
      tx,
      "DELIVER_WEBHOOK",
      `verification.challenged:${orig.id}`,
      {
        verification_id: orig.id,
        endpoint_id: orig.callbackEndpointId,
        event: "verification.challenged",
      },
      now,
    );
  }
  return {
    status: 201,
    body: {
      verification_id: orig.id as ObjectionResponse["verification_id"],
      recheck_verification_id: recheckId as ObjectionResponse["recheck_verification_id"],
      bond: { asset: "USDC", amount: fromMicro(bond) },
      state: "challenged",
    },
  };
}

/** The provisional answer: the one valid submission of an optimistic task. */
async function provisionalAnswer(tx: Db, task: TaskRow) {
  const valid = await tx
    .select({ answer: schema.witnessSubmissions.answer, workerId: schema.witnessSubmissions.workerId })
    .from(schema.witnessSubmissions)
    .where(
      and(
        eq(schema.witnessSubmissions.verificationId, task.id),
        eq(schema.witnessSubmissions.state, "VALID"),
      ),
    )
    .orderBy(asc(schema.witnessSubmissions.serverReceivedAt));
  const d = decide(valid, task.quorum);
  return { answer: d.kind === "VERIFIED" ? d.answer : null, workerId: valid[0]?.workerId ?? null };
}

const system = (id: string) => ({ actorType: "system" as const, actorRef: null, correlationId: id });

/** Finalize the provisional answer as it stands (window closed, or the recheck upheld it). */
async function finalizeAsProvisional(tx: Db, app: AppContext, task: TaskRow): Promise<void> {
  await applyTaskEvent(tx, app, task, "QUORUM_READY", system(task.id));
  await evaluateConsensus(tx, app, task);
}

/** Tick (13 §3): close windows that passed with no challenge, and settle challenges whose recheck is final. */
export async function runOptimistic(app: AppContext): Promise<{ finalized: number; resolved: number }> {
  const now = app.now();
  const due = await app.db
    .select({ id: schema.verificationRequests.id })
    .from(schema.verificationRequests)
    .where(
      and(
        eq(schema.verificationRequests.status, "SUBMITTED"),
        isNotNull(schema.verificationRequests.provisionalAt),
        // Raw SQL binds a Date as its toString() with postgres-js (not with PGlite), so pass ISO text (jobs.ts does the same).
        sql`${schema.verificationRequests.provisionalAt} + ${schema.verificationRequests.challengeMinutes} * interval '1 minute' <= ${now.toISOString()}::timestamptz`,
        sql`not exists (select 1 from verification_challenges vc where vc.verification_id = ${schema.verificationRequests.id})`,
      ),
    );
  let finalized = 0;
  for (const { id } of due) {
    await app.db.transaction(async (tx) => {
      const t = await lockTask(tx, id);
      const until = windowEnd(t);
      if (t.status !== "SUBMITTED" || !until || now < until) return;
      const [c] = await tx
        .select({ id: schema.verificationChallenges.id })
        .from(schema.verificationChallenges)
        .where(eq(schema.verificationChallenges.verificationId, t.id));
      if (c) return;
      await finalizeAsProvisional(tx, app, t);
      finalized++;
    });
  }

  const open = await app.db
    .select({ id: schema.verificationChallenges.id })
    .from(schema.verificationChallenges)
    .innerJoin(
      schema.verificationResults,
      eq(schema.verificationResults.verificationId, schema.verificationChallenges.recheckVerificationId),
    )
    .where(eq(schema.verificationChallenges.state, "OPEN"));
  let resolved = 0;
  for (const { id } of open) {
    await app.db.transaction(async (tx) => {
      if (await resolveChallenge(tx, app, id)) resolved++;
    });
  }
  return { finalized, resolved };
}

/**
 * The recheck is final: compare it with the provisional answer (the same test as `recheck.matches_original`).
 * A recheck that found nothing (expired, or the two people disagreed) cannot contradict it, so it stands.
 */
async function resolveChallenge(tx: Db, app: AppContext, challengeId: string): Promise<boolean> {
  const [c] = await tx
    .select()
    .from(schema.verificationChallenges)
    .where(eq(schema.verificationChallenges.id, challengeId))
    .for("update");
  if (!c || c.state !== "OPEN" || !c.recheckVerificationId) return false;
  const orig = await lockTask(tx, c.verificationId);
  if (orig.status !== "SUBMITTED") return false;
  const [recheck] = await tx
    .select({ outcome: schema.verificationResults.outcome, answer: schema.verificationResults.finalAnswer })
    .from(schema.verificationResults)
    .where(eq(schema.verificationResults.verificationId, c.recheckVerificationId));
  if (!recheck) return false;
  const provisional = await provisionalAnswer(tx, orig);
  const overturned = recheck.outcome === "VERIFIED" && recheck.answer !== provisional.answer;
  const now = app.now();
  const bond = toMicro(c.bondAmount);

  if (overturned) {
    await applyTaskEvent(tx, app, orig, "QUORUM_READY", system(orig.id));
    await saveResult(tx, app, orig, { status: "REJECTED", reason: "CHALLENGED", answer: null });
    await applyTaskEvent(tx, app, orig, "CHALLENGE_OVERTURNED", {
      ...system(orig.id),
      challengeOverturned: true,
      metadata: { recheck: c.recheckVerificationId, recheck_answer: recheck.answer },
    });
    if (c.challengerCredentialId !== orig.credentialId && bond > 0n) {
      await tx.insert(schema.requesterLedger).values([
        // the recheck's cost moves to the requester ...
        {
          credentialId: orig.credentialId,
          verificationId: null,
          entryType: "RESERVE",
          amount: microToDecimal(-bond),
          asset: orig.bountyAsset,
          createdAt: now,
        },
        // ... and the bond goes back to the challenger in full
        {
          credentialId: c.challengerCredentialId,
          verificationId: null,
          entryType: "REFUND",
          amount: microToDecimal(bond),
          asset: orig.bountyAsset,
          createdAt: now,
        },
      ]);
    }
  } else {
    await finalizeAsProvisional(tx, app, orig);
    // The bond paid for the recheck; only what is left over goes to the original worker.
    const recheckCost = settledPerWitnessMicro(bountyOf(orig)) * 2n;
    const left = bond - recheckCost;
    if (left > 0n && provisional.workerId) {
      await tx.insert(schema.payoutAdjustments).values({
        id: newId("payoutAdjustment"),
        workerId: provisional.workerId,
        verificationId: orig.id,
        amount: microToDecimal(left),
        reason: "challenge_upheld",
        createdAt: now,
      });
    }
  }
  await tx
    .update(schema.verificationChallenges)
    .set({ state: overturned ? "OVERTURNED" : "UPHELD", resolvedAt: now })
    .where(eq(schema.verificationChallenges.id, c.id));
  await appendAudit(tx, {
    verificationId: orig.id,
    actorType: "system",
    actorRef: null,
    eventType: "operator_action",
    beforeState: null,
    afterState: null,
    correlationId: orig.id,
    metadata: {
      action: overturned ? "challenge_overturned" : "challenge_upheld",
      recheck: c.recheckVerificationId,
      provisional: provisional.answer,
      recheck_answer: recheck.answer,
    },
  });
  return true;
}
