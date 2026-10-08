// Track-record blocks shared by /stats and the top page (05 §4.1). Server components only.
import type { PublicStats } from "@proofmarket/core/schemas/api";
import Link from "next/link";
import { appContext } from "@/lib/context";
import { type Lang, langHref, pick } from "@/lib/lang";
import { cachedPublicStats } from "@/lib/services/stats-service";
import { Section } from "./site";

/** Null when the DB cannot be read: callers hide the block instead of failing the page. */
export async function loadStats(): Promise<PublicStats | null> {
  try {
    return await cachedPublicStats(appContext());
  } catch (e) {
    console.error("public stats unavailable", e);
    return null;
  }
}

export function duration(seconds: number | null, lang: Lang = "ja"): string {
  if (seconds === null) return "—";
  if (lang === "en") {
    if (seconds < 60) return `${seconds} s`;
    const m = Math.round(seconds / 60);
    if (m < 60) return `${m} min`;
    const h = Math.floor(m / 60);
    return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
  }
  if (seconds < 60) return `${seconds}秒`;
  const m = Math.round(seconds / 60);
  if (m < 60) return `${m}分`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}時間${m % 60}分` : `${h}時間`;
}

export const usdc = (amount: string) => `${amount} USDC`;

export function BigNumber({ value, label, note }: { value: string; label: string; note?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-5">
      <p className="text-3xl font-bold tracking-tight text-slate-900">{value}</p>
      <p className="mt-1 text-sm font-semibold text-slate-700">{label}</p>
      {note ? <p className="mt-1 text-xs text-slate-500">{note}</p> : null}
    </div>
  );
}

/** Top page: three numbers and a link. Hidden while nothing has been completed or the DB is down. */
export async function StatsHighlights({ lang = "ja" }: { lang?: Lang }) {
  const s = await loadStats();
  if (!s || s.verifications.completed === 0) return null;
  return (
    <Section
      title={pick(lang, "実績", "Track record")}
      lead={pick(
        lang,
        "試験運用の数字です。データベースから集計し、1分ごとに更新しています。",
        "Numbers from the pilot, aggregated from the database and refreshed every minute.",
      )}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <BigNumber
          value={pick(lang, `${s.verifications.completed}件`, String(s.verifications.completed))}
          label={pick(lang, "人の手で確かめて完了した依頼", "requests completed by people")}
        />
        <BigNumber
          value={usdc(s.paid_to_workers.amount)}
          label={pick(lang, "worker に支払った報酬", "paid to workers")}
          note="Solana Devnet"
        />
        <BigNumber
          value={duration(s.median_seconds_to_result, lang)}
          label={pick(lang, "依頼から結果までの中央値", "median time from request to result")}
        />
      </div>
      <p className="mt-4 text-sm">
        <Link href={langHref(lang, "/stats")} className="font-semibold text-teal-700 underline">
          {pick(lang, "実績の詳しい内訳を見る →", "See the full breakdown →")}
        </Link>
      </p>
    </Section>
  );
}
