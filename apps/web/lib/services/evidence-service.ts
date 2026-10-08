import "server-only";
// Evidence submission (05 §3.6, 07 §3). Pre-checks -> HTTP errors (nothing recorded, attempt not consumed).
// After pre-checks the submission is recorded and checks run in CHECK_ORDER; the outcome is a 200 body.

import {
  ApiError,
  answerSchemaOf,
  CHECK_ORDER,
  type CheckOutcome,
  type CheckReasonCode,
  checkDuplicate,
  checkFreshness,
  checkGeofence,
  checkMediaSchema,
  checkReplay,
  combinePhotoOutcomes,
  firstFailure,
  LIMITS,
  NON_RETRYABLE_REASONS,
  newId,
  normalizeAnswer,
  PRE_CHECKS,
  RETENTION_DAYS,
  runChecks,
} from "@proofmarket/core";
import type { SubmitEvidenceRequest } from "@proofmarket/core/schemas/api";
import { constraintName, type Db, pgErrorCode, schema } from "@proofmarket/db";
import { and, asc, eq, gte, inArray, isNotNull, lte, ne } from "drizzle-orm";
import sharp from "sharp";
import type { AppContext } from "../context";
import type { SubmissionReviewer } from "../ports";
import { appendAudit } from "./audit";
import { encryptBytes, encryptLocation, sha256 } from "./crypto";
import { reasonMessage } from "./messages";
import { applyTaskEvent, enqueueJob, lockTask, type TaskRow, taskCounts } from "./task-engine";
import { taskLocation } from "./task-location";
import { evaluateConsensus } from "./verification-service";
import { lockOwnClaim } from "./worker-service";

async function reviewSubmission(
  reviewer: SubmissionReviewer,
  task: TaskRow,
  answer: string,
  images: Buffer[],
): Promise<CheckOutcome> {
  const spec = answerSchemaOf(
    task.answerKind,
    task.answerValues,
    task.answerSpec as Record<string, unknown> | null,
  );
  try {
    const r = await reviewer.review({
      type: task.type,
      question: task.question,
      ...(task.acceptanceCriteria ? { acceptanceCriteria: task.acceptanceCriteria } : {}),
      answerFormat: JSON.stringify(spec),
      answer,
      images,
    });
    const details = { verdict: r.verdict, reason: r.reason, observed: r.observed, model: r.model };
    if (r.verdict === "fail")
      return { type: "vision_consistency", status: "fail", reasonCode: "EVIDENCE_MISMATCH", details };
    return { type: "vision_consistency", status: r.verdict === "pass" ? "pass" : "warning", details };
  } catch (e) {
    // The review service being down must not block workers: the result shows the check as a warning.
    const error = e instanceof Error ? e.message.slice(0, 200) : "unknown";
    return { type: "vision_consistency", status: "warning", details: { verdict: "unavailable", error } };
  }
}

interface ProcessedImage {
  sha256: Buffer;
  magic: Uint8Array;
  decoded: { width: number; height: number } | null;
  derived: Buffer | null;
  dhash: bigint | null;
  exif: Buffer | null;
}

/** Decode with limits, strip metadata into a derived JPEG, compute a 64-bit dHash (07 §3.1). */
export async function processImage(bytes: Buffer): Promise<ProcessedImage> {
  const base = { sha256: sha256(bytes), magic: bytes.subarray(0, 12) };
  try {
    const img = sharp(bytes, { limitInputPixels: LIMITS.media.maxInputPixels, failOn: "error" });
    const meta = await img.metadata();
    if (meta.format !== "jpeg" || !meta.width || !meta.height) {
      return { ...base, decoded: null, derived: null, dhash: null, exif: null };
    }
    const rotated = sharp(bytes, { limitInputPixels: LIMITS.media.maxInputPixels }).rotate();
    const derived = await rotated
      .clone()
      .resize({
        width: LIMITS.media.derivedLongEdgePx,
        height: LIMITS.media.derivedLongEdgePx,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: 82 })
      .toBuffer(); // sharp drops EXIF/ICC/XMP unless withMetadata() is called
    const px = await sharp(derived).greyscale().resize(9, 8, { fit: "fill" }).raw().toBuffer();
    let h = 0n;
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 8; x++) {
        h = (h << 1n) | ((px[y * 9 + x] ?? 0) > (px[y * 9 + x + 1] ?? 0) ? 1n : 0n);
      }
    }
    const swapped = meta.orientation && meta.orientation >= 5;
    return {
      ...base,
      decoded: { width: swapped ? meta.height : meta.width, height: swapped ? meta.width : meta.height },
      derived,
      dhash: BigInt.asIntN(64, h), // stored in a signed bigint column
      exif: meta.exif ?? null,
    };
  } catch {
    return { ...base, decoded: null, derived: null, dhash: null, exif: null };
  }
}

