import "server-only";
// Evidence submission (05 §3.6, 07 §3). Pre-checks -> HTTP errors (nothing recorded, attempt not consumed).
// After pre-checks the submission is recorded and checks run in CHECK_ORDER; the outcome is a 200 body.

import {
  ApiError,
  CHECK_ORDER,
  type CheckOutcome,
  type CheckReasonCode,
  checkDuplicate,
  checkFreshness,
  checkGeofence,
  checkMediaSchema,
  checkReplay,
  firstFailure,
  LIMITS,
  NON_RETRYABLE_REASONS,
  newId,
  PRE_CHECKS,
  RETENTION_DAYS,
  runChecks,
} from "@proofmarket/core";
import type { SubmitEvidenceRequest } from "@proofmarket/core/schemas/api";
import { constraintName, type Db, pgErrorCode, schema } from "@proofmarket/db";
import { and, eq, gte, isNotNull, ne } from "drizzle-orm";
import sharp from "sharp";
import type { AppContext } from "../context";
import { appendAudit } from "./audit";
import { encryptBytes, encryptLocation, sha256 } from "./crypto";
import { reasonMessage } from "./messages";
import { applyTaskEvent, taskCounts } from "./task-engine";
import { evaluateConsensus } from "./verification-service";
import { lockOwnClaim } from "./worker-service";

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
  state: "VALID" | "INVALID";
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
  const uploadId = body.evidence[0]?.object_ref;
  const [upload] = uploadId
    ? await tx.select().from(schema.uploads).where(eq(schema.uploads.id, uploadId))
    : [];
  if (!upload || upload.claimId !== claim.id || upload.state !== "PENDING")
    throw new ApiError("UPLOAD_NOT_FOUND");
  if (upload.challengeId !== ch.id) throw new ApiError("NONCE_INVALID");
  if (!task.answerValues.includes(body.answer)) throw new ApiError("ANSWER_INVALID");

  // ---- record the submission ----
  const submissionId = newId("submission");
  await tx
    .update(schema.challenges)
    .set({ state: "USED", usedAt: now })
    .where(eq(schema.challenges.id, ch.id));
  await tx.update(schema.uploads).set({ state: "FINALIZED" }).where(eq(schema.uploads.id, upload.id));
  const attempts = claim.attempts + 1;
  await tx.update(schema.claims).set({ attempts }).where(eq(schema.claims.id, claim.id));
  await tx.insert(schema.witnessSubmissions).values({
    id: submissionId,
    verificationId,
    claimId: claim.id,
    workerId,
    challengeId: ch.id,
    answer: body.answer,
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

  // ---- read + hash + derive (07 §3.1) ----
  const obj = await app.storage.read(upload.objectKey);
  const img = obj ? await processImage(obj.bytes) : null;
  const deleteAfter = new Date(now.getTime() + RETENTION_DAYS.raw_evidence * 86_400_000);
  let replayConflict = false;
  if (img) {
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
      if (pgErrorCode(e) === "23505" && constraintName(e)?.includes("evidence_sha256")) replayConflict = true;
      else throw e;
    }
  }

  // ---- duplicate candidates (P1): other claims' photos in the last 90 days ----
  const candidates =
    img?.dhash != null
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

  const target = { lat: task.targetLat, lng: task.targetLng, radiusM: task.radiusM };
  const observed = { lat: body.capture.lat, lng: body.capture.lng, accuracyM: body.capture.accuracy_m };
  const geo = checkGeofence({ target, observed });
  const results: CheckOutcome[] = runChecks(CHECK_ORDER, [
    () =>
      checkMediaSchema({
        declaredContentType: "image/jpeg",
        byteSize: obj?.bytes.length ?? 0,
        magicBytes: img?.magic ?? new Uint8Array(),
        decoded: img?.decoded ?? null,
      }),
    () => checkReplay(replayConflict),
    () =>
      checkFreshness({
        now,
        challengeIssuedAt: ch.issuedAt,
        storageObjectCreatedAt: obj?.createdAt ?? new Date(0),
        clientTimestamp: new Date(body.capture.client_timestamp),
        freshnessMaxAgeS: task.freshnessMaxAgeS,
      }),
    () => geo,
    () =>
      img?.dhash != null
        ? checkDuplicate({
            dhash: img.dhash,
            candidates: candidates.map((c) => ({ submissionId: c.submissionId, dhash: c.dhash ?? 0n })),
          })
        : { type: "duplicate", status: "not_run" },
    () => ({ type: "vision_consistency", status: "not_run" }),
  ]);

  // A replayed file has no evidence row (unique sha256), so nothing would ever purge it: delete it now.
  if (replayConflict) await app.storage.remove("evidence-raw", [upload.objectKey]);
  // Derived image only for decodable, non-replayed photos.
  if (img?.derived && !replayConflict) await app.storage.putDerived(upload.objectKey, img.derived);

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
  await tx.insert(schema.locationObservations).values({
    submissionId,
    coordsEnc: encryptLocation(app.config.locationEncKey, body.capture.lat, body.capture.lng),
    accuracyM: body.capture.accuracy_m,
    distanceToTargetM: geoDetails.distance_m ?? 0,
    geofencePass: geo.status === "pass",
    clientTimestamp: new Date(body.capture.client_timestamp),
    serverReceivedAt: now,
    riskFlags: results.flatMap((r) => r.riskFlags ?? []),
    deleteAfter: new Date(now.getTime() + RETENTION_DAYS.precise_location * 86_400_000),
  });

  // ---- outcome ----
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
    if (counts.validCount === task.requiredWitnesses) {
      await applyTaskEvent(tx, app, task, "QUORUM_READY", {
        actorType: "system",
        actorRef: null,
        correlationId: task.id,
      });
      await evaluateConsensus(tx, app, task);
    }
  }

  const checks = Object.fromEntries([
    ...PRE_CHECKS.filter((t) => t === "task_nonce").map((t) => [t, "pass"]),
    ...results.map((r) => [r.type, r.status]),
  ]);
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
          r: d?.radius_m ?? task.radiusM,
          a: d?.accuracy_m ?? "",
          n: Math.round(task.freshnessMaxAgeS / 60),
        })
      : null,
    retryable: claimState === "ACTIVE",
    attempts_remaining: claimState === "ACTIVE" ? LIMITS.attemptsPerClaim - attempts : 0,
    claim_state: claimState,
    checks,
  };
}
