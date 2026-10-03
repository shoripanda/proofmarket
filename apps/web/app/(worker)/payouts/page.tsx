"use client";
// W-08 支払い履歴 — 金額、日時、状態、「取引記録を見る」。
import { useEffect, useState } from "react";
import { Card, Notice, Shell, yen } from "@/components/ui";
import { errorText, useApi } from "@/lib/client/api";

interface Payout {
  verification_id: string;
  amount: string;
  status: "PENDING" | "SUBMITTED" | "SETTLED" | "REFUNDED" | "FAILED_RETRYING";
  explorer_url: string | null;
  paid_at: string | null;
}
const STATUS_JA: Record<Payout["status"], string> = {
  PENDING: "確定待ち",
  SUBMITTED: "処理中",
  SETTLED: "受け取り済み",
  REFUNDED: "—",
  FAILED_RETRYING: "再試行中",
};

export default function PayoutsPage() {
  const api = useApi();
  const [list, setList] = useState<Payout[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<{ payouts: Payout[] }>("/v1/worker/payouts").then(
      (r) => setList(r.payouts),
      (e) => setErr(errorText(e)),
    );
  }, [api]);
  const total = (list ?? []).filter((p) => p.status === "SETTLED").reduce((a, p) => a + Number(p.amount), 0);
  return (
    <Shell title="報酬" back="/tasks">
      {err ? <Notice tone="error">{err}</Notice> : null}
      <Card>
        <p className="text-sm text-slate-500">受け取り済みの合計</p>
        <p className="mt-1 text-3xl font-bold text-teal-700">{yen(String(Math.round(total * 1e6) / 1e6))}</p>
      </Card>
      {list?.length === 0 ? <Notice>まだ報酬はありません。</Notice> : null}
      {list?.map((p) => (
        <Card key={p.verification_id}>
          <div className="flex items-baseline justify-between">
            <span className="text-lg font-bold">{yen(p.amount)}</span>
            <span className="text-sm text-slate-500">{STATUS_JA[p.status]}</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {p.paid_at ? new Date(p.paid_at).toLocaleString("ja-JP") : ""}
          </p>
          {p.explorer_url ? (
            <a
              className="mt-2 inline-block text-sm text-teal-700 underline"
              href={p.explorer_url}
              target="_blank"
              rel="noreferrer"
            >
              取引記録を見る
            </a>
          ) : null}
        </Card>
      ))}
    </Shell>
  );
}