export interface SubmitResponse {
  submission_id: string;
  /** CHECKING: waiting for the outside AI review (01 §4.17). */
  state: "VALID" | "INVALID" | "CHECKING";
  reason_code: CheckReasonCode | null;
  reason_message_ja: string | null;
  retryable: boolean;
  attempts_remaining: number;
  claim_state: string;
  checks: Record<string, string>;
}

export async function submitEvidence(
  app: AppContext,
  tx: Db,
  workerId: string,
  verificationId: string,
  body: SubmitEvidenceRequest,
  idempotencyKey: string,
): Promise<SubmitResponse> {
  const now = app.now();
  const { claim, task } = await lockOwnClaim(tx, workerId, body.claim_id);

  // ---- pre-checks (05 §3.6): HTTP errors, nothing recorded ----
  if (claim.verificationId !== verificationId) throw new ApiError("FORBIDDEN");
  if (claim.state !== "ACTIVE" || claim.expiresAt <= now) throw new ApiError("CLAIM_NOT_ACTIVE");
  const [pending] = await tx
    .select({ id: schema.witnessSubmissions.id })
    .from(schema.witnessSubmissions)
    .where(
      and(eq(schema.witnessSubmissions.claimId, claim.id), eq(schema.witnessSubmissions.state, "CHECKING")),
    );
  if (pending) throw new ApiError("REVIEW_PENDING");
  if (now >= task.deadline || !["CLAIMED", "SUBMITTED"].includes(task.status))
    throw new ApiError("TASK_EXPIRED");
  const [ch] = await tx
    .select()
    .from(schema.challenges)
    .where(
      and(
        eq(schema.challenges.claimId, claim.id),
        eq(schema.challenges.nonceHash, sha256(body.challenge.nonce)),
      ),
    );
  if (!ch) throw new ApiError("NONCE_INVALID");
  if (ch.state === "USED") throw new ApiError("NONCE_USED");
  if (ch.state === "SUPERSEDED") throw new ApiError("NONCE_INVALID");
  // 01 §4.18: 1–4 photos, each its own upload, all under this claim and this challenge, in the order sent.
  const uploadIds = body.evidence.map((e) => e.object_ref);
  const found = await tx.select().from(schema.uploads).where(inArray(schema.uploads.id, uploadIds));
  const uploads = uploadIds.map((uid) => found.find((u) => u.id === uid));
  for (const upload of uploads) {
    if (!upload || upload.claimId !== claim.id || upload.state !== "PENDING")
      throw new ApiError("UPLOAD_NOT_FOUND");
    if (upload.challengeId !== ch.id) throw new ApiError("NONCE_INVALID");
  }
  const photos = uploads.filter((u) => u !== undefined);
  const answer = normalizeAnswer(
    answerSchemaOf(task.answerKind, task.answerValues, task.answerSpec as Record<string, unknown> | null),
    body.answer,
  );
  if (answer === null) throw new ApiError("ANSWER_INVALID");
  // Location is checked only for tasks that have one; work that can be done anywhere skips the geofence (01 §4.15).
  const target = taskLocation(task);
  const { lat, lng, accuracy_m } = body.capture;
  const observed =
    lat !== undefined && lng !== undefined && accuracy_m !== undefined
      ? { lat, lng, accuracyM: accuracy_m }
      : null;
  if (target && !observed)
    throw new ApiError("VALIDATION_FAILED", { field: "capture.lat", reason: "required" });

  // ---- record the submission ----
  const submissionId = newId("submission");
  await tx
    .update(schema.challenges)
    .set({ state: "USED", usedAt: now })
    .where(eq(schema.challenges.id, ch.id));
  await tx.update(schema.uploads).set({ state: "FINALIZED" }).where(inArray(schema.uploads.id, uploadIds));
  const attempts = claim.attempts + 1;
  await tx.update(schema.claims).set({ attempts }).where(eq(schema.claims.id, claim.id));
  await tx.insert(schema.witnessSubmissions).values({
    id: submissionId,
    verificationId,
    claimId: claim.id,
    workerId,
    challengeId: ch.id,
    answer,
    state: "CHECKING",
    clientTimestamp: new Date(body.capture.client_timestamp),
    serverReceivedAt: now,
    idempotencyKeyHash: sha256(idempotencyKey),
  });
  await applyTaskEvent(
    tx,
    app,
    task,
    "SUBMISSION_RECEIVED",
    { actorType: "worker", actorRef: workerId, correlationId: task.id },
    "TASK_EXPIRED",
  );

  // ---- read + hash + derive (07 §3.1), per photo ----
  const deleteAfter = new Date(now.getTime() + RETENTION_DAYS.raw_evidence * 86_400_000);
  const read = await Promise.all(
    photos.map(async (upload) => {
      const obj = await app.storage.read(upload.objectKey);
      return { upload, obj, img: obj ? await processImage(obj.bytes) : null, replayConflict: false };
    }),
  );
  for (const p of read) {
    const { upload, obj, img } = p;
    if (!img) continue;
    try {
      await tx.transaction(async (sp) => {
        await sp.insert(schema.evidenceObjects).values({
          id: newId("evidence"),
          submissionId,
          uploadId: upload.id,
          rawObjectKey: upload.objectKey,
          derivedObjectKey: img.derived ? upload.objectKey : null,
          mediaType: "image/jpeg",
          byteSize: obj?.bytes.length ?? 0,
          width: img.decoded?.width ?? null,
          height: img.decoded?.height ?? null,
          sha256: img.sha256,
          dhash: img.dhash,
          serverReceivedAt: now,
          clientCaptureAt: new Date(body.capture.client_timestamp),
          // EXIF can hold GPS and device serials: encrypted, dropped with the raw file after 30 days.
          rawMetadataEnc: img.exif ? encryptBytes(app.config.locationEncKey, img.exif) : null,
          deleteAfter,
        });
      });
    } catch (e) {
      // Also hit when the same file is sent twice in one submission.
      if (pgErrorCode(e) === "23505" && constraintName(e)?.includes("evidence_sha256"))
        p.replayConflict = true;
      else throw e;
    }
  }

  // ---- duplicate candidates (P1): other claims' photos in the last 90 days ----
  const candidates = read.some((p) => p.img?.dhash != null)
    ? await tx
        .select({ submissionId: schema.evidenceObjects.submissionId, dhash: schema.evidenceObjects.dhash })
        .from(schema.evidenceObjects)
        .innerJoin(
          schema.witnessSubmissions,
          eq(schema.witnessSubmissions.id, schema.evidenceObjects.submissionId),
        )
        .where(
          and(
            ne(schema.witnessSubmissions.claimId, claim.id),
            isNotNull(schema.evidenceObjects.dhash),
            gte(
              schema.evidenceObjects.serverReceivedAt,
              new Date(now.getTime() - LIMITS.duplicate.lookbackDays * 86_400_000),
            ),
          ),
        )
    : [];

  // Each photo-level check runs on every photo; the first photo that fails fails the submission (01 §4.18).
  const perPhoto = (f: (p: (typeof read)[number]) => CheckOutcome) => () => combinePhotoOutcomes(read.map(f));
  const geo: CheckOutcome =
    target && observed
      ? checkGeofence({ target: { lat: target.lat, lng: target.lng, radiusM: target.radius_m }, observed })
      : { type: "geofence", status: "not_run" };
  const results: CheckOutcome[] = runChecks(CHECK_ORDER, [
    perPhoto(({ obj, img }) =>
      checkMediaSchema({
        declaredContentType: "image/jpeg",
        byteSize: obj?.bytes.length ?? 0,
        magicBytes: img?.magic ?? new Uint8Array(),
        decoded: img?.decoded ?? null,
      }),
    ),
    perPhoto((p) => checkReplay(p.replayConflict)),
    perPhoto(({ obj }) =>
      checkFreshness({
        now,
        challengeIssuedAt: ch.issuedAt,
        storageObjectCreatedAt: obj?.createdAt ?? new Date(0),
        clientTimestamp: new Date(body.capture.client_timestamp),
        freshnessMaxAgeS: task.freshnessMaxAgeS,
      }),
    ),
    () => geo,
    perPhoto(({ img }) =>
      img?.dhash != null
        ? checkDuplicate({
            dhash: img.dhash,
            candidates: candidates.map((c) => ({ submissionId: c.submissionId, dhash: c.dhash ?? 0n })),
          })
        : { type: "duplicate", status: "not_run" },
    ),
    () => ({ type: "vision_consistency", status: "not_run" }),
  ]);
  // AI review (01 §4.16): once every mechanical check has passed, Claude judges whether the photos and the answer
  // actually do what was asked. A clear miss fails the attempt (retryable); "uncertain" is recorded as a warning.
  const derived = read.flatMap((p) => (p.img?.derived ? [p.img.derived] : []));
  const allDerived = derived.length === read.length;
  const reviewAt = results.findIndex((r) => r.type === "vision_consistency");
  if (app.reviewer && allDerived && !firstFailure(results) && reviewAt >= 0) {
    results[reviewAt] = await reviewSubmission(app.reviewer, task, answer, derived);
  }

  // A replayed file has no evidence row (unique sha256), so nothing would ever purge it: delete it now.
  const replayed = read.filter((p) => p.replayConflict).map((p) => p.upload.objectKey);
  if (replayed.length) await app.storage.remove("evidence-raw", replayed);
  // Derived image only for decodable, non-replayed photos.
  for (const p of read) {
    if (p.img?.derived && !p.replayConflict) await app.storage.putDerived(p.upload.objectKey, p.img.derived);
  }

  // ---- persist checks + location ----
  for (const t of PRE_CHECKS)
    await tx.insert(schema.evidenceChecks).values({ submissionId, checkType: t, status: "pass" });
  for (const r of results) {
    await tx.insert(schema.evidenceChecks).values({
      submissionId,
      checkType: r.type,
      status: r.status,
      reasonCode: r.reasonCode ?? null,
      machineDetails: { ...(r.details ?? {}), ...(r.riskFlags ? { risk_flags: r.riskFlags } : {}) },
    });
  }
  const geoDetails = (geo.details ?? {}) as { distance_m?: number };
  if (observed) {
    await tx.insert(schema.locationObservations).values({
      submissionId,
      coordsEnc: encryptLocation(app.config.locationEncKey, observed.lat, observed.lng),
      accuracyM: observed.accuracyM,
      distanceToTargetM: geoDetails.distance_m ?? 0,
      geofencePass: geo.status !== "fail",
      clientTimestamp: new Date(body.capture.client_timestamp),
      serverReceivedAt: now,
      riskFlags: results.flatMap((r) => r.riskFlags ?? []),
      deleteAfter: new Date(now.getTime() + RETENTION_DAYS.precise_location * 86_400_000),
    });
  }

  // ---- outcome ----
  // 01 §4.17: with external review on (and no inline reviewer), a submission that passed every mechanical check
  // waits as CHECKING until the operator's reviewer (Claude Code) posts a verdict through applyReview.
  if (!firstFailure(results) && !app.reviewer && allDerived && (await externalReviewEnabled(tx))) {
    await appendAudit(tx, {
      verificationId,
      actorType: "system",
      actorRef: null,
      eventType: "evidence_check_completed",
      beforeState: "CHECKING",
      afterState: "CHECKING",
      correlationId: verificationId,
      metadata: { submission_id: submissionId, awaiting: "review" },
    });
    return {
      submission_id: submissionId,
      state: "CHECKING",
      reason_code: null,
      reason_message_ja: "AI が内容を確認しています。数分お待ちください。",
      retryable: false,
      attempts_remaining: LIMITS.attemptsPerClaim - attempts,
      claim_state: "ACTIVE",
      checks: checksMap(results),
    };
  }
  return finishSubmission(tx, app, { task, claimId: claim.id, submissionId, results, attempts, now });
}

