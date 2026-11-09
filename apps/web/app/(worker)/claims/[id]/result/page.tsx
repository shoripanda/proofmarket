"use client";
// W-07 Verdict — pass/fail, the reason and how to retry, attempts left.
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button, Card, Loading, Notice, Shell } from "@/components/ui";
import { errorText, useApi } from "@/lib/client/api";
import { useLang } from "@/lib/client/lang";
import { langHref, pick } from "@/lib/lang";
import { reasonText } from "@/lib/reasons";
import { type ClaimDetail, useClaimCues } from "../../../lib-claim";

export default function ResultPage() {
  const lang = useLang();
  const { id } = useParams<{ id: string }>();
  const api = useApi();
  const router = useRouter();
  const [c, setC] = useState<ClaimDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const go = (p: string) => router.push(langHref(lang, p));
  useClaimCues(c);

  const last = c?.submissions.at(-1);
  const reviewing = last?.state === "CHECKING";
  const load = useCallback(
    () => api<ClaimDetail>(`/v1/worker/claims/${id}`).then(setC, (e) => setErr(errorText(e, lang))),
    [api, id, lang],
  );
  useEffect(() => {
    void load();
  }, [load]);
  // While the AI review is pending (01 §4.17), poll until the verdict arrives.
  useEffect(() => {
    if (!reviewing) return;
    const t = setInterval(load, 15_000);
    return () => clearInterval(t);
  }, [load, reviewing]);

  const reason = reasonText(lang, last) ?? pick(lang, "もう一度お試しください。", "Please try again.");

  return (
    <Shell title={pick(lang, "判定結果", "Verdict")} back="/tasks">
      {err ? <Notice tone="error">{err}</Notice> : null}
      {!c && !err ? <Loading /> : null}
      {c && last ? (
        reviewing ? (
          <Card>
            <p className="text-xl font-bold text-sky-700">
              {pick(lang, "内容を確認しています", "Checking the submission")}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              {pick(lang, "この画面は自動で更新されます。", "The screen updates by itself.")}
            </p>
          </Card>
        ) : last.state === "VALID" ? (
          <>
            <Card>
              <div className="flex flex-col items-center py-4 text-center">
                <SuccessMark />
                <p className="mt-4 text-2xl font-bold text-teal-800">
                  {pick(lang, "確認できました", "Accepted")}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">
                  {pick(
                    lang,
                    "ありがとうございました。報酬の状況は「報酬」の画面で確かめられます。",
                    "Thank you. You can follow your payment under Earnings.",
                  )}
                </p>
              </div>
            </Card>
            <Button onClick={() => go("/payouts")}>{pick(lang, "報酬を見る", "See earnings")}</Button>
            <Button variant="secondary" onClick={() => go("/tasks")}>
              {pick(lang, "ほかのタスクを探す", "Find other tasks")}
            </Button>
          </>
        ) : (
          <>
            <Card>
              <p className="text-xl font-bold text-rose-700">
                {pick(lang, "確認できませんでした", "Not accepted")}
              </p>
              <p className="mt-2 leading-relaxed">{reason}</p>
              {c.state === "ACTIVE" ? (
                <p className="mt-2 text-sm text-slate-500">
                  {pick(
                    lang,
                    `あと ${c.attempts_remaining} 回やり直せます。`,
                    `${c.attempts_remaining} ${c.attempts_remaining === 1 ? "attempt" : "attempts"} left.`,
                  )}
                </p>
              ) : null}
            </Card>
            {c.state === "ACTIVE" ? (
              <Button onClick={() => go(`/claims/${id}/capture`)}>{pick(lang, "撮り直す", "Retake")}</Button>
            ) : (
              <Button variant="secondary" onClick={() => go("/tasks")}>
                {pick(lang, "ほかのタスクを探す", "Find other tasks")}
              </Button>
            )}
          </>
        )
      ) : c ? (
        <Notice>{pick(lang, "まだ送信していません。", "Nothing submitted yet.")}</Notice>
      ) : null}
    </Shell>
  );
}

/** A teal circle and check that draw themselves once (globals.css .success-mark; static under reduced motion). */
function SuccessMark() {
  return (
    <svg viewBox="0 0 56 56" className="success-mark size-20 text-teal-700" aria-hidden="true">
      <circle
        cx="28"
        cy="28"
        r="24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        className="opacity-25"
      />
      <circle
        cx="28"
        cy="28"
        r="24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3.5"
        transform="rotate(-90 28 28)"
        className="draw"
      />
      <path
        className="draw"
        d="M17 29l7.5 7.5L39.5 21"
        fill="none"
        stroke="currentColor"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
