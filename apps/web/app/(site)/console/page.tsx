// S-B10 requester console (01 §4.14): key details, balance, recent tasks, webhook deliveries, schedules.
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { LogoutButton, StopScheduleButton } from "@/components/console-actions";
import { Section } from "@/components/site";
import { answerJa } from "@/lib/answers";
import { appContext } from "@/lib/context";
import { CONSOLE_COOKIE, consoleAuth, dashboard } from "@/lib/services/console-service";

export const metadata: Metadata = { title: "依頼者の画面 | ProofMarket", robots: { index: false } };
export const dynamic = "force-dynamic";

const jst = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("ja-JP", {
        timeZone: "Asia/Tokyo",
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
const DAYS = ["日", "月", "火", "水", "木", "金", "土"];

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
  const app = appContext();
  const auth = await consoleAuth(app, (await cookies()).get(CONSOLE_COOKIE)?.value);
  if (!auth) redirect("/console/login");
  const d = await dashboard(app, auth);
  return (
    <>
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 pt-8">
        <div>
          <p className="text-sm font-semibold text-teal-700">依頼者の画面</p>
          <p className="font-mono text-sm text-slate-500">pm_test_{d.key.prefix}_…</p>
        </div>
        <LogoutButton />
      </div>

      <Section title="残高と上限">
        <div className="grid gap-3 sm:grid-cols-4">
          <Stat label="残高" value={d.balance} unit="USDC" />
          <Stat label="今日使った額" value={d.spent_today} unit={`/ ${d.key.daily_spend_limit} USDC`} />
          <Stat label="1件の上限" value={d.key.max_task_amount} unit="USDC" />
          <Stat label="1分あたり" value={String(d.key.rate_limit_per_min)} unit="回" />
        </div>
        <p className="mt-3 text-sm text-slate-600">使える種類: {d.key.allowed_task_types.join("、")}</p>
      </Section>

      <Section title="最近の依頼">
        {d.tasks.length ? (
          <div className="overflow-x-auto rounded-2xl border border-slate-200">
            <table className="w-full min-w-[34rem] text-left text-sm">
              <thead className="bg-slate-50 text-slate-500">
                <tr>
                  <th className="px-3 py-2 font-semibold">作成</th>
                  <th className="px-3 py-2 font-semibold">状態</th>
                  <th className="px-3 py-2 font-semibold">答え</th>
                  <th className="px-3 py-2 font-semibold">ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {d.tasks.map((t) => (
                  <tr key={t.verification_id}>
                    <td className="whitespace-nowrap px-3 py-2">{jst(t.created_at)}</td>
                    <td className="px-3 py-2">
                      {t.status}
                      {t.recheck_of ? <span className="ml-1 text-xs text-slate-500">（再確認）</span> : null}
                    </td>
                    <td className="px-3 py-2">{answerJa(t.answer) ?? "—"}</td>
                    <td className="px-3 py-2 font-mono text-xs">
                      <Link href={`/r/${t.verification_id}`} className="text-teal-700 underline">
                        {t.verification_id}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-600">まだ依頼はありません。</p>
        )}
      </Section>

      <Section title="定期確認">
        {d.schedules.length ? (
          <ul className="divide-y divide-slate-200 rounded-2xl border border-slate-200 text-sm">
            {d.schedules.map((s) => (
              <li key={s.schedule_id} className="flex flex-wrap items-center justify-between gap-2 p-4">
                <div>
                  <p className="font-semibold">
                    {s.days_jst.map((n) => DAYS[n]).join("・")} {s.times_jst.join("・")}
                    {s.active ? "" : "（停止中）"}
                  </p>
                  <p className="text-xs text-slate-500">
                    次回 {jst(s.next_run_at)}・前回 {jst(s.last_run_at)}
                    {s.last_error ? `・前回の失敗 ${s.last_error}` : ""}
                  </p>
                </div>
                {s.active ? <StopScheduleButton id={s.schedule_id} /> : null}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-600">定期確認はありません。</p>
        )}
      </Section>

      <Section title="Webhook">
        {d.webhooks.endpoints.length ? (
          <>
            <ul className="mb-3 text-sm text-slate-600">
              {d.webhooks.endpoints.map((e) => (
                <li key={e.url} className="break-all font-mono text-xs">
                  {e.url}（{e.status}）
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
                      ? `届いた ${jst(w.delivered_at)}`
                      : `未達・試行 ${w.attempts} 回・${w.last_status ?? "応答なし"}`}
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-sm text-slate-600">
            Webhook の送り先は登録されていません。登録は運営者が行います。
          </p>
        )}
      </Section>
    </>
  );
}
