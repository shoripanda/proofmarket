// S-11 実績 — public track record read from the DB (05 §4.1). Aggregates only; nothing about a single request.
import type { Metadata } from "next";
import Link from "next/link";
import { PageHero, Section } from "@/components/site";
import { BigNumber, duration, loadStats, usdc } from "@/components/stats";
import { taskTypeText } from "@/lib/answers";
import { dateLocale, type Lang, langHref, pick } from "@/lib/lang";
import { getLang } from "@/lib/lang-server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: pick(await getLang(), "実績 | ProofMarket", "Numbers | ProofMarket") };
}

// Read from the DB per request (cached about a minute in the service).
export const dynamic = "force-dynamic";

const time = (iso: string, lang: Lang) =>
  new Date(iso).toLocaleString(dateLocale(lang), {
    timeZone: "Asia/Tokyo",
    month: lang === "en" ? "short" : "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const n = (lang: Lang, count: number, ja: string, en: string, enPlural = `${en}s`) =>
  lang === "en" ? `${count} ${count === 1 ? en : enPlural}` : `${count}${ja}`;

export default async function StatsPage() {
  const lang = await getLang();
  const s = await loadStats();
  const types = taskTypeText(lang);
  return (
    <>
      <PageHero
        eyebrow={pick(lang, "実績", "Numbers")}
        title={pick(
          lang,
          "人の手で確かめた依頼の数と、支払った報酬",
          "Requests checked by people, and what they were paid",
        )}
      >
        <p>
          {pick(
            lang,
            "試験運用で実際に動いた依頼を、データベースから集計しています。1分ごとに更新します。報酬の支払いは Solana Devnet に記録されているので、下の一覧から1件ずつ Explorer で確かめられます。",
            "Aggregated from the database over the requests that actually ran during the pilot, refreshed every minute. Payouts are recorded on Solana Devnet, so each one in the list below can be checked in the Explorer.",
          )}
        </p>
      </PageHero>

      {!s ? (
        <Section
          title={pick(lang, "いまは数字を読み込めません", "The numbers cannot be loaded right now")}
          lead={pick(
            lang,
            "少し時間をおいて、ページを開き直してください。",
            "Please reload the page in a moment.",
          )}
        />
      ) : (
        <>
          <Section title={pick(lang, "全体の数字", "Overall")}>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <BigNumber
                value={n(lang, s.verifications.completed, "件", "request")}
                label={pick(lang, "完了した依頼", "completed requests")}
                note={pick(
                  lang,
                  `受け付けた依頼は全部で ${s.verifications.total}件`,
                  `${s.verifications.total} requests received in total`,
                )}
              />
              <BigNumber
                value={usdc(s.paid_to_workers.amount)}
                label={pick(lang, "worker に支払った報酬", "paid to workers")}
                note={pick(
                  lang,
                  "支払いが確定した分だけ。Devnet のテスト用 USDC",
                  "Settled payouts only. Test USDC on Devnet",
                )}
              />
              <BigNumber
                value={duration(s.median_seconds_to_result, lang)}
                label={pick(lang, "依頼から結果が出るまでの中央値", "median time from request to result")}
              />
              <BigNumber
                value={n(lang, s.workers_with_valid_submission, "人", "worker")}
                label={pick(lang, "有効な提出をした worker", "workers with a valid submission")}
              />
              <BigNumber
                value={`${s.requesters}`}
                label={pick(lang, "依頼した組織・個人の数", "requesting organisations and individuals")}
              />
            </div>
          </Section>

          <DailyChart days={s.daily_completed} lang={lang} />
          <AiReview review={s.ai_review} lang={lang} />

          <Section title={pick(lang, "依頼の種類ごとの件数", "Requests by type")}>
            {s.by_type.length === 0 ? (
              <p className="text-sm text-slate-500">
                {pick(lang, "まだ依頼はありません。", "No requests yet.")}
              </p>
            ) : (
              <table className="w-full max-w-2xl text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-2 font-medium">{pick(lang, "種類", "Type")}</th>
                    <th className="py-2 text-right font-medium">{pick(lang, "受付", "Received")}</th>
                    <th className="py-2 text-right font-medium">{pick(lang, "完了", "Completed")}</th>
                  </tr>
                </thead>
                <tbody>
                  {s.by_type.map((t) => (
                    <tr key={t.type} className="border-b border-slate-100">
                      <td className="py-2">{types[t.type].name}</td>
                      <td className="py-2 text-right tabular-nums">{t.total}</td>
                      <td className="py-2 text-right tabular-nums">{t.completed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          <Section
            title={pick(lang, "最近支払いが確定した結果", "Recently settled results")}
            lead={pick(
              lang,
              "質問文、答え、場所、写真、確かめた人の情報は載せません。結果ページは、運営者が掲載を決めたものだけにつなぎます。",
              "The question, answer, place, photos and the people who checked are not shown. Result pages are linked only where the operator chose to feature them.",
            )}
          >
            {s.recent_results.length === 0 ? (
              <p className="text-sm text-slate-500">{pick(lang, "まだありません。", "Nothing yet.")}</p>
            ) : (
              <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200">
                {s.recent_results.map((r) => (
                  <li
                    key={r.explorer_url}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4 text-sm"
                  >
                    <span className="w-28 tabular-nums text-slate-500">{time(r.finalized_at, lang)}</span>
                    <span className="font-semibold">{types[r.type].name}</span>
                    <span className="text-slate-500">
                      {pick(
                        lang,
                        `${r.witnesses}人が確認`,
                        `${r.witnesses} ${r.witnesses === 1 ? "witness" : "witnesses"}`,
                      )}
                    </span>
                    <span className="ml-auto flex gap-4">
                      {r.result_url ? (
                        <Link href={langHref(lang, r.result_url)} className="text-teal-700 underline">
                          {pick(lang, "結果ページ", "Result page")}
                        </Link>
                      ) : null}
                      <a
                        href={r.explorer_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-teal-700 underline"
                      >
                        Solana Explorer
                      </a>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={pick(lang, "同じ数字を JSON で", "The same numbers as JSON")}>
            <p className="text-sm leading-relaxed text-slate-600">
              <code className="rounded bg-slate-100 px-1.5 py-0.5">GET /v1/public/stats</code>{" "}
              {pick(
                lang,
                "で、このページと同じ数字を受け取れます。認証は要りません。",
                "returns the numbers on this page. No authentication needed.",
              )}
              <a href="/v1/public/stats" className="ml-2 font-semibold text-teal-700 underline">
                {pick(lang, "開く", "Open")}
              </a>
            </p>
          </Section>
        </>
      )}
    </>
  );
}

function DailyChart({ days, lang }: { days: { date: string; count: number }[]; lang: Lang }) {
  const max = Math.max(1, ...days.map((d) => d.count));
  const total = days.reduce((a, d) => a + d.count, 0);
  const totalText = pick(lang, `14日間で ${total}件。`, `${total} in 14 days.`);
  return (
    <Section
      title={pick(lang, "直近14日の完了件数", "Completed in the last 14 days")}
      lead={pick(
        lang,
        `日本時間の日付で数えています。${totalText}`,
        `Counted by date in Japan time. ${totalText}`,
      )}
    >
      <div
        className="flex h-44 items-end gap-1 sm:gap-2"
        role="img"
        aria-label={pick(
          lang,
          `直近14日の完了件数、合計 ${total}件`,
          `Completed requests over the last 14 days, ${total} in total`,
        )}
      >
        {days.map((d) => (
          <div key={d.date} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className="text-xs tabular-nums text-slate-600">{d.count || ""}</span>
            <div
              className="w-full rounded-t bg-teal-600"
              style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count ? 4 : 1 }}
              title={`${d.date}: ${d.count}`}
            />
            <span className="text-[10px] tabular-nums text-slate-500">
              {Number(d.date.slice(5, 7))}/{Number(d.date.slice(8, 10))}
            </span>
          </div>
        ))}
      </div>
    </Section>
  );
}

function AiReview({
  review,
  lang,
}: {
  review: { pass: number; fail: number; uncertain: number };
  lang: Lang;
}) {
  const total = review.pass + review.fail + review.uncertain;
  const rows = [
    {
      label: pick(lang, "合格", "Pass"),
      n: review.pass,
      color: "bg-teal-600",
      note: pick(lang, "写真と答えが依頼どおり", "photo and answer match the request"),
    },
    {
      label: pick(lang, "差し戻し", "Sent back"),
      n: review.fail,
      color: "bg-rose-500",
      note: pick(lang, "依頼と違うので worker にやり直してもらった", "did not match; the worker redid it"),
    },
    {
      label: pick(lang, "判断できず", "Uncertain"),
      n: review.uncertain,
      color: "bg-amber-400",
      note: pick(
        lang,
        "写真では確かめようがない。注記を付けて合格",
        "a photo cannot tell; passed with a note",
      ),
    },
  ];
  return (
    <Section
      title={pick(lang, "AI による内容の確認", "AI review of the content")}
      lead={pick(
        lang,
        "機械的な確認（場所・時刻・写真の使い回し）を通った提出ごとに、Claude が写真と答えを依頼文と突き合わせています。",
        "For every submission that passed the machine checks (place, time, reuse), Claude compares the photo and the answer with the request.",
      )}
    >
      {total === 0 ? (
        <p className="text-sm text-slate-500">
          {pick(lang, "まだ確認した提出はありません。", "No submissions reviewed yet.")}
        </p>
      ) : (
        <div className="max-w-2xl space-y-4">
          <div className="flex h-4 overflow-hidden rounded-full bg-slate-100">
            {rows.map((r) =>
              r.n ? (
                <div key={r.label} className={r.color} style={{ width: `${(r.n / total) * 100}%` }} />
              ) : null,
            )}
          </div>
          <ul className="space-y-2 text-sm">
            {rows.map((r) => (
              <li key={r.label} className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <span className={`inline-block h-3 w-3 shrink-0 rounded-sm ${r.color}`} />
                <span className="w-24 shrink-0 whitespace-nowrap font-semibold">{r.label}</span>
                <span className="w-16 shrink-0 text-right tabular-nums">
                  {pick(lang, `${r.n}件`, String(r.n))}
                </span>
                <span className="w-full pl-6 text-slate-500 sm:w-auto sm:pl-0">{r.note}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}
