"use client";
// W-07 判定結果 — 合格/不合格、理由とやり直し方、残り試行回数。
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Button, Card, Notice, Shell } from "@/components/ui";
import { errorText, useApi } from "@/lib/client/api";
import type { ClaimDetail } from "../../../lib-claim";

export default function ResultPage() {
  const { id } = useParams<{ id: string }>();
  const api = useApi();
  const router = useRouter();
  const [c, setC] = useState<ClaimDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const last = c?.submissions.at(-1);
  const reviewing = last?.state === "CHECKING";
  const load = useCallback(
    () => api<ClaimDetail>(`/v1/worker/claims/${id}`).then(setC, (e) => setErr(errorText(e))),
    [api, id],
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

  return (
    <Shell title="判定結果" back="/tasks">
      {err ? <Notice tone="error">{err}</Notice> : null}
      {c && last ? (
        reviewing ? (
          <Card>
            <p className="text-xl font-bold text-sky-700">内容を確認しています</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              写真と答えが依頼どおりかを AI
              が確かめています。ふつうは数分で終わります。この画面は自動で更新されます。
            </p>
          </Card>
        ) : last.state === "VALID" ? (
          <>
            <Card>
              <p className="text-5xl">✓</p>
              <p className="mt-2 text-xl font-bold text-emerald-700">確認できました</p>
              <p className="mt-2 text-sm text-slate-600">
                報酬は確定の処理が終わると届きます。「報酬」から状況を確認できます。
              </p>
            </Card>
            <Button onClick={() => router.push("/payouts")}>報酬を見る</Button>
            <Button variant="secondary" onClick={() => router.push("/tasks")}>
              ほかのタスクを探す
            </Button>
          </>
        ) : (
          <>
            <Card>
              <p className="text-xl font-bold text-rose-700">確認できませんでした</p>
              <p className="mt-2 leading-relaxed">{last.reason_message_ja ?? "もう一度お試しください。"}</p>
              {c.state === "ACTIVE" ? (
                <p className="mt-2 text-sm text-slate-500">あと {c.attempts_remaining} 回やり直せます。</p>
              ) : null}
            </Card>
            {c.state === "ACTIVE" ? (
              <Button onClick={() => router.push(`/claims/${id}/capture`)}>撮り直す</Button>
            ) : (
              <Button variant="secondary" onClick={() => router.push("/tasks")}>
                ほかのタスクを探す
              </Button>
            )}
          </>
        )
      ) : c ? (
        <Notice>まだ送信していません。</Notice>
      ) : null}
    </Shell>
  );
}