const checksMap = (results: readonly CheckOutcome[]) =>
  Object.fromEntries([
    ...PRE_CHECKS.filter((t) => t === "task_nonce").map((t) => [t, "pass"]),
    ...results.map((r) => [r.type, r.status]),
  ]);

async function externalReviewEnabled(tx: Db): Promise<boolean> {
  const [row] = await tx
    .select()
    .from(schema.platformFlags)
    .where(eq(schema.platformFlags.key, "external_review_enabled"));
  return row?.value ?? false;
}

/** Decide the submission from its check results: VALID / INVALID, close or keep the claim, run consensus. */
async function finishSubmission(
  tx: Db,
  app: AppContext,
  o: {
    task: TaskRow;
    claimId: string;
    submissionId: string;
    results: CheckOutcome[];
    attempts: number;
    now: Date;
  },
): Promise<SubmitResponse> {
  const { task, submissionId, results, attempts, now } = o;
  const verificationId = task.id;
  const claim = { id: o.claimId };
  const failed = firstFailure(results);
  const valid = !failed;
  await tx
    .update(schema.witnessSubmissions)
    .set({
      state: valid ? "VALID" : "INVALID",
      firstFailedCheck: failed?.type ?? null,
      reasonCode: failed?.reasonCode ?? null,
      acceptedForConsensus: valid,
    })
    .where(eq(schema.witnessSubmissions.id, submissionId));

  const nonRetryable =
    failed?.reasonCode && (NON_RETRYABLE_REASONS as readonly string[]).includes(failed.reasonCode);
  const claimState = valid
    ? "ACCEPTED"
    : nonRetryable || attempts >= LIMITS.attemptsPerClaim
      ? "REJECTED"
      : "ACTIVE";
  if (claimState !== "ACTIVE") {
    await tx
      .update(schema.claims)
      .set({
        state: claimState,
        closedAt: now,
        closeReason: valid ? "VALID_SUBMISSION" : (failed?.reasonCode ?? "ATTEMPTS_EXHAUSTED"),
      })
      .where(eq(schema.claims.id, claim.id));
  }
  await appendAudit(tx, {
    verificationId,
    actorType: "system",
    actorRef: null,
    eventType: valid ? "witness_accepted" : "submission_rejected",
    beforeState: "CHECKING",
    afterState: valid ? "VALID" : "INVALID",
    correlationId: verificationId,
    metadata: {
      submission_id: submissionId,
      reason_code: failed?.reasonCode ?? null,
      check: failed?.type ?? null,
    },
  });

  if (valid) {
    const counts = await taskCounts(tx, task.id);
    if (counts.validCount === task.requiredWitnesses && task.challengeMinutes !== null) {
      // 13 §3: the answer is provisional; the task stays SUBMITTED until the challenge window closes.
      if (!task.provisionalAt) await markProvisional(tx, task, now);
    } else if (counts.validCount === task.requiredWitnesses) {
      await applyTaskEvent(tx, app, task, "QUORUM_READY", {
        actorType: "system",
        actorRef: null,
        correlationId: task.id,
      });
      await evaluateConsensus(tx, app, task);
    }
  }

  const checks = checksMap(results);
  const d = failed?.details as
    | { distance_m?: number; radius_m?: number; accuracy_m?: number; max_age_s?: number }
    | undefined;
  return {
    submission_id: submissionId,
    state: valid ? "VALID" : "INVALID",
    reason_code: failed?.reasonCode ?? null,
    reason_message_ja: failed?.reasonCode
      ? reasonMessage(failed.reasonCode, {
          d: d?.distance_m ?? "",
          r: d?.radius_m ?? task.radiusM ?? "",
          a: d?.accuracy_m ?? "",
          n: Math.round(task.freshnessMaxAgeS / 60),
          x: (failed.details as { reason?: string } | undefined)?.reason ?? "",
        })
      : null,
    retryable: claimState === "ACTIVE",
    attempts_remaining: claimState === "ACTIVE" ? LIMITS.attemptsPerClaim - attempts : 0,
    claim_state: claimState,
    checks,
  };
}

