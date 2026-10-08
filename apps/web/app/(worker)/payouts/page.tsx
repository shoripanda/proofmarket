"use client";
// W-08 支払い履歴 — 金額、日時、状態、「取引記録を見る」。
import { useEffect, useState } from "react";
import { Button, Card, Notice, Shell, yen } from "@/components/ui";
import { errorText, useApi } from "@/lib/client/api";
import { useLang } from "@/lib/client/lang";
import { dateLocale, type Lang, pick } from "@/lib/lang";

interface Payout {
  verification_id: string;
  amount: string;
  status: "PENDING" | "SUBMITTED" | "SETTLED" | "REFUNDED" | "FAILED_RETRYING";
  explorer_url: string | null;
  paid_at: string | null;
}
const STATUS_TEXT: Record<Lang, Record<Payout["status"], string>> = {
  ja: {
    PENDING: "確定待ち",
    SUBMITTED: "処理中",
    SETTLED: "受け取り済み",
    REFUNDED: "—",
    FAILED_RETRYING: "再試行中",
  },
  en: {
    PENDING: "awaiting final",
    SUBMITTED: "processing",
    SETTLED: "received",
    REFUNDED: "—",
    FAILED_RETRYING: "retrying",
  },
};

interface Trust {
  tier: "restricted" | "new" | "standard" | "trusted";
  record: { valid: number; violations: number; compared: number; agreed: number };
}
const TIER_TEXT: Record<Lang, Record<Trust["tier"], { name: string; note: string }>> = {
  ja: {
    new: { name: "はじめたばかり", note: "有効な提出が3件になると「標準」になります。" },
    standard: {
      name: "標準",
      note: "有効な提出が10件以上で、複数人の依頼で確定した答えと90%以上同じなら「信頼」になります。",
    },
    trusted: { name: "信頼", note: "「信頼」の人だけに出る依頼も受けられます。" },
    restricted: {
      name: "制限中",
      note: "直近90日に、写真の使い回しかほぼ同じ写真で落ちた提出があります。1人だけで確定する依頼は受けられません。間違いだと思うときは運営者に知らせてください。",
    },
  },
  en: {
    new: { name: "Just started", note: "You become Standard after 3 valid submissions." },
    standard: {
      name: "Standard",
      note: "With 10 or more valid submissions, and answers that match the final result on multi-person requests at least 90% of the time, you become Trusted.",
    },
    trusted: { name: "Trusted", note: "You can also take requests open only to trusted workers." },
    restricted: {
      name: "Restricted",
      note: "In the last 90 days a submission was rejected for a reused or near-identical photo. You cannot take requests that a single person finalises. If you think this is a mistake, tell the operator.",
    },
  },
};

const jstMonth = (iso: string) => new Date(new Date(iso).getTime() + 9 * 3600_000).toISOString().slice(0, 7); // YYYY-MM in JST
const jstDate = (iso: string, lang: Lang) =>
  new Date(iso).toLocaleString(dateLocale(lang), { timeZone: "Asia/Tokyo" });

