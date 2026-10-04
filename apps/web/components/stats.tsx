// Track-record blocks shared by /stats and the top page (05 §4.1). Server components only.
import type { PublicStats } from "@proofmarket/core/schemas/api";
import Link from "next/link";
import { appContext } from "@/lib/context";
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

export function duration(seconds: number | null): string {
  if (seconds === null) return "—";
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
export async function StatsHighlights() {
  const s = await loadStats();
  if (!s || s.verifications.completed === 0) return null;
  return (
    <Section title="実績" lead="試験運用の数字です。データベースから集計し、1分ごとに更新しています。">
      <div className="grid gap-4 sm:grid-cols-3">
        <BigNumber value={`${s.verifications.completed}件`} label="人の手で確かめて完了した依頼" />
        <BigNumber
          value={usdc(s.paid_to_workers.amount)}
          label="worker に支払った報酬"
          note="Solana Devnet"
        />
        <BigNumber value={duration(s.median_seconds_to_result)} label="依頼から結果までの中央値" />
      </div>
      <p className="mt-4 text-sm">
        <Link href="/stats" className="font-semibold text-teal-700 underline">
          実績の詳しい内訳を見る →
        </Link>
      </p>
    </Section>
  );
}
