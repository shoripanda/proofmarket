"use client";
// Cards that show what the agent sends and gets back, instead of raw JSON (the JSON stays behind a toggle).
import type { ReactNode } from "react";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 py-1.5 last:border-0">
      <dt className="shrink-0 text-xs text-slate-500">{label}</dt>
      <dd className="text-right text-sm font-semibold text-slate-800">{children}</dd>
    </div>
  );
}

export function RawJson({ title, value }: { title: string; value: unknown }) {
  return (
    <details className="mt-2 text-xs">
      <summary className="cursor-pointer font-mono text-slate-500">{title}</summary>
      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-slate-900 p-3 font-mono text-[11px] leading-relaxed text-slate-100">
        {JSON.stringify(value, null, 2)}
      </pre>
    </details>
  );
}

/** What the agent asked for, at a glance. */
export function RequestCard({
  typeName,
  question,
  place,
  deadlineMin,
  bounty,
  witnesses,
  raw,
}: {
  typeName: string;
  question: string;
  place: string;
  deadlineMin: number;
  bounty: string;
  witnesses: number;
  raw: unknown;
}) {
  return (
    <div className="fade-in-up rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-teal-700 px-2 py-0.5 text-[11px] font-bold text-white">依頼</span>
        <span className="text-xs text-slate-500">request_reality_verification</span>
      </div>
      <p className="mt-2 text-sm font-semibold leading-snug text-slate-900">{question}</p>
      <dl className="mt-3">
        <Row label="種類">{typeName}</Row>
        <Row label="場所">{place}</Row>
        <Row label="締め切り">{deadlineMin}分以内</Row>
        <Row label="確かめる人数">{witnesses}人</Row>
        <Row label="報酬（1人）">
          <span className="text-teal-700">{bounty} USDC</span>
        </Row>
      </dl>
      <RawJson title="生の JSON を見る" value={raw} />
    </div>
  );
}

/** The state the agent sees while it waits: a status pill and who is doing what. */
export function StatusCard({
  status,
  escrow,
  activeClaims,
  raw,
}: {
  status: "CREATED" | "OPEN" | "CLAIMED" | "SUBMITTED";
  escrow: "pending" | "locked";
  activeClaims: number;
  raw: unknown;
}) {
  const STATUS_JA: Record<typeof status, string> = {
    CREATED: "受け付けました",
    OPEN: "worker を待っています",
    CLAIMED: "worker が向かっています",
    SUBMITTED: "提出を確かめています",
  };
  return (
    <div className="fade-in-up rounded-2xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">get_reality_verification</span>
        <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-bold text-sky-800 ring-1 ring-sky-200">
          {status}・{STATUS_JA[status]}
        </span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-center text-sm">
        <div
          className={`rounded-xl p-3 ${escrow === "locked" ? "bg-teal-50 text-teal-900" : "bg-slate-50 text-slate-500"}`}
        >
          <p className="text-[11px]">エスクロー</p>
          <p className="mt-0.5 font-bold">{escrow === "locked" ? "預かり済み" : "預けています…"}</p>
        </div>
        <div
          className={`rounded-xl p-3 ${activeClaims ? "bg-amber-50 text-amber-900" : "bg-slate-50 text-slate-500"}`}
        >
          <p className="text-[11px]">worker</p>
          <p className="mt-0.5 font-bold">{activeClaims ? `${activeClaims}人が作業中` : "探しています…"}</p>
        </div>
      </div>
      <RawJson title="生の JSON を見る" value={raw} />
    </div>
  );
}

/** A tick that draws itself, for the checks list. */
function Tick({ on, delayMs }: { on: boolean; delayMs: number }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill={on ? "#0f766e" : "#e2e8f0"} style={{ transition: "fill .3s" }} />
      {on ? (
        <path
          d="M7 12.5l3 3 7-7"
          fill="none"
          stroke="#fff"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="20"
          strokeDashoffset="20"
          style={{ animation: `draw .35s ease-out ${delayMs}ms forwards` }}
        />
      ) : null}
    </svg>
  );
}

