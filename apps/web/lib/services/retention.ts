import "server-only";
// Retention (04 §4): raw/derived photos, EXIF and precise location are removed after 30 days.
// Hashes (sha256, dHash) stay so replay protection keeps working after the files are gone.

import { schema } from "@proofmarket/db";
import { and, inArray, isNotNull, isNull, lte } from "drizzle-orm";
import type { AppContext } from "../context";
import { appendAudit } from "./audit";
import { purgeExpiredParticipation } from "./participation-service";

export async function purgeExpiredEvidence(
  app: AppContext,
  batch = 200,
): Promise<{ evidence: number; locations: number; participation: number }> {
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
    },
  });
  return { evidence: due.length, locations: locs.length, participation };
}
