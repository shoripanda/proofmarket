"use client";
// W-07 判定結果 — 合格/不合格、理由とやり直し方、残り試行回数。
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button, Card, Notice, Shell } from "@/components/ui";
import { errorText, useApi } from "@/lib/client/api";
import { useLang } from "@/lib/client/lang";
import { langHref, pick } from "@/lib/lang";
import { reasonText } from "@/lib/reasons";
import type { ClaimDetail } from "../../../lib-claim";

export default function ResultPage() {
  const lang = useLang();
  const { id } = useParams<{ id: string }>();
  const api = useApi();
  const router = useRouter();
  const [c, setC] = useState<ClaimDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const go = (p: string) => router.push(langHref(lang, p));

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
      {c && last ? (
        reviewing ? (
          <Card>
            <p className="text-xl font-bold text-sky-700">
              {pick(lang, "内容を確認しています", "Checking the submission")}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              {pick(
                lang,
                "写真と答えが依頼どおりかを AI が確かめています。ふつうは数分で終わります。この画面は自動で更新されます。",
                "AI is checking that the photo and the answer match the request. This usually takes a few minutes. The screen updates by itself.",
              )}
            </p>
          </Card>
        ) : last.state === "VALID" ? (
          <>
            <Card>
              <p className="text-5xl">✓</p>
              <p className="mt-2 text-xl font-bold text-emerald-700">
                {pick(lang, "確認できました", "Accepted")}
              </p>
              <p className="mt-2 text-sm text-slate-600">
                {pick(
                  lang,
                  "報酬は確定の処理が終わると届きます。「報酬」から状況を確認できます。",
                  "The bounty arrives once the request is finalised. Check the status under Earnings.",
                )}
              </p>
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
