// S-B11 Tasks (requester console, docs/architecture 13 §8): each task with its applicants and seats; accept,
// approve and pay, ask for changes, or reject. Agents do the same through the API and MCP.
import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  SeatRatingForm,
  TaskApplicationButtons,
  TaskMessageForm,
  TaskSeatButtons,
  WorkerMarkButtons,
} from "@/components/console-actions";
import { Section } from "@/components/site";
import { appContext } from "@/lib/context";
import { dateLocale, type Lang, langHref, pick } from "@/lib/lang";
import { getLang } from "@/lib/lang-server";
import { CONSOLE_COOKIE, consoleAuth } from "@/lib/services/console-service";
import { flagEnabled } from "@/lib/services/flags";
import { listApplications, listTasks, requesterMessages } from "@/lib/services/market-task-service";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: pick(await getLang(), "仕事 | 依頼者の画面", "Tasks | Requester console"),
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

const SEAT: Record<Lang, Record<string, string>> = {
  ja: {
    ASSIGNED: "作業中",
    IN_REVIEW: "提出あり・確認待ち",
    RELEASED: "支払い済み",
    REJECTED: "受け取らなかった",
    EXPIRED: "期限切れ",
    CANCELLED: "取り消し",
  },
  en: {
    ASSIGNED: "Working",
    IN_REVIEW: "Delivered, awaiting you",
    RELEASED: "Paid",
    REJECTED: "Rejected",
    EXPIRED: "Time ran out",
    CANCELLED: "Cancelled",
  },
};
const STATUS: Record<Lang, Record<string, string>> = {
  ja: { OPEN: "募集中", CLOSED: "募集終了", DONE: "完了", CANCELLED: "取り消し" },
  en: { OPEN: "Open", CLOSED: "Closed", DONE: "Done", CANCELLED: "Cancelled" },
};

