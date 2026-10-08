// S-01 「最近の判定結果」 — results the operator featured (05 §4). Hidden when there are none or the DB is down.
import Link from "next/link";
import { answerLabel } from "@/lib/answers";
import { appContext } from "@/lib/context";
import { type Lang, langHref, pick } from "@/lib/lang";
import { featuredResults } from "@/lib/services/public-service";
import { Section } from "./site";

const SETTLEMENT_JA: Record<string, string> = {
  PENDING: "支払い待ち",
  SUBMITTED: "支払い処理中",
  SETTLED: "支払い済み",
  REFUNDED: "返金済み",
  FAILED_RETRYING: "支払いを再試行中",
};
const SETTLEMENT_EN: Record<string, string> = {
  PENDING: "payout pending",
  SUBMITTED: "payout in progress",
  SETTLED: "paid",
  REFUNDED: "refunded",
  FAILED_RETRYING: "payout retrying",
};

function ago(iso: string, now: number, lang: Lang) {
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60_000));
  if (lang === "en") {
    if (m < 60) return `${m} min ago`;
    if (m < 60 * 24) return `${Math.floor(m / 60)} h ago`;
    const d = Math.floor(m / 1440);
    return `${d} day${d === 1 ? "" : "s"} ago`;
  }
  if (m < 60) return `${m}分前`;
  if (m < 60 * 24) return `${Math.floor(m / 60)}時間前`;
  return `${Math.floor(m / 1440)}日前`;
}

export async function FeaturedResults({ lang = "ja" }: { lang?: Lang }) {
  let items: Awaited<ReturnType<typeof featuredResults>> = [];
  try {
    items = await featuredResults(appContext());
  } catch (e) {
    console.error("featured results unavailable", e);
    return null;
  }
  if (!items.length) return null;
  const now = Date.now();
  const settlement = lang === "en" ? SETTLEMENT_EN : SETTLEMENT_JA;
  return (
    <Section
      title={pick(lang, "最近の判定結果", "Recent results")}
      lead={pick(
        lang,
        "運営者が選んで掲載している実際の結果です。質問文、場所、写真、確かめた人の情報は載せていません。",
        "Real results the operator chose to feature. The question, place, photos and the people who checked are not shown.",
      )}
    >
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((r) => (
          <li key={r.verification_id} className="rounded-2xl border border-slate-200 p-5">
            <p className="text-2xl font-bold">
              {answerLabel(lang, r.answer) ?? r.status}
              <span className="ml-2 text-sm font-medium text-slate-500">{r.status}</span>
            </p>
            <p className="mt-2 text-sm text-slate-600">
              {pick(
                lang,
                `${r.witnesses.required}人中${r.witnesses.valid}人が確認`,
                `${r.witnesses.valid} of ${r.witnesses.required} witnesses confirmed`,
              )}
              {r.consensus_ratio !== null
                ? pick(
                    lang,
                    `・一致率 ${Math.round(r.consensus_ratio * 100)}%`,
                    ` · ${Math.round(r.consensus_ratio * 100)}% agreement`,
                  )
                : ""}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {ago(r.verified_at, now, lang)}
              {pick(lang, "・", " · ")}
              {settlement[r.settlement_status] ?? r.settlement_status}
            </p>
            <div className="mt-3 flex gap-4 text-sm">
              <Link
                href={langHref(lang, `/r/${r.verification_id}`)}
                className="font-semibold text-teal-700 underline"
              >
                {pick(lang, "結果ページ", "Result page")}
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
