"use client";
// W-22 My task — deliver the work, see the review clock and the requester's decision.
import { use, useCallback, useEffect, useState } from "react";
import { Button, Card, Notice, remaining, Shell, useNow, yen } from "@/components/ui";
import { errorText, useApi } from "@/lib/client/api";
import { useLang } from "@/lib/client/lang";
import { pick } from "@/lib/lang";
import { SEAT_TEXT } from "../../seat-state";
import type { Job, MySeat } from "../../types";
import { SeatMessages } from "./messages";

export default function SeatPage({ params }: { params: Promise<{ seatId: string }> }) {
  const { seatId } = use(params);
  const lang = useLang();
  const api = useApi();
  const now = useNow();
  const [seat, setSeat] = useState<MySeat | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [body, setBody] = useState("");
  const [links, setLinks] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const r = await api<{ seats: MySeat[] }>("/v1/worker/market-seats");
    const s = r.seats.find((x) => x.seat_id === seatId) ?? null;
    setSeat(s);
    if (s) setJob(await api<Job>(`/v1/worker/market-tasks/${s.task_id}`));
  }, [api, seatId]);
  useEffect(() => {
    load().catch((e) => setErr(errorText(e, lang)));
  }, [load, lang]);

  async function deliver() {
    setBusy(true);
    setErr(null);
    try {
      await api(`/v1/worker/market-seats/${seatId}/deliver`, {
        method: "POST",
        body: {
          body: body.trim(),
          links: links
            .split(/\s+/)
            .map((l) => l.trim())
            .filter(Boolean),
        },
      });
      setBody("");
      setLinks("");
      await load();
    } catch (e) {
      setErr(errorText(e, lang));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell title={pick(lang, "担当している仕事", "Your task")} back="/jobs">
      {err ? <Notice tone="error">{err}</Notice> : null}
      {seat ? (
        <>
          <Card>
            <p className="text-xl font-bold leading-snug">{seat.title}</p>
            <p className="mt-1 text-sm font-semibold text-teal-700">{SEAT_TEXT[lang][seat.state]}</p>
            {seat.price ? (
              <p className="mt-1 text-sm text-slate-600">
                {pick(lang, "報酬 ", "Pay ")}
                {yen(seat.price.amount, lang, seat.price.asset)}
              </p>
            ) : null}
            {job ? (
              <>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
                  {job.description}
                </p>
                <p className="mt-3 whitespace-pre-wrap rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                  <span className="font-bold">{pick(lang, "完了の条件: ", "Done when: ")}</span>
                  {job.completion_criteria}
                </p>
              </>
            ) : null}
          </Card>
          {seat.decision_reason && seat.state !== "RELEASED" ? (
            <Notice tone={seat.state === "REJECTED" ? "error" : "info"}>
              {pick(lang, "依頼者から: ", "From the requester: ")}
              {seat.decision_reason}
            </Notice>
          ) : null}
          {seat.state === "IN_REVIEW" && seat.review_due_at ? (
            <Notice>
              {pick(
                lang,
                `依頼者が決めなければ、あと ${remaining(seat.review_due_at, now, lang)} で支払われます。`,
                `If the requester decides nothing, you are paid in ${remaining(seat.review_due_at, now, lang)}.`,
              )}
            </Notice>
          ) : null}
          {seat.state === "ASSIGNED" ? (
            <Card>
              <p className="mb-2 text-sm text-slate-600">
                {pick(
                  lang,
                  `提出の期限まで ${remaining(seat.due_at, now, lang)}`,
                  `Due in ${remaining(seat.due_at, now, lang)}`,
                )}
                {seat.revisions
                  ? pick(lang, `（直しの依頼 ${seat.revisions} 回目）`, ` (change request ${seat.revisions})`)
                  : ""}
              </p>
              <label className="mb-3 block text-sm">
                <span className="font-medium">{pick(lang, "報告", "Report")}</span>
                <textarea
                  className="mt-1 w-full rounded-xl border border-slate-300 p-3 text-base"
                  rows={6}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                  placeholder={pick(lang, "何をしたか、結果は何か", "What you did and what you found")}
                />
              </label>
              <label className="mb-3 block text-sm">
                <span className="font-medium">
                  {pick(lang, "リンク（任意、空白で区切る）", "Links (optional, space separated)")}
                </span>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-300 p-3 text-base"
                  value={links}
                  onChange={(e) => setLinks(e.target.value)}
                />
              </label>
              <Button onClick={deliver} disabled={busy || !body.trim()}>
                {pick(lang, "提出する", "Deliver")}
              </Button>
            </Card>
          ) : null}
          {seat.delivery ? (
            <Card>
              <p className="text-sm font-bold text-slate-500">
                {pick(lang, "最後に提出した内容", "Last delivery")}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm">{seat.delivery.body}</p>
              {seat.delivery.links.map((l) => (
                <p key={l} className="mt-1 break-all text-sm text-teal-700">
                  {l}
                </p>
              ))}
            </Card>
          ) : null}
          {seat.review ? (
            <Card>
              <p className="text-sm font-bold text-slate-500">
                {pick(lang, "依頼者の評価", "The requester's rating")}
              </p>
              <p className="mt-2 text-lg font-bold text-amber-600" aria-label={`${seat.review.rating} / 5`}>
                {"★".repeat(seat.review.rating)}
                <span className="text-slate-300">{"★".repeat(5 - seat.review.rating)}</span>
              </p>
              {seat.review.comment ? (
                <p className="mt-1 whitespace-pre-wrap text-sm">{seat.review.comment}</p>
              ) : null}
              <p className="mt-2 text-xs text-slate-500">
                {pick(
                  lang,
                  "コメントはあなたにだけ見えます。公開プロフィールには平均だけが出ます（3 件から）。",
                  "Only you see the comment. Your public profile shows the average only (from 3 ratings).",
                )}
              </p>
            </Card>
          ) : null}
          <SeatMessages seatId={seat.seat_id} />
        </>
      ) : null}
    </Shell>
  );
}
