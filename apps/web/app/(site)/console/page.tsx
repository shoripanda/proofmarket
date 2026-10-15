// S-B10 requester console (01 §4.14): key details, balance, deposits, recent tasks, webhook deliveries, schedules.
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  CopyField,
  CreateDepositButton,
  LogoutButton,
  StopScheduleButton,
} from "@/components/console-actions";
import { Section } from "@/components/site";
import { answerLabel } from "@/lib/answers";
import { clusterText } from "@/lib/cluster-public";
import { appContext } from "@/lib/context";
import { dateLocale, type Lang, langHref, pick } from "@/lib/lang";
import { getLang } from "@/lib/lang-server";
import { CONSOLE_COOKIE, consoleAuth, dashboard } from "@/lib/services/console-service";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: pick(await getLang(), "依頼者の画面 | ProofMarket", "Requester console | ProofMarket"),
    robots: { index: false },
  };
}
export const dynamic = "force-dynamic";

const jst = (iso: string | null, lang: Lang) =>
  iso
    ? new Date(iso).toLocaleString(dateLocale(lang), {
        timeZone: "Asia/Tokyo",
        month: lang === "en" ? "short" : "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
const DAYS: Record<Lang, string[]> = {
  ja: ["日", "月", "火", "水", "木", "金", "土"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
};
const STOP_TEXT: Record<Lang, Record<string, string>> = {
  ja: {
    condition_met: "条件に合った",
    max_runs: "回数の上限",
    ended: "期間の終わり",
    failures: "3回続けて失敗",
    suspended: "キーの停止",
    stopped: "手動",
  },
  en: {
    condition_met: "condition met",
    max_runs: "run limit reached",
    ended: "period ended",
    failures: "3 failures in a row",
    suspended: "key suspended",
    stopped: "stopped by hand",
  },
};

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 p-4">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-bold">
        {value}
        {unit ? <span className="ml-1 text-sm font-medium text-slate-500">{unit}</span> : null}
      </p>
    </div>
  );
}

export default async function ConsolePage() {
  const lang = await getLang();
  const app = appContext();
  const ct = clusterText(app.config.cluster);
  const auth = await consoleAuth(app, (await cookies()).get(CONSOLE_COOKIE)?.value);
  if (!auth) redirect(langHref(lang, "/console/login"));
  const d = await dashboard(app, auth);
  const sep = pick(lang, "・", " · ");
  const assetList = d.balances.map((b) => b.asset).join(pick(lang, "、", ", "));
  return (
    <>
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 pt-8">
        <div>
          <p className="text-sm font-semibold text-teal-700">
            {pick(lang, "依頼者の画面", "Requester console")}
          </p>
          <p className="font-mono text-sm text-slate-500">pm_test_{d.key.prefix}_…</p>
        </div>
        <LogoutButton />
      </div>

      <Section title={pick(lang, "残高と上限", "Balance and limits")}>
        <div className="grid gap-3 sm:grid-cols-3">
          {d.balances.map((b) => (
            <Stat key={b.asset} label={pick(lang, "残高", "Balance")} value={b.amount} unit={b.asset} />
          ))}
          <Stat label={pick(lang, "今日使った額", "Spent today")} value={d.spent_today} unit="USDC" />
          <Stat
            label={pick(lang, "1分あたり", "Per minute")}
            value={String(d.key.rate_limit_per_min)}
            unit={pick(lang, "回", "calls")}
          />
        </div>
        <p className="mt-3 text-sm text-slate-600">
          {pick(lang, "使える種類: ", "Allowed types: ")}
          {d.key.allowed_task_types.join(pick(lang, "、", ", "))}
        </p>
      </Section>

      <Section
        title={pick(lang, "入金", "Deposits")}
        lead={pick(
          lang,
          `${assetList} のどれかを ${ct.chain} で送ると、確定（finalized）してから 1〜2 分で残高に入ります。残高は通貨ごとに分かれていて、依頼の報酬は同じ通貨の残高から払います。送金には必ず下の参照（reference）を付けてください。Solana Pay のリンクを使えば自動で付きます。`,
          `Send any of ${assetList} on ${ct.chain}; it reaches your balance one to two minutes after the transfer is finalized. Each asset is its own balance, and a reward is paid from the balance in its asset. Every transfer must carry the reference below; the Solana Pay links add it for you.`,
        )}
      >
        {d.deposit.reference && d.deposit.addresses && d.deposit.solana_pay ? (
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <CopyField
                label={pick(lang, "送り先（どの通貨も）", "Recipient (every asset)")}
                value={d.deposit.addresses.wallet}
              />
              <CopyField label={pick(lang, "参照（reference）", "Reference")} value={d.deposit.reference} />
              {d.deposit.addresses.accounts.map((a) => (
                <CopyField
                  key={a.asset}
                  label={`Solana Pay: ${a.asset}`}
                  value={d.deposit.solana_pay?.[a.asset] ?? ""}
                />
              ))}
            </div>
            <p className="text-xs text-slate-500">
              {pick(lang, "ミント: ", "Mints: ")}
              {d.deposit.addresses.accounts
                .filter((a) => a.account !== d.deposit.addresses?.wallet)
                .map((a) => `${a.asset} ${a.mint}`)
                .join(pick(lang, "、", ", "))}
              {pick(
                lang,
                "。参照の無い送金は自動では残高に入りません。その場合は運営者に取引 ID を伝えてください。",
                ". A transfer without the reference is not credited automatically; send the operator its transaction ID.",
              )}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              {pick(
                lang,
                "入金先はまだ発行していません。発行すると、あなた専用の参照が付いた送り先が出ます。",
                "No deposit address yet. Issuing one gives you a recipient with your own reference.",
              )}
            </p>
            <CreateDepositButton />
          </div>
        )}
        {d.deposit.deposits.length ? (
          <ul className="mt-4 divide-y divide-slate-200 rounded-2xl border border-slate-200 text-sm">
            {d.deposit.deposits.map((x) => (
              <li key={x.signature} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <span className="font-semibold">
                  {x.amount} {x.asset}
                </span>
                <span className="text-xs text-slate-500">
                  {jst(x.credited_at, lang)}
                  {sep}
                  <a
                    href={ct.solscanTx(x.signature)}
                    target="_blank"
                    rel="noopener"
                    className="font-mono underline"
                  >
                    {x.signature.slice(0, 8)}…
                  </a>
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </Section>

      <Section title={pick(lang, "最近の依頼", "Recent requests")}>
        {d.tasks.length ? (
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-semibold">{pick(lang, "作成", "Created")}</th>
                  <th className="px-3 py-2 font-semibold">{pick(lang, "状態", "Status")}</th>
                  <th className="px-3 py-2 font-semibold">{pick(lang, "答え", "Answer")}</th>
                  <th className="px-3 py-2 font-semibold">ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {d.tasks.map((t) => (
                  <tr key={t.verification_id}>
                    <td className="whitespace-nowrap px-3 py-2">{jst(t.created_at, lang)}</td>
                    <td className="px-3 py-2">
                      {t.status}
                      {t.recheck_of ? (
                        <span className="ml-1 text-xs text-slate-500">
                          {pick(lang, "（再確認）", "(recheck)")}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">{answerLabel(lang, t.answer) ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      <Link
                        href={langHref(lang, `/r/${t.verification_id}`)}
                        className="text-teal-700 underline"
                      >
                        {t.verification_id}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-600">{pick(lang, "まだ依頼はありません。", "No requests yet.")}</p>
        )}
      </Section>

      <Section title={pick(lang, "定期確認", "Schedules")}>
        {d.schedules.length ? (
          <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200 text-sm">
            {d.schedules.map((s) => (
              <li key={s.schedule_id} className="flex flex-wrap items-center justify-between gap-2 p-4">
                <div>
                  <p className="font-semibold">
                    {s.every_minutes !== null
                      ? pick(
                          lang,
                          `${s.every_minutes}分おき${s.stop_when ? "の見守り" : ""}`,
                          `every ${s.every_minutes} min${s.stop_when ? " (watch)" : ""}`,
                        )
                      : `${s.days_jst.map((n) => DAYS[lang][n]).join(pick(lang, "・", ", "))} ${s.times_jst.join(pick(lang, "・", ", "))}`}
                    {s.max_runs !== null
                      ? pick(lang, `・最大${s.max_runs}回`, ` · up to ${s.max_runs} runs`)
                      : ""}
                    {s.active
                      ? ""
                      : pick(
                          lang,
                          `（停止${s.stopped_reason ? `：${STOP_TEXT.ja[s.stopped_reason] ?? s.stopped_reason}` : ""}）`,
                          ` (stopped${s.stopped_reason ? `: ${STOP_TEXT.en[s.stopped_reason] ?? s.stopped_reason}` : ""})`,
                        )}
                  </p>
                  <p className="text-xs text-slate-500">
                    {pick(lang, "次回 ", "next ")}
                    {jst(s.next_run_at, lang)}
                    {sep}
                    {pick(lang, "前回 ", "last ")}
                    {jst(s.last_run_at, lang)}
                    {sep}
                    {pick(lang, `${s.runs}回実行`, `${s.runs} runs`)}
                    {s.last_error ? `${sep}${pick(lang, "前回の失敗 ", "last error ")}${s.last_error}` : ""}
                    {s.matched_verification_id
                      ? `${sep}${pick(lang, "合った依頼 ", "matched ")}${s.matched_verification_id}`
                      : ""}
                  </p>
                </div>
                {s.active ? <StopScheduleButton id={s.schedule_id} /> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-600">{pick(lang, "定期確認はありません。", "No schedules.")}</p>
        )}
      </Section>

      <Section title="Webhook">
        {d.webhooks.endpoints.length ? (
          <>
            <ul className="mb-3 text-sm text-slate-600">
              {d.webhooks.endpoints.map((e) => (
                <li key={e.url} className="break-all font-mono text-xs">
                  {e.url} ({e.status})
                </li>
              ))}
            </ul>
            <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200 text-sm">
              {d.webhooks.deliveries.map((w) => (
                <li
                  key={`${w.verification_id}-${w.event}`}
                  className="flex flex-wrap justify-between gap-2 p-3"
                >
                  <span className="font-mono text-xs">{w.event}</span>
                  <span className="text-xs text-slate-500">
                    {w.delivered_at
                      ? pick(
                          lang,
                          `届いた ${jst(w.delivered_at, lang)}`,
                          `delivered ${jst(w.delivered_at, lang)}`,
                        )
                      : pick(
                          lang,
                          `未達・試行 ${w.attempts} 回・${w.last_status ?? "応答なし"}`,
                          `not delivered · ${w.attempts} attempts · ${w.last_status ?? "no response"}`,
                        )}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-sm text-slate-600">
            {pick(
              lang,
              "Webhook の送り先は登録されていません。登録は運営者が行います。",
              "No webhook endpoint is registered. The operator registers endpoints.",
            )}
          </p>
        )}
      </Section>
    </>
  );
}