export default async function ConsoleTasksPage() {
  const lang = await getLang();
  const app = appContext();
  const auth = await consoleAuth(app, (await cookies()).get(CONSOLE_COOKIE)?.value);
  if (!auth) redirect(langHref(lang, "/console/login"));
  const back = (
    <p className="mx-auto max-w-5xl px-4 pt-8 text-sm">
      <Link href={langHref(lang, "/console")} className="font-semibold text-teal-700 underline">
        {pick(lang, "← 依頼者の画面", "← Requester console")}
      </Link>
    </p>
  );
  if (!(await flagEnabled(app.db, "tasks_enabled"))) {
    return (
      <>
        {back}
        <Section title={pick(lang, "仕事", "Tasks")}>
          <p className="text-slate-600">
            {pick(lang, "仕事の受付はまだ始まっていません。", "Tasks are not open yet.")}
          </p>
        </Section>
      </>
    );
  }
  const { tasks } = await listTasks(app, auth);
  const apps = await Promise.all(tasks.map((t) => listApplications(app, auth, t.task_id)));
  const threads = new Map(
    await Promise.all(
      tasks.flatMap((t) =>
        t.seats.map(
          async (s) =>
            [s.seat_id, (await requesterMessages(app, auth, t.task_id, s.seat_id)).messages] as const,
        ),
      ),
    ),
  );
  return (
    <>
      {back}
      <Section
        title={pick(lang, "仕事", "Tasks")}
        lead={pick(
          lang,
          "提出から24時間のあいだに決めなければ、worker に支払われます。",
          "If you decide nothing within 24 hours of a delivery, the worker is paid.",
        )}
      >
        <p className="mb-4 text-sm">
          <Link href={langHref(lang, "/console/workers")} className="font-semibold text-teal-700 underline">
            {pick(lang, "推し・お断りにした worker", "Preferred and blocked workers")}
          </Link>
        </p>
        {tasks.length === 0 ? (
          <p className="text-slate-600">
            {pick(
              lang,
              "まだ仕事はありません。API か MCP の create_task で出せます。",
              "No tasks yet. Post one with the API or the MCP tool create_task.",
            )}
          </p>
        ) : null}
        <div className="space-y-6">
          {tasks.map((t, i) => (
            <article key={t.task_id} className="rounded-2xl border border-slate-200 p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-lg font-bold">{t.title}</h3>
                <span className="text-sm font-semibold text-teal-700">{STATUS[lang][t.status]}</span>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                {pick(lang, "1 人", "Per seat")} {t.cost.price_per_seat} {t.cost.asset} × {t.cost.seats}
                {pick(lang, " ＋ 手数料 ", " + fee ")}
                {t.cost.platform_fee.amount}
                {pick(lang, " ＝ ", " = ")}
                {t.cost.total} {t.cost.asset}
                {pick(lang, "・締切 ", " · closes ")}
                {jst(t.deadline, lang)}
              </p>
              {(apps[i]?.applications ?? []).filter((a) => a.state === "pending").length ? (
                <div className="mt-4">
                  <h4 className="text-sm font-bold text-slate-600">{pick(lang, "応募", "Applicants")}</h4>
                  <ul className="mt-2 space-y-3">
                    {(apps[i]?.applications ?? [])
                      .filter((a) => a.state === "pending")
                      .map((a) => (
                        <li key={a.application_id} className="rounded-xl bg-slate-50 p-3 text-sm">
                          <p className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            <span className="font-mono">{a.worker_ref.slice(0, 18)}…</span>
                            {a.preferred ? (
                              <span className="rounded bg-teal-100 px-1.5 font-semibold text-teal-900">
                                {pick(lang, "推し", "Preferred")}
                              </span>
                            ) : null}
                            {a.public_id ? (
                              <Link
                                href={langHref(lang, `/people/${a.public_id}`)}
                                className="font-semibold text-teal-700 underline"
                              >
                                {pick(lang, "公開プロフィール", "Public profile")}
                              </Link>
                            ) : null}
                          </p>
                          <p className="mt-1 text-slate-600">
                            {pick(
                              lang,
                              `これまでの仕事 ${a.worker.completed_tasks} 件・確認 ${a.worker.completed_verifications} 件`,
                              `${a.worker.completed_tasks} tasks and ${a.worker.completed_verifications} verifications done`,
                            )}
                          </p>
                          {Object.entries(a.answers).map(([k, v]) => (
                            <p key={k} className="mt-1">
                              <span className="text-slate-500">
                                {t.application_questions.find((q) => q.id === k)?.label ?? k}:{" "}
                              </span>
                              {v}
                            </p>
                          ))}
                          {a.note ? <p className="mt-1">{a.note}</p> : null}
                          <div className="mt-2 flex flex-wrap items-center gap-x-6 gap-y-2">
                            <TaskApplicationButtons taskId={t.task_id} appId={a.application_id} />
                            <WorkerMarkButtons
                              worker={{ task_id: t.task_id, worker_ref: a.worker_ref }}
                              kind={a.preferred ? "prefer" : null}
                            />
                          </div>
                        </li>
                      ))}
                  </ul>
                </div>
              ) : null}
              {t.seats.length ? (
                <div className="mt-4">
                  <h4 className="text-sm font-bold text-slate-600">{pick(lang, "担当", "Seats")}</h4>
                  <ul className="mt-2 space-y-3">
                    {t.seats.map((s) => (
                      <li key={s.seat_id} className="rounded-xl border border-slate-200 p-3 text-sm">
                        <p className="font-semibold">
                          {pick(lang, `席 ${s.seat_no}`, `Seat ${s.seat_no}`)}・{SEAT[lang][s.state]}
                          {s.state === "IN_REVIEW" && s.review_due_at
                            ? pick(
                                lang,
                                `（${jst(s.review_due_at, lang)} に自動で支払い）`,
                                ` (paid automatically ${jst(s.review_due_at, lang)})`,
                              )
                            : ""}
                        </p>
                        {s.delivery ? (
                          <div className="mt-2 whitespace-pre-wrap rounded-lg bg-slate-50 p-3">
                            {s.delivery.body}
                            {s.delivery.links.map((l) => (
                              <p key={l} className="mt-1 break-all text-teal-700">
                                {l}
                              </p>
                            ))}
                          </div>
                        ) : null}
                        {s.state === "IN_REVIEW" ? (
                          <div className="mt-2">
                            <TaskSeatButtons taskId={t.task_id} seatId={s.seat_id} />
                          </div>
                        ) : null}
                        {s.review ? (
                          <p className="mt-2 text-sm">
                            <span className="font-bold text-amber-600">{"★".repeat(s.review.rating)}</span>
                            {s.review.comment ? <span className="ml-2">{s.review.comment}</span> : null}
                          </p>
                        ) : s.state === "RELEASED" ? (
                          <SeatRatingForm taskId={t.task_id} seatId={s.seat_id} />
                        ) : null}
                        <div className="mt-2">
                          <WorkerMarkButtons
                            worker={{ task_id: t.task_id, worker_ref: s.worker_ref }}
                            kind={
                              apps[i]?.applications.find((a) => a.worker_ref === s.worker_ref)?.preferred
                                ? "prefer"
                                : null
                            }
                          />
                        </div>
                        {(threads.get(s.seat_id) ?? []).length ? (
                          <ul className="mt-3 space-y-1">
                            {(threads.get(s.seat_id) ?? []).map((m) => (
                              <li key={m.message_id} className="text-sm">
                                <span className="font-semibold text-slate-500">
                                  {m.sender === "worker" ? "worker" : pick(lang, "あなた", "You")}:
                                </span>{" "}
                                <span className="whitespace-pre-wrap">{m.body}</span>
                                {m.flags.length ? (
                                  <span className="ml-2 rounded bg-amber-100 px-1.5 text-xs text-amber-900">
                                    {pick(lang, "外部への誘導の疑い", "possible off-platform")}
                                  </span>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                        {s.state === "ASSIGNED" || s.state === "IN_REVIEW" ? (
                          <TaskMessageForm taskId={t.task_id} seatId={s.seat_id} />
                        ) : null}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </Section>
    </>
  );
}
