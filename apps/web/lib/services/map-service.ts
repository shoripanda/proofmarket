import "server-only";
// Public map (01 §4.22): VERIFIED results whose requester asked for them to be published, for 72 hours.
// Reads the question, the requested place and the answer; never photos, workers or where a worker stood.

import { LIMITS, type TaskType } from "@proofmarket/core";
import type { PublicDataset, PublicMap } from "@proofmarket/core/schemas/api";
import { schema } from "@proofmarket/db";
import { and, desc, eq, gt } from "drizzle-orm";
import type { AppContext } from "../context";
import { proofLinks } from "../proof";

export async function publicMap(app: AppContext): Promise<PublicMap> {
  const vr = schema.verificationRequests;
  const res = schema.verificationResults;
  const now = app.now();
  const since = new Date(now.getTime() - LIMITS.publicMap.maxAgeHours * 3600_000);
  const rows = await app.db
    .select({ task: vr, res, placeName: schema.places.name })
    .from(vr)
    .innerJoin(res, eq(res.verificationId, vr.id))
    .leftJoin(schema.places, eq(schema.places.id, vr.placeId))
    .where(
      and(
        eq(vr.publishResult, true),
        eq(vr.evidenceAccessRevoked, false),
        eq(res.outcome, "VERIFIED"),
        gt(res.finalizedAt, since),
      ),
    )
    .orderBy(desc(res.finalizedAt))
    .limit(LIMITS.publicMap.maxItems * 5);

  // Newest first, so the first row seen for a place and question is the one to keep.
  const seen = new Set<string>();
  const items: PublicMap["items"] = [];
  for (const { task, res: r, placeName } of rows) {
    if (task.targetLat === null || task.targetLng === null || r.finalAnswer === null) continue;
    if (task.answerKind !== "enum" && task.answerKind !== "number") continue;
    const key = `${task.type}|${task.targetLat}|${task.targetLng}|${task.question}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      verification_id: task.id as PublicMap["items"][number]["verification_id"],
      type: task.type as TaskType,
      question: task.question,
      answer: r.finalAnswer,
      answer_kind: task.answerKind,
      unit: (task.answerSpec as { unit?: string } | null)?.unit ?? null,
      location: { lat: task.targetLat, lng: task.targetLng },
      place_name: placeName ?? null,
      witnesses: r.validWitnessCount,
      verified_at: r.finalizedAt.toISOString(),
      result_url: `/r/${task.id}`,
    });
    if (items.length >= LIMITS.publicMap.maxItems) break;
  }
  return { generated_at: now.toISOString(), max_age_hours: LIMITS.publicMap.maxAgeHours, items };
}

const explorer = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
const hex = (b: Buffer | Uint8Array) => Buffer.from(b).toString("hex");

/**
 * Open dataset (01 §4.24): every published VERIFIED result, newest first, no time window, with the hashes and
 * the Solana transaction so a reader can check each row. Same exclusions as the map.
 */
export async function publicDataset(app: AppContext, limit = 1000): Promise<PublicDataset> {
  const vr = schema.verificationRequests;
  const res = schema.verificationResults;
  const pay = schema.paymentRecords;
  const rows = await app.db
    .select({ task: vr, res, placeName: schema.places.name, sig: pay.lastSignature, payStatus: pay.status })
    .from(vr)
    .innerJoin(res, eq(res.verificationId, vr.id))
    .leftJoin(schema.places, eq(schema.places.id, vr.placeId))
    .leftJoin(pay, and(eq(pay.verificationId, vr.id), eq(pay.kind, "FINALIZE_AND_SETTLE")))
    .where(and(eq(vr.publishResult, true), eq(vr.evidenceAccessRevoked, false), eq(res.outcome, "VERIFIED")))
    .orderBy(desc(res.finalizedAt))
    .limit(limit);
  const out: PublicDataset["rows"] = [];
  for (const { task, res: r, placeName, sig, payStatus } of rows) {
    if (task.targetLat === null || task.targetLng === null || r.finalAnswer === null) continue;
    if (task.answerKind !== "enum" && task.answerKind !== "number") continue;
    out.push({
      verification_id: task.id as PublicDataset["rows"][number]["verification_id"],
      type: task.type as TaskType,
      question: task.question,
      answer: r.finalAnswer,
      answer_kind: task.answerKind,
      unit: (task.answerSpec as { unit?: string } | null)?.unit ?? null,
      location: { lat: task.targetLat, lng: task.targetLng },
      place_name: placeName ?? null,
      witnesses: r.validWitnessCount,
      verified_at: r.finalizedAt.toISOString(),
      evidence_root: hex(r.evidenceRoot),
      result_hash: hex(r.resultHash),
      attestation:
        payStatus === "CONFIRMED" && sig
          ? { network: "solana-devnet", signature: sig, explorer_url: explorer(sig) }
          : null,
      proof_url: proofLinks(task.id).url,
    });
  }
  return {
    generated_at: app.now().toISOString(),
    license: "CC-BY-4.0",
    attribution:
      "ProofMarket (https://proofmarket.fun) — human-verified real-world observations; cite the proof_url of each row",
    count: out.length,
    rows: out,
  };
}

const TTL_MS = 60_000;
let cached: { at: number; value: Promise<PublicMap> } | null = null;
let cachedData: { at: number; value: Promise<PublicDataset> } | null = null;

/** publicDataset memoised for a minute per server instance. */
export function cachedPublicDataset(app: AppContext): Promise<PublicDataset> {
  const t = Date.now();
  if (!cachedData || t - cachedData.at > TTL_MS) {
    const value = publicDataset(app);
    cachedData = { at: t, value };
    value.catch(() => {
      if (cachedData?.value === value) cachedData = null;
    });
  }
  return cachedData.value;
}

/** publicMap memoised for a minute per server instance: the page and the API are read by anyone. */
export function cachedPublicMap(app: AppContext): Promise<PublicMap> {
  const t = Date.now();
  if (!cached || t - cached.at > TTL_MS) {
    const value = publicMap(app);
    cached = { at: t, value };
    value.catch(() => {
      if (cached?.value === value) cached = null;
    });
  }
  return cached.value;
}