/** 01 §4.10: a statement the worker keeps for their own records (and tax review later). */
function downloadCsv(rows: Payout[], month: string, lang: Lang) {
  const esc = (v: string) => `"${v.replaceAll('"', '""')}"`;
  const head = pick(
    lang,
    ["日時（日本時間）", "依頼ID", "金額", "資産", "状態", "取引記録"],
    ["Time (Japan)", "Request ID", "Amount", "Asset", "Status", "Transaction"],
  );
  const lines = [
    head.map(esc).join(","),
    ...rows.map((p) =>
      [
        p.paid_at ? jstDate(p.paid_at, lang) : "",
        p.verification_id,
        p.amount,
        pick(lang, "USDC（テスト用）", "USDC (test)"),
        STATUS_TEXT[lang][p.status],
        p.explorer_url ?? "",
      ]
        .map(esc)
        .join(","),
    ),
  ];
  const blob = new Blob([`﻿${lines.join("\r\n")}\r\n`], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `proofmarket-payouts-${month}.csv`;
  a.click();
  URL.revokeObjectURL(a.href);
}

export default function PayoutsPage() {
  const lang = useLang();
  const api = useApi();
  const [list, setList] = useState<Payout[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [yenInterest, setYenInterest] = useState<boolean | null>(null);
  const [trust, setTrust] = useState<Trust | null>(null);
  const [month, setMonth] = useState("");
  useEffect(() => {
    api<{ payouts: Payout[] }>("/v1/worker/payouts").then(
      (r) => setList(r.payouts),
      (e) => setErr(errorText(e, lang)),
    );
    api<{ yen_payout_interest: boolean; trust?: Trust }>("/v1/worker/me").then(
      (r) => {
        setYenInterest(r.yen_payout_interest);
        setTrust(r.trust ?? null);
      },
      () => setYenInterest(null),
    );
  }, [api, lang]);
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
      setErr(errorText(e, lang));
    }
  }
  const total = (list ?? []).filter((p) => p.status === "SETTLED").reduce((a, p) => a + Number(p.amount), 0);
  const monthLabel = (m: string) =>
    lang === "en"
      ? new Date(`${m}-15T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric" })
      : `${m.replace("-", "年")}月`;
  return (
    <Shell title={pick(lang, "報酬", "Earnings")} back="/tasks">
      {err ? <Notice tone="error">{err}</Notice> : null}
      <Card>
        <p className="text-sm text-slate-500">{pick(lang, "受け取り済みの合計", "Total received")}</p>
        <p className="mt-1 text-3xl font-bold text-teal-700">{yen(String(Math.round(total * 1e6) / 1e6))}</p>
      </Card>
      {trust ? (
        <Card>
          <p className="text-sm text-slate-500">
            {pick(lang, "あなたの記録（直近90日）", "Your record (last 90 days)")}
          </p>
          <p className="mt-1 text-xl font-bold">{TIER_TEXT[lang][trust.tier].name}</p>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">{TIER_TEXT[lang][trust.tier].note}</p>
          <p className="mt-2 text-xs text-slate-500">
            {pick(
              lang,
              `有効な提出 ${trust.record.valid}件・複数人の依頼で確定した答えと同じ ${trust.record.agreed}/${trust.record.compared}件`,
              `${trust.record.valid} valid submissions · matched the final answer on ${trust.record.agreed}/${trust.record.compared} multi-person requests`,
            )}
          </p>
        </Card>
      ) : null}
      {months.length ? (
        <Card>
          <p className="text-sm font-semibold">{pick(lang, "明細を書き出す", "Export a statement")}</p>
          <div className="mt-2 flex gap-2">
            <select
              aria-label={pick(lang, "月", "Month")}
              value={selected}
              onChange={(e) => setMonth(e.target.value)}
              className="flex-1 rounded-xl border border-slate-300 px-3 py-2"
            >
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() =>
                downloadCsv(
                  (list ?? []).filter((p) => p.paid_at && jstMonth(p.paid_at) === selected),
                  selected,
                  lang,
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
          <p className="text-sm font-semibold">{pick(lang, "円での受け取り", "Payment in yen")}</p>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">
            {yenInterest
              ? pick(
                  lang,
                  "希望を受け付けています。始められるようになったら、先にお知らせします。",
                  "Your interest is registered. You will be among the first to hear when it becomes available.",
                )
              : pick(
                  lang,
                  "いまは Solana のテスト用 USDC だけで払っています。円で受け取りたい方は登録してください。法律の確認が済みしだい、先にご案内します。口座番号などはまだ聞きません。",
                  "Right now we pay only in test USDC on Solana. Register your interest if you would like to be paid in yen; once the legal review is done, you will hear first. No bank details are asked for yet.",
                )}
          </p>
          <div className="mt-3">
            <Button variant="secondary" onClick={toggleYen}>
              {yenInterest
                ? pick(lang, "希望を取り消す", "Withdraw interest")
                : pick(lang, "円で受け取りたい", "I'd like to be paid in yen")}
            </Button>
          </div>
        </Card>
      ) : null}
      {list?.length === 0 ? (
        <Notice>{pick(lang, "まだ報酬はありません。", "No earnings yet.")}</Notice>
      ) : null}
      {list?.map((p) => (
        <Card key={p.verification_id}>
          <div className="flex items-baseline justify-between">
            <span className="text-lg font-bold">{yen(p.amount)}</span>
            <span className="text-sm text-slate-500">{STATUS_TEXT[lang][p.status]}</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">{p.paid_at ? jstDate(p.paid_at, lang) : ""}</p>
          {p.explorer_url ? (
            <a
              className="mt-2 inline-block text-sm text-teal-700 underline"
              href={p.explorer_url}
              target="_blank"
              rel="noreferrer"
            >
              {pick(lang, "取引記録を見る", "View the transaction")}
            </a>
          ) : null}
        </Card>
      ))}
    </Shell>
  );
}
