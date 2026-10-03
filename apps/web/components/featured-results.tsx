// S-01 「最近の判定結果」 — results the operator featured (05 §4). Hidden when there are none or the DB is down.
import Link from "next/link";
import { appContext } from "@/lib/context";
import { featuredResults } from "@/lib/services/public-service";
import { Section } from "./site";

const SETTLEMENT_JA: Record<string, string> = {
  PENDING: "支払い待ち",
  SUBMITTED: "支払い処理中",
  SETTLED: "支払い済み",
  REFUNDED: "返金済み",
  FAILED_RETRYING: "支払いを再試行中",
};

function ago(iso: string, now: number) {
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (m < 60) return `${m}分前`;
  if (m < 60 * 24) return `${Math.floor(m / 60)}時間前`;
  return `${Math.floor(m / 1440)}日前`;
}

export async function FeaturedResults() {
  let items: Awaited<ReturnType<typeof featuredResults>> = [];
  try {
    items = await featuredResults(appContext());
  } catch (e) {
    console.error("featured results unavailable", e);
    return null;
  }
  if (!items.length) return null;
  const now = Date.now();
  return (
    <Section
      title="最近の判定結果"
      lead="運営者が選んで掲載している実際の結果です。質問文、場所、写真、確かめた人の情報は載せていません。"
    >
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((r) => (
          <li key={r.verification_id} className="rounded-2xl border border-slate-200 p-5">
            <p className="text-2xl font-bold">
              {r.answer ?? r.status}
              <span className="ml-2 text-sm font-medium text-slate-500">{r.status}</span>
            </p>
            <p className="mt-2 text-sm text-slate-600">
              {r.witnesses.required}人中{r.witnesses.valid}人が確認
              {r.consensus_ratio !== null ? `・一致率 ${Math.round(r.consensus_ratio * 100)}%` : ""}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {ago(r.verified_at, now)}・{SETTLEMENT_JA[r.settlement_status] ?? r.settlement_status}
            </p>
            <div className="mt-3 flex gap-4 text-sm">
              <Link href={`/r/${r.verification_id}`} className="font-semibold text-teal-700 underline">
                結果ページ
              </Link>
              {r.explorer_url ? (
                <a href={r.explorer_url} target="_blank" rel="noreferrer" className="text-teal-700 underline">
                  Solana Explorer
                </a>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </Section>
  );
}