// ---------- outside AI review (01 §4.17) ----------

/** How long a submission waits for the outside reviewer before it is treated as unavailable (01 §4.17). */
export const REVIEW_WAIT_MAX_MS = 30 * 60_000;

export interface ReviewVerdict {
  /** "unavailable" is only set by the server when no verdict arrived in time (01 §4.16, §4.17). */
  verdict: "pass" | "fail" | "uncertain" | "unavailable";
  reason: string;
  observed: string;
  model: string;
}

/** Submissions held as CHECKING, oldest first, with short-lived URLs to the EXIF-free photos. */
export async function listPendingReviews(app: AppContext, limit = 20) {
  const rows = await app.db
    .select({ sub: schema.witnessSubmissions, task: schema.verificationRequests })
    .from(schema.witnessSubmissions)
    .innerJoin(
      schema.verificationRequests,
      eq(schema.verificationRequests.id, schema.witnessSubmissions.verificationId),
    )
    .where(eq(schema.witnessSubmissions.state, "CHECKING"))
    .orderBy(asc(schema.witnessSubmissions.serverReceivedAt))
    .limit(limit);
  const evidence = rows.length
    ? await app.db
        .select({
          submissionId: schema.evidenceObjects.submissionId,
          key: schema.evidenceObjects.derivedObjectKey,
        })
        .from(schema.evidenceObjects)
        .where(
          inArray(
            schema.evidenceObjects.submissionId,
            rows.map((r) => r.sub.id),
          ),
        )
        .orderBy(asc(schema.evidenceObjects.id)) // the order the worker sent them (monotonic IDs)
    : [];
  const out = [];
  for (const { sub, task } of rows) {
    const keys = evidence.filter((e) => e.submissionId === sub.id).map((e) => e.key);
    if (!keys.length || keys.some((k) => !k)) continue;
    const image_urls: string[] = [];
    for (const k of keys)
      image_urls.push(await app.storage.createSignedDownloadUrl("evidence-derived", k as string, 600));
    out.push({
      submission_id: sub.id,
      verification_id: task.id,
      type: task.type,
      question: task.question,
      /** What the requester will accept (01 §4.25). */
      acceptance_criteria: task.acceptanceCriteria ?? null,
      answer_schema: answerSchemaOf(
        task.answerKind,
        task.answerValues,
        task.answerSpec as Record<string, unknown> | null,
      ),
      answer: sub.answer,
      received_at: sub.serverReceivedAt.toISOString(),
      image_urls,
      /** First photo only. Kept while review-runners that read only this field are still running (01 §4.18). */
      image_url: image_urls[0],
    });
  }
  return { reviews: out };
}

