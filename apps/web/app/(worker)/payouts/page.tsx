"use client";
// W-08 支払い履歴 — 金額、日時、状態、「取引記録を見る」。
import { useEffect, useState } from "react";
import { Button, Card, Notice, Shell, yen } from "@/components/ui";
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

const jstMonth = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString().slice(0, 7); // YYYY-MM in JST
const jstDate = (iso: string) => new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });

/** 01 §4.10: a statement the worker keeps for their own records (and tax review later). */
function downloadCsv(rows: Payout[], month: string) {
  const esc = (v: string) => `"${v.replaceAll('"', '""')}"`;
  const lines = [
    ["日時（日本時間）", "依頼ID", "金額", "資産", "状態", "取引記録"].map(esc).join(","),
    ...rows.map((p) =>
      [
        p.paid_at ? jstDate(p.paid_at) : "",
        p.verification_id,
        p.amount,
        "USDC（テスト用）",
        STATUS_JA[p.status],
        p.explorer_url ?? "",
      ]
        .map(esc)
        .join(","),
    ),
  ];
  const blob = new Blob([`\uFEFF${lines.join("\r\n")}\r\n`], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `proofmarket-payouts-${month}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function PayoutsPage() {
  const api = useApi();
  const [list, setList] = useState<Payout[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [yenInterest, setYenInterest] = useState<boolean | null>(null);
  const [month, setMonth] = useState("");
  useEffect(() => {
    api<{ payouts: Payout[] }>("/v1/worker/payouts").then(
      (r) => setList(r.payouts),
      (e) => setErr(errorText(e)),
    );
    api<{ yen_payout_interest: boolean }>("/v1/worker/me").then(
      (r) => setYenInterest(r.yen_payout_interest),
      () => setYenInterest(null),
    );
  }, [api]);
  const months = [...new Set((list ?? []).filter((p) => p.paid_at).map((p) => jstMonth(p.paid_at ?? "")))]
    .sort()
    .reverse();
  const selected = month || months[0] || "";
  async function toggleYen() {
    try {
      const r = await api<{ yen_payout_interest: boolean }>("/v1/worker/payout-preference", {
        method: "PUT",
        body: { yen_interest: !yenInterest },
      });
      setYenInterest(r.yen_payout_interest);
    } catch (e) {
      setErr(errorText(e));
    }
  }
  const total = (list ?? []).filter((p) => p.status === "SETTLED").reduce((a, p) => a + Number(p.amount), 0);
  return (
    <Shell title="報酬" back="/tasks">
      {err ? <Notice tone="error">{err}</Notice> : null}
      <Card>
        <p className="text-sm text-slate-500">受け取り済みの合計</p>
        <p className="mt-1 text-3xl font-bold text-teal-700">{yen(String(Math.round(total * 1e6) / 1e6))}</p>
      </Card>
      {months.length ? (
        <Card>
          <p className="text-sm font-semibold">明細を書き出す</p>
          <div className="mt-2 flex gap-2">
            <select
              aria-label="月"
              value={selected}
              onChange={(e) => setMonth(e.target.value)}
              className="flex-1 rounded-xl border border-slate-300 px-3 py-2"
            >
              {months.map((m) => (
                <option key={m} value={m}>
                  {m.replace("-", "年")}月
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() =>
                downloadCsv(
                  (list ?? []).filter((p) => p.paid_at && jstMonth(p.paid_at) === selected),
                  selected,
                )
              }
              className="rounded-xl px-4 py-2 text-sm font-semibold text-teal-700 ring-1 ring-teal-700"
            >
              CSV
            </button>
          </div>
        </Card>
      ) : null}
      {yenInterest !== null ? (
        <Card>
          <p className="text-sm font-semibold">円での受け取り</p>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">
            {yenInterest
              ? "希望を受け付けています。始められるようになったら、先にお知らせします。"
              : "いまは Solana のテスト用 USDC だけで払っています。円で受け取りたい方は登録してください。法律の確認が済みしだい、先にご案内します。口座番号などはまだ聞きません。"}
          </p>
          <div className="mt-3">
            <Button variant="secondary" onClick={toggleYen}>
              {yenInterest ? "希望を取り消す" : "円で受け取りたい"}
            </Button>
          </div>
        </Card>
      ) : null}
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
