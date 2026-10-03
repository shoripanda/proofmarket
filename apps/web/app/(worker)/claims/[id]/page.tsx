"use client";
// W-05 移動中 — 残り時間、「現地に着いた」、「やめる」。
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Card, Notice, remaining, Shell, useNow } from "@/components/ui";
import { errorText, useApi } from "@/lib/client/api";
import type { ClaimDetail } from "../../lib-claim";

export default function ClaimPage() {
  const { id } = useParams<{ id: string }>();
  const api = useApi();
  const router = useRouter();
  const now = useNow(1000);
  const [c, setC] = useState<ClaimDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<ClaimDetail>(`/v1/worker/claims/${id}`).then(setC, (e) => setErr(errorText(e)));
  }, [api, id]);

  async function abandon() {
    if (!confirm("このタスクをやめますか？ やめても不利益はありません。")) return;
    try {
      await api(`/v1/worker/claims/${id}/abandon`, { method: "POST" });
      router.replace("/tasks");
    } catch (e) {
      setErr(errorText(e));
    }
  }

  const active = c?.state === "ACTIVE";
  return (
    <Shell title="現地へ向かう" back="/tasks">
      {err ? <Notice tone="error">{err}</Notice> : null}
      {c ? (
        <>
          <Card>
            <p className="text-sm text-slate-500">引き受けの残り時間</p>
            <p className="mt-1 text-4xl font-bold tabular-nums">{remaining(c.expires_at, now)}</p>
            <Link
              href={`/tasks/${c.verification_id}`}
              className="mt-3 inline-block text-sm text-teal-700 underline"
            >
              タスクの内容と地図を見る
            </Link>
          </Card>
          {active ? (
            <>
              <Notice>
                お店の前に着いたら「現地に着いた」を押してください。そこから撮影の受付時間が始まります。
              </Notice>
              <Button onClick={() => router.push(`/claims/${id}/capture`)}>
                現地に着いた（撮影を始める）
              </Button>
              <Button variant="danger" onClick={abandon}>
                やめる
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={() => router.push(`/claims/${id}/result`)}>
              結果を見る
            </Button>
          )}
        </>
      ) : null}
    </Shell>
  );
}
