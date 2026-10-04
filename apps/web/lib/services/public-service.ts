import "server-only";
// Public result (05 §4), worker payouts (05 §3.7), requester evidence URLs (05 §2.5).

import { ApiError, LIMITS, parseId } from "@proofmarket/core";
import { schema } from "@proofmarket/db";
import { and, asc, desc, eq, isNotNull } from "drizzle-orm";
import type { RequesterAuth } from "../auth/requester";
import type { AppContext } from "../context";
import { witnessRef } from "./crypto";
import { buildResult, type SettleRecipients } from "./views";

/** Public-safe result only: no question, location, evidence URLs or per-submission data. No listing endpoint. */
export async function publicResult(app: AppContext, rawId: string) {
  const id = parseId("verification", rawId);
  if (!id) throw new ApiError("VERIFICATION_NOT_FOUND");
  const [task] = await app.db
    .select()
    .from(schema.verificationRequests)
    .where(eq(schema.verificationRequests.id, id));
  if (!task) throw new ApiError("VERIFICATION_NOT_FOUND");
  const result = await buildResult(app.db, task);
  if (!result) throw new ApiError("VERIFICATION_NOT_FOUND", { reason: "no_result_yet" });
  const { rejected_submissions: _omit, ...pub } = result;
  return pub;
}

/**
 * Results the operator featured on the top page (05 §4), newest first. Same public-safe fields as above,
 * narrowed further. Read by the page on the server; there is no listing endpoint.
 */
export async function featuredResults(app: AppContext, limit = 6) {
  const tasks = await app.db
    .select()
    .from(schema.verificationRequests)
    .where(isNotNull(schema.verificationRequests.featuredAt))
    .orderBy(desc(schema.verificationRequests.featuredAt))
    .limit(limit);
  const out = [];
  for (const task of tasks) {
    const r = await buildResult(app.db, task);
    if (!r) continue;
    out.push({
      verification_id: r.verification_id,
      status: r.status,
      answer: r.answer,
      witnesses: r.witnesses,
      consensus_ratio: r.consensus_ratio,
      verified_at: r.verified_at,
      settlement_status: r.settlement.status,
      explorer_url: r.attestation?.explorer_url ?? null,
    });
  }
  return out;
}

export async function workerPayouts(app: AppContext, workerId: string) {
  const rows = await app.db
    .select({ p: schema.paymentRecords })
    .from(schema.paymentRecords)
    .where(eq(schema.paymentRecords.kind, "FINALIZE_AND_SETTLE"));
  const payouts = [];
  for (const { p } of rows) {
    const info = p.recipients as SettleRecipients | null;
    const mine = info?.paid.find((x) => x.worker_id === workerId);
    if (!mine) continue;
    payouts.push({
      verification_id: p.verificationId,
      amount: mine.amount,
      asset: "USDC" as const,
      status:
        p.status === "CONFIRMED"
          ? ("SETTLED" as const)
          : p.status === "FAILED"
            ? ("FAILED_RETRYING" as const)
            : ("PENDING" as const),
      explorer_url:
        p.status === "CONFIRMED" && p.lastSignature
          ? `https://explorer.solana.com/tx/${p.lastSignature}?cluster=devnet`
          : null,
      paid_at: p.confirmedAt?.toISOString() ?? null,
    });
  }
  // Valid submissions whose settlement record does not exist yet are shown as PENDING.
  const valid = await app.db
    .select({ v: schema.witnessSubmissions.verificationId, amount: schema.verificationRequests.bountyAmount })
    .from(schema.witnessSubmissions)
    .innerJoin(
      schema.verificationRequests,
      eq(schema.verificationRequests.id, schema.witnessSubmissions.verificationId),
    )
    .where(
      and(eq(schema.witnessSubmissions.workerId, workerId), eq(schema.witnessSubmissions.state, "VALID")),
    );
  for (const v of valid) {
    if (payouts.some((p) => p.verification_id === v.v)) continue;
    payouts.push({
      verification_id: v.v,
      amount: String(Number(v.amount)),
      asset: "USDC" as const,
      status: "PENDING" as const,
      explorer_url: null,
      paid_at: null,
    });
  }
  return { payouts };
}

export async function evidenceUrls(app: AppContext, auth: RequesterAuth, rawId: string) {
  const id = parseId("verification", rawId);
  if (!id) throw new ApiError("VERIFICATION_NOT_FOUND");
  const [task] = await app.db
    .select()
    .from(schema.verificationRequests)
    .where(
      and(
        eq(schema.verificationRequests.id, id),
        eq(schema.verificationRequests.credentialId, auth.credentialId),
      ),
    );
  if (!task) throw new ApiError("VERIFICATION_NOT_FOUND");
  const [flag] = await app.db
    .select()
    .from(schema.platformFlags)
    .where(eq(schema.platformFlags.key, "public_evidence_enabled"));
  if (task.evidenceAccessRevoked || flag?.value === false) throw new ApiError("EVIDENCE_ACCESS_REVOKED");
  const rows = await app.db
    .select({ e: schema.evidenceObjects, workerId: schema.witnessSubmissions.workerId })
    .from(schema.evidenceObjects)
    .innerJoin(
      schema.witnessSubmissions,
      eq(schema.witnessSubmissions.id, schema.evidenceObjects.submissionId),
    )
    .where(
      and(eq(schema.witnessSubmissions.verificationId, id), eq(schema.witnessSubmissions.state, "VALID")),
    )
    .orderBy(asc(schema.evidenceObjects.submissionId), asc(schema.evidenceObjects.id)); // a witness's photos together, in order
  const evidence = [];
  for (const r of rows) {
    if (!r.e.derivedObjectKey) continue; // purged after retention
    evidence.push({
      witness_ref: witnessRef(app.config.workerRefSalt, r.workerId, id),
      url: await app.storage.createSignedDownloadUrl(
        "evidence-derived",
        r.e.derivedObjectKey,
        LIMITS.evidenceUrlTtlS,
      ),
      expires_in_seconds: LIMITS.evidenceUrlTtlS,
    });
  }
  return { evidence };
}
