"use client";
// W-21 仕事の内容 — what to do, what "done" means, the pay, how the requester has decided before, and apply.
import { use, useEffect, useState } from "react";
import { Button, Card, Notice, Shell, yen } from "@/components/ui";
import { errorText, useApi } from "@/lib/client/api";
import { LLink, useLang } from "@/lib/client/lang";
import { pick } from "@/lib/lang";
import type { Job } from "../types";

export default function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const lang = useLang();
  const api = useApi();
  const [job, setJob] = useState<Job | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api<Job>(`/v1/worker/market-tasks/${id}`).then(setJob, (e) => setErr(errorText(e, lang)));
  }, [api, id, lang]);

  async function apply() {
    setBusy(true);
    setErr(null);
    try {
      setJob(
        await api<Job>(`/v1/worker/market-tasks/${id}/apply`, {
          method: "POST",
          body: { answers, ...(note.trim() ? { note: note.trim() } : {}) },
        }),
      );
    } catch (e) {
      setErr(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  }

  const r = job?.requester;
  return (
    <Shell title={pick(lang, "仕事の内容", "Task details")} back="/jobs">
      {err ? <Notice tone="error">{err}</Notice> : null}
      {job ? (
        <>
          <Card>
            <p className="text-xl font-bold leading-snug">{job.title}</p>
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
              {job.description}
            </p>
            <p className="mt-3 whitespace-pre-wrap rounded-xl bg-amber-50 p-3 text-sm leading-relaxed text-amber-900">
              <span className="font-bold">{pick(lang, "完了の条件: ", "Done when: ")}</span>
              {job.completion_criteria}
            </p>
          </Card>
          <Card>
            <dl className="grid grid-cols-2 gap-y-3 text-sm">
              <dt className="text-slate-500">{pick(lang, "報酬", "Pay")}</dt>
              <dd className="text-right text-lg font-bold text-teal-700">
                {yen(job.price.amount, lang, job.price.asset)}
              </dd>
              <dt className="text-slate-500">{pick(lang, "場所", "Place")}</dt>
              <dd className="text-right font-medium">
                {job.remote_ok ? pick(lang, "どこからでも", "Anywhere") : job.area}
              </dd>
              <dt className="text-slate-500">{pick(lang, "作業の持ち時間", "Time to deliver")}</dt>
              <dd className="text-right font-medium">
                {pick(lang, `${job.completion_window_hours} 時間`, `${job.completion_window_hours} h`)}
              </dd>
              <dt className="text-slate-500">{pick(lang, "支払い", "Payment")}</dt>
              <dd className="text-right font-medium">
                {job.release_mode === "auto"
                  ? pick(lang, "提出したら支払い", "Paid on delivery")
                  : pick(
                      lang,
                      "依頼者の承認か、提出から24時間で支払い",
                      "On approval, or 24 h after delivery",
                    )}
              </dd>
              <dt className="text-slate-500">{pick(lang, "この依頼者の却下率", "This requester rejects")}</dt>
              <dd className="text-right font-medium">
                {r && r.rejected_ratio !== null
                  ? `${Math.round(r.rejected_ratio * 100)}% (${r.decided}${pick(lang, "件中", " decided")})`
                  : pick(lang, "まだ記録なし", "No record yet")}
              </dd>
            </dl>
          </Card>
          {job.mine.seat_id ? (
            <LLink href={`/jobs/seats/${job.mine.seat_id}`} className="block">
              <Button>{pick(lang, "担当している仕事を開く", "Open your task")}</Button>
            </LLink>
          ) : job.mine.application === "pending" ? (
            <Notice tone="ok">
              {pick(
                lang,
                "応募しました。選ばれたら知らせます。",
                "Applied. You will hear if you are chosen.",
              )}
            </Notice>
          ) : job.mine.application === "rejected" ? (
            <Notice>{pick(lang, "今回は選ばれませんでした。", "Not chosen this time.")}</Notice>
          ) : job.status === "OPEN" && job.seats_open > 0 ? (
            <Card>
              {job.application_questions.map((q) => (
                <label key={q.id} className="mb-3 block text-sm">
                  <span className="font-medium">
                    {q.label}
                    {q.required ? " *" : ""}
                  </span>
                  <textarea
                    className="mt-1 w-full rounded-xl border border-slate-300 p-3 text-base"
                    rows={2}
                    value={answers[q.id] ?? ""}
                    onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                  />
                </label>
              ))}
              {job.selection_mode === "application" ? (
                <label className="mb-3 block text-sm">
                  <span className="font-medium">{pick(lang, "ひとこと（任意）", "A note (optional)")}</span>
                  <textarea
                    className="mt-1 w-full rounded-xl border border-slate-300 p-3 text-base"
                    rows={2}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </label>
              ) : null}
              <Button onClick={apply} disabled={busy}>
                {job.selection_mode === "first_come"
                  ? pick(lang, "引き受ける", "Take this task")
                  : pick(lang, "応募する", "Apply")}
              </Button>
            </Card>
          ) : (
            <Notice>{pick(lang, "募集は終わりました。", "This task is no longer open.")}</Notice>
          )}
        </>
      ) : null}
    </Shell>
  );
}
