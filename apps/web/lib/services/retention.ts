import "server-only";
// Retention (04 §4): raw/derived photos, EXIF and precise location are removed after 30 days.
// Hashes (sha256, dHash) stay so replay protection keeps working after the files are gone.
// The same daily job also drops bookkeeping rows that only grow: rate-limit windows, idempotency keys past their
// retention, and expired OAuth codes and tokens.

import { LIMITS } from "@proofmarket/core";
import { type Db, schema } from "@proofmarket/db";
import { and, inArray, isNotNull, isNull, lt, lte } from "drizzle-orm";
import type { AppContext } from "../context";
import { appendAudit } from "./audit";
import { purgeExpiredParticipation } from "./participation-service";
import { purgeExpiredRemoval } from "./removal-service";

export async function purgeExpiredEvidence(
  app: AppContext,
  batch = 200,
): Promise<{
  evidence: number;
  locations: number;
  participation: number;
  removal: number;
  housekeeping: Housekeeping;
}> {
  const now = app.now();
  const due = await app.db
    .select()
    .from(schema.evidenceObjects)
    .where(and(lte(schema.evidenceObjects.deleteAfter, now), isNull(schema.evidenceObjects.deletedAt)))
    .limit(batch);
  const raw = due.map((e) => e.rawObjectKey).filter((k): k is string => !!k);
  const derived = due.map((e) => e.derivedObjectKey).filter((k): k is string => !!k);
  await app.storage.remove("evidence-raw", raw);
  await app.storage.remove("evidence-derived", derived);
  if (due.length) {
    await app.db
      .update(schema.evidenceObjects)
      .set({ rawObjectKey: null, derivedObjectKey: null, rawMetadataEnc: null, deletedAt: now })
      .where(
        inArray(
          schema.evidenceObjects.id,
          due.map((e) => e.id),
        ),
      );
  }
  const locs = await app.db
    .update(schema.locationObservations)
    .set({ coordsEnc: null })
    .where(
      and(
        lte(schema.locationObservations.deleteAfter, now),
        isNotNull(schema.locationObservations.coordsEnc),
      ),
    )
    .returning({ id: schema.locationObservations.submissionId });
  const participation = await purgeExpiredParticipation(app);
  const removal = await purgeExpiredRemoval(app);
  const housekeeping = await purgeBookkeeping(app.db, now);
  await appendAudit(app.db, {
    verificationId: null,
    actorType: "system",
    actorRef: null,
    eventType: "operator_action",
    beforeState: null,
    afterState: null,
    correlationId: `purge:${now.toISOString().slice(0, 10)}`,
    metadata: {
      action: "purge_evidence",
      evidence: due.length,
      locations: locs.length,
      participation,
      removal,
      housekeeping,
    },
  });
  return { evidence: due.length, locations: locs.length, participation, removal, housekeeping };
}

type Housekeeping = { rateLimits: number; idempotency: number; oauthCodes: number; oauthTokens: number };

const DAY_MS = 86_400_000;

/** Rows nobody reads again. Day windows (01 §4.28) are kept two days so today's count is never touched. */
export async function purgeBookkeeping(db: Db, now: Date): Promise<Housekeeping> {
  const rateLimits = await db
    .delete(schema.rateLimitCounters)
    .where(lt(schema.rateLimitCounters.windowStart, new Date(now.getTime() - 2 * DAY_MS)))
    .returning({ s: schema.rateLimitCounters.scope });
  const idempotency = await db
    .delete(schema.idempotencyKeys)
    .where(
      lt(
        schema.idempotencyKeys.createdAt,
        new Date(now.getTime() - LIMITS.idempotencyRetentionH * 3_600_000),
      ),
    )
    .returning({ s: schema.idempotencyKeys.scope });
  const expired = new Date(now.getTime() - DAY_MS);
  const oauthCodes = await db
    .delete(schema.oauthCodes)
    .where(lt(schema.oauthCodes.expiresAt, expired))
    .returning({ c: schema.oauthCodes.clientId });
  const oauthTokens = await db
    .delete(schema.oauthTokens)
    .where(lt(schema.oauthTokens.expiresAt, expired))
    .returning({ c: schema.oauthTokens.clientId });
  return {
    rateLimits: rateLimits.length,
    idempotency: idempotency.length,
    oauthCodes: oauthCodes.length,
    oauthTokens: oauthTokens.length,
  };
}
