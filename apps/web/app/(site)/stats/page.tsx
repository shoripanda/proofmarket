// S-11 実績 — public track record read from the DB (05 §4.1). Aggregates only; nothing about a single request.
import type { Metadata } from "next";
import Link from "next/link";
import { PageHero, Section } from "@/components/site";
import { BigNumber, duration, loadStats, usdc } from "@/components/stats";
import { TASK_TYPE_JA } from "@/lib/answers";

export const metadata: Metadata = { title: "実績 | ProofMarket" };

// Read from the DB per request (cached about a minute in the service).
export const dynamic = "force-dynamic";

const time = (iso: string) =>
  new Date(iso).toLocaleString("ja-JP", {
    timeZone: "Asia/Tokyo",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

export default async function StatsPage() {
  const s = await loadStats();
  return (
    <>
      <PageHero eyebrow="実績" title="人の手で確かめた依頼の数と、支払った報酬">
        <p>
          試験運用で実際に動いた依頼を、データベースから集計しています。1分ごとに更新します。報酬の支払いは
          Solana Devnet に記録されているので、下の一覧から1件ずつ Explorer で確かめられます。
        </p>
      </PageHero>

      {!s ? (
        <Section title="いまは数字を読み込めません" lead="少し時間をおいて、ページを開き直してください。" />
      ) : (
        <>
          <Section title="全体の数字">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <BigNumber
                value={`${s.verifications.completed}件`}
                label="完了した依頼"
                note={`受け付けた依頼は全部で ${s.verifications.total}件`}
              />
              <BigNumber
                value={usdc(s.paid_to_workers.amount)}
                label="worker に支払った報酬"
                note="支払いが確定した分だけ。Devnet のテスト用 USDC"
              />
              <BigNumber
                value={duration(s.median_seconds_to_result)}
                label="依頼から結果が出るまでの中央値"
              />
              <BigNumber value={`${s.workers_with_valid_submission}人`} label="有効な提出をした worker" />
              <BigNumber value={`${s.requesters}`} label="依頼した組織・個人の数" />
            </div>
          </Section>

          <DailyChart days={s.daily_completed} />
          <AiReview review={s.ai_review} />

          <Section title="依頼の種類ごとの件数">
            {s.by_type.length === 0 ? (
              <p className="text-sm text-slate-500">まだ依頼はありません。</p>
            ) : (
              <table className="w-full max-w-2xl text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-slate-500">
                    <th className="py-2 font-medium">種類</th>
                    <th className="py-2 text-right font-medium">受付</th>
                    <th className="py-2 text-right font-medium">完了</th>
                  </tr>
                </thead>
                <tbody>
                  {s.by_type.map((t) => (
                    <tr key={t.type} className="border-b border-slate-100">
                      <td className="py-2">{TASK_TYPE_JA[t.type].name}</td>
                      <td className="py-2 text-right tabular-nums">{t.total}</td>
                      <td className="py-2 text-right tabular-nums">{t.completed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Section>

          <Section
            title="最近支払いが確定した結果"
            lead="質問文、答え、場所、写真、確かめた人の情報は載せません。結果ページは、運営者が掲載を決めたものだけにつなぎます。"
          >
            {s.recent_results.length === 0 ? (
              <p className="text-sm text-slate-500">まだありません。</p>
            ) : (
              <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200">
                {s.recent_results.map((r) => (
                  <li
                    key={r.explorer_url}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 p-4 text-sm"
                  >
                    <span className="w-28 tabular-nums text-slate-500">{time(r.finalized_at)}</span>
                    <span className="font-semibold">{TASK_TYPE_JA[r.type].name}</span>
                    <span className="text-slate-500">{r.witnesses}人が確認</span>
                    <span className="ml-auto flex gap-4">
                      {r.result_url ? (
                        <Link href={r.result_url} className="text-teal-700 underline">
                          結果ページ
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

          <Section title="同じ数字を JSON で">
            <p className="text-sm leading-relaxed text-slate-600">
              <code className="rounded bg-slate-100 px-1.5 py-0.5">GET /v1/public/stats</code>{" "}
              で、このページと同じ数字を受け取れます。認証は要りません。
              <a href="/v1/public/stats" className="ml-2 font-semibold text-teal-700 underline">
                開く
              </a>
            </p>
          </Section>
        </>
      )}
    </>
  );
}

function DailyChart({ days }: { days: { date: string; count: number }[] }) {
  const max = Math.max(1, ...days.map((d) => d.count));
  const total = days.reduce((a, d) => a + d.count, 0);
  return (
    <Section title="直近14日の完了件数" lead={`日本時間の日付で数えています。14日間で ${total}件。`}>
      <div
        className="flex h-44 items-end gap-1 sm:gap-2"
        role="img"
        aria-label={`直近14日の完了件数、合計 ${total}件`}
      >
        {days.map((d) => (
          <div key={d.date} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
            <span className="text-xs tabular-nums text-slate-600">{d.count || ""}</span>
            <div
              className="w-full rounded-t bg-teal-600"
              style={{ height: `${(d.count / max) * 100}%`, minHeight: d.count ? 4 : 1 }}
              title={`${d.date}: ${d.count}件`}
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

function AiReview({ review }: { review: { pass: number; fail: number; uncertain: number } }) {
  const total = review.pass + review.fail + review.uncertain;
  const rows = [
    { label: "合格", n: review.pass, color: "bg-teal-600", note: "写真と答えが依頼どおり" },
    {
      label: "差し戻し",
      n: review.fail,
      color: "bg-rose-500",
      note: "依頼と違うので worker にやり直してもらった",
    },
    {
      label: "判断できず",
      n: review.uncertain,
      color: "bg-amber-400",
      note: "写真では確かめようがない。注記を付けて合格",
    },
  ];
  return (
    <Section
      title="AI による内容の確認"
      lead="機械的な確認（場所・時刻・写真の使い回し）を通った提出ごとに、Claude が写真と答えを依頼文と突き合わせています。"
    >
      {total === 0 ? (
        <p className="text-sm text-slate-500">まだ確認した提出はありません。</p>
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
                <span className="w-16 shrink-0 text-right tabular-nums">{r.n}件</span>
                <span className="w-full pl-6 text-slate-500 sm:w-auto sm:pl-0">{r.note}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}