const CHECK_LABELS: [string, string][] = [
  ["geofence", "指定の場所で撮った"],
  ["freshness", "いま撮った"],
  ["task_nonce", "この依頼のために撮った"],
  ["replay", "使い回しではない"],
  ["duplicate", "ほかの人の写真と同じでない"],
  ["vision_consistency", "AI：依頼どおりの内容"],
];

/** The verified result: answer, checks ticking on, the AI verdict, money moving on Solana, the proof badge. */
export function ResultCard({
  answerLines,
  settled,
  bounty,
  reviewReason,
  proofUrl,
  badgeTime,
  raw,
}: {
  answerLines: string[];
  settled: boolean;
  bounty: string;
  reviewReason: string;
  proofUrl: string;
  badgeTime: string;
  raw: unknown;
}) {
  return (
    <div className="fade-in-up rounded-2xl border border-teal-300 bg-teal-50 p-4">
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-teal-700 px-2 py-0.5 text-[11px] font-bold text-white">結果</span>
        <span className="text-xs font-semibold text-teal-900">VERIFIED・人が確かめた結果</span>
      </div>
      <div className="mt-3 rounded-xl bg-white p-3">
        <p className="text-[11px] text-slate-500">答え（書き起こし）</p>
        <p className="mt-1 whitespace-pre-wrap text-sm font-semibold leading-relaxed text-slate-900">
          {answerLines.join("\n")}
        </p>
      </div>
      <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
        {CHECK_LABELS.map(([k, label], i) => (
          <li key={k} className="flex items-center gap-2 text-xs text-slate-700">
            <Tick on delayMs={120 * i} />
            {label}
          </li>
        ))}
      </ul>
      <p className="mt-2 rounded-lg bg-white/70 px-3 py-2 text-xs leading-relaxed text-slate-600">
        AI の判定: <b className="text-teal-800">pass</b> — {reviewReason}
      </p>

      {/* money moving: escrow -> worker */}
      <div className="mt-3 rounded-xl bg-white p-3">
        <p className="text-[11px] text-slate-500">Solana Devnet・記録と支払い</p>
        <svg
          viewBox="0 0 320 60"
          className="mt-1 w-full"
          role="img"
          aria-label="エスクローから worker へ支払い"
        >
          <title>エスクローから worker へ支払い</title>
          <rect x="6" y="14" width="96" height="32" rx="8" fill="#f1f5f9" stroke="#94a3b8" />
          <text x="54" y="34" textAnchor="middle" fontSize="12" fill="#334155">
            エスクロー
          </text>
          <rect
            x="218"
            y="14"
            width="96"
            height="32"
            rx="8"
            fill={settled ? "#ccfbf1" : "#f1f5f9"}
            stroke="#0f766e"
          />
          <text x="266" y="34" textAnchor="middle" fontSize="12" fill="#134e4a">
            worker
          </text>
          <line x1="104" y1="30" x2="216" y2="30" stroke="#94a3b8" strokeWidth="2" strokeDasharray="4 4" />
          <g>
            <rect x="-26" y="-9" width="52" height="18" rx="9" fill="#0f766e" />
            <text x="0" y="4" textAnchor="middle" fontSize="10" fontWeight="700" fill="#fff">
              {bounty} USDC
            </text>
            <animateMotion
              dur="1.6s"
              repeatCount={settled ? "1" : "indefinite"}
              fill="freeze"
              path="M130,30 L190,30"
            />
          </g>
        </svg>
        <p className="mt-1 text-[11px] text-slate-500">
          {settled
            ? "結果のハッシュと支払いを1つの取引で記録しました。"
            : "結果のハッシュを記録し、支払っています…"}
        </p>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        <span className="inline-flex overflow-hidden rounded-md text-[11px] font-semibold text-white">
          <span className="bg-slate-700 px-2 py-0.5">人が確認</span>
          <span className="bg-teal-700 px-2 py-0.5">回答あり・{badgeTime}</span>
        </span>
        <span className="text-slate-500">{proofUrl}</span>
      </div>
      <RawJson title="生の JSON を見る" value={raw} />
    </div>
  );
}
