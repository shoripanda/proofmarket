import "server-only";
// Public track record (05 §4.1): aggregates for /stats and GET /v1/public/stats.
// Never reads question, answer, location, worker IDs or payout addresses into the output.

import { fromMicro, type TaskType, toMicro } from "@proofmarket/core";
import type { PublicStats } from "@proofmarket/core/schemas/api";
import { schema } from "@proofmarket/db";
import { and, count, countDistinct, desc, eq, isNotNull } from "drizzle-orm";
import type { AppContext } from "../context";
import type { SettleRecipients } from "./views";

const COMPLETED = ["VERIFIED", "SETTLED"];
const DAYS = 14;
const RECENT = 10;
const JST_MS = 9 * 3600_000;
const explorer = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;
const jstDate = (d: Date) => new Date(d.getTime() + JST_MS).toISOString().slice(0, 10);

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return Math.round(s.length % 2 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2);
}

export async function publicStats(app: AppContext): Promise<PublicStats> {
  const db = app.db;
  const vr = schema.verificationRequests;
  const now = app.now();

  const byTypeRows = await db
    .select({ type: vr.type, status: vr.status, n: count() })
    .from(vr)
    .groupBy(vr.type, vr.status);
  const types = new Map<string, { total: number; completed: number }>();
  for (const r of byTypeRows) {
    const e = types.get(r.type) ?? { total: 0, completed: 0 };
    e.total += Number(r.n);
    if (COMPLETED.includes(r.status)) e.completed += Number(r.n);
    types.set(r.type, e);
  }
  const byType = [...types]
    .map(([type, e]) => ({ type: type as TaskType, ...e }))
    .sort((a, b) => b.total - a.total || a.type.localeCompare(b.type));

  const [workers] = await db
    .select({ n: countDistinct(schema.witnessSubmissions.workerId) })
    .from(schema.witnessSubmissions)
    .where(eq(schema.witnessSubmissions.state, "VALID"));
  const [requesters] = await db.select({ n: countDistinct(vr.principalId) }).from(vr);

  const reviewRows = await db
    .select({ status: schema.evidenceChecks.status, n: count() })
    .from(schema.evidenceChecks)
    .where(eq(schema.evidenceChecks.checkType, "vision_consistency"))
    .groupBy(schema.evidenceChecks.status);
  const reviews = (s: string) => Number(reviewRows.find((r) => r.status === s)?.n ?? 0);

  // Time to result and the daily chart use the result rows of VERIFIED outcomes.
  const verified = await db
    .select({ created: vr.createdAt, finalized: schema.verificationResults.finalizedAt })
    .from(schema.verificationResults)
    .innerJoin(vr, eq(vr.id, schema.verificationResults.verificationId))
    .where(eq(schema.verificationResults.outcome, "VERIFIED"));
  const durations = verified.map((r) => Math.max(0, (r.finalized.getTime() - r.created.getTime()) / 1000));
  const days = Array.from({ length: DAYS }, (_, i) =>
    jstDate(new Date(now.getTime() - (DAYS - 1 - i) * 86_400_000)),
  );
  const perDay = new Map(days.map((d) => [d, 0]));
  for (const r of verified) {
    const d = jstDate(r.finalized);
    if (perDay.has(d)) perDay.set(d, (perDay.get(d) ?? 0) + 1);
  }

  // Confirmed settlements: the USDC that actually reached workers, and the newest ones as links.
  const settled = await db
    .select({ recipients: schema.paymentRecords.recipients })
    .from(schema.paymentRecords)
    .where(
      and(
        eq(schema.paymentRecords.kind, "FINALIZE_AND_SETTLE"),
        eq(schema.paymentRecords.status, "CONFIRMED"),
      ),
    );
  let paid = 0n;
  for (const s of settled) {
    for (const p of (s.recipients as SettleRecipients | null)?.paid ?? []) paid += toMicro(p.amount);
  }

  const recent = await db
    .select({
      id: vr.id,
      type: vr.type,
      featuredAt: vr.featuredAt,
      sig: schema.paymentRecords.lastSignature,
      finalized: schema.verificationResults.finalizedAt,
      witnesses: schema.verificationResults.validWitnessCount,
    })
    .from(schema.paymentRecords)
    .innerJoin(vr, eq(vr.id, schema.paymentRecords.verificationId))
    .innerJoin(schema.verificationResults, eq(schema.verificationResults.verificationId, vr.id))
    .where(
      and(
        eq(schema.paymentRecords.kind, "FINALIZE_AND_SETTLE"),
        eq(schema.paymentRecords.status, "CONFIRMED"),
        isNotNull(schema.paymentRecords.lastSignature),
        isNotNull(schema.paymentRecords.confirmedAt),
      ),
    )
    .orderBy(desc(schema.paymentRecords.confirmedAt), desc(schema.verificationResults.finalizedAt))
    .limit(RECENT);

  const completed = byType.reduce((a, t) => a + t.completed, 0);
  return {
    generated_at: now.toISOString(),
    verifications: { total: byType.reduce((a, t) => a + t.total, 0), completed },
    workers_with_valid_submission: Number(workers?.n ?? 0),
    requesters: Number(requesters?.n ?? 0),
    paid_to_workers: { asset: "USDC", amount: fromMicro(paid), network: "solana-devnet" },
    median_seconds_to_result: median(durations),
    ai_review: { pass: reviews("pass"), fail: reviews("fail"), uncertain: reviews("warning") },
    by_type: byType,
    daily_completed: days.map((date) => ({ date, count: perDay.get(date) ?? 0 })),
    // A result page is linked only for results the operator featured (05 §4): IDs are not listed otherwise.
    recent_results: recent.map((r) => ({
      type: r.type as TaskType,
      finalized_at: r.finalized.toISOString(),
      witnesses: r.witnesses,
      explorer_url: explorer(r.sig as string),
      result_url: r.featuredAt ? `/r/${r.id}` : null,
    })),
  };
}

const TTL_MS = 60_000;
let cached: { at: number; value: Promise<PublicStats> } | null = null;

/** publicStats memoised for a minute per server instance: the page and the API are read by anyone. */
export function cachedPublicStats(app: AppContext): Promise<PublicStats> {
  const t = Date.now();
  if (!cached || t - cached.at > TTL_MS) {
    const value = publicStats(app);
    cached = { at: t, value };
    // A failed read must not stay cached for a minute.
    value.catch(() => {
      if (cached?.value === value) cached = null;
    });
  }
  return cached.value;
}