/**
 * Submissions the outside reviewer has not answered within REVIEW_WAIT_MAX_MS pass with a warning, exactly as
 * when the Claude API is down (01 §4.16): a worker's finished job and a requester's deadline must not hang on
 * the operator's Mac being on. Called from tick before deadlines are handled.
 */
export async function releaseStaleReviews(app: AppContext): Promise<string[]> {
  const cutoff = new Date(app.now().getTime() - REVIEW_WAIT_MAX_MS);
  const stale = await app.db
    .select({ id: schema.witnessSubmissions.id })
    .from(schema.witnessSubmissions)
    .where(
      and(
        eq(schema.witnessSubmissions.state, "CHECKING"),
        lte(schema.witnessSubmissions.serverReceivedAt, cutoff),
      ),
    );
  const released: string[] = [];
  for (const { id } of stale) {
    try {
      await applyReview(app, id, {
        verdict: "unavailable",
        reason: "確認係から30分以内に判定が届かなかったため、内容の確認なしで受け付けました。",
        observed: "",
        model: "none",
      });
      released.push(id);
    } catch (e) {
      if (!(e instanceof ApiError && e.code === "SUBMISSION_NOT_PENDING")) throw e;
    }
  }
  return released;
}

/** Apply the outside reviewer's verdict to a CHECKING submission, then decide it like an inline review. */
export async function applyReview(app: AppContext, submissionId: string, v: ReviewVerdict) {
  return app.db.transaction(async (tx) => {
    const [sub] = await tx
      .select()
      .from(schema.witnessSubmissions)
      .where(eq(schema.witnessSubmissions.id, submissionId));
    if (sub?.state !== "CHECKING") throw new ApiError("SUBMISSION_NOT_PENDING");
    const task = await lockTask(tx, sub.verificationId);
    const [claim] = await tx.select().from(schema.claims).where(eq(schema.claims.id, sub.claimId));
    if (!claim) throw new ApiError("SUBMISSION_NOT_PENDING");
    const details = { verdict: v.verdict, reason: v.reason, observed: v.observed, model: v.model };
    const review: CheckOutcome =
      v.verdict === "fail"
        ? { type: "vision_consistency", status: "fail", reasonCode: "EVIDENCE_MISMATCH", details }
        : { type: "vision_consistency", status: v.verdict === "pass" ? "pass" : "warning", details };
    await tx
      .update(schema.evidenceChecks)
      .set({ status: review.status, reasonCode: review.reasonCode ?? null, machineDetails: details })
      .where(
        and(
          eq(schema.evidenceChecks.submissionId, sub.id),
          eq(schema.evidenceChecks.checkType, "vision_consistency"),
        ),
      );
    const stored = await tx
      .select()
      .from(schema.evidenceChecks)
      .where(eq(schema.evidenceChecks.submissionId, sub.id));
    const results: CheckOutcome[] = CHECK_ORDER.map((t) => {
      if (t === "vision_consistency") return review;
      const r = stored.find((c) => c.checkType === t);
      return { type: t, status: (r?.status ?? "not_run") as CheckOutcome["status"] };
    });
    // The task may have closed while the review was pending (deadline grace passed): record, do not count.
    if (!["CLAIMED", "SUBMITTED"].includes(task.status)) {
      await tx
        .update(schema.witnessSubmissions)
        .set({ state: "INVALID", firstFailedCheck: "task_window" })
        .where(eq(schema.witnessSubmissions.id, sub.id));
      return { submission_id: sub.id, state: "INVALID" as const, applied: false };
    }
    const r = await finishSubmission(tx, app, {
      task,
      claimId: claim.id,
      submissionId: sub.id,
      results,
      attempts: claim.attempts,
      now: app.now(),
    });
    return { submission_id: sub.id, state: r.state, applied: true };
  });
}

/** 13 §3: record when an optimistic answer became provisional, and tell the requester. */
async function markProvisional(tx: Db, task: TaskRow, now: Date): Promise<void> {
  await tx
    .update(schema.verificationRequests)
    .set({ provisionalAt: now, updatedAt: now })
    .where(eq(schema.verificationRequests.id, task.id));
  task.provisionalAt = now;
  await appendAudit(tx, {
    verificationId: task.id,
    actorType: "system",
    actorRef: null,
    eventType: "operator_action",
    beforeState: null,
    afterState: null,
    correlationId: task.id,
    metadata: { action: "provisional", challenge_minutes: task.challengeMinutes },
  });
  if (task.callbackEndpointId) {
    await enqueueJob(tx, "DELIVER_WEBHOOK", `verification.provisional:${task.id}`, {
      verification_id: task.id,
      endpoint_id: task.callbackEndpointId,
      event: "verification.provisional",
    });
  }
}
