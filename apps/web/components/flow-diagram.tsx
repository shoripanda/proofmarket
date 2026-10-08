"use client";
// One request as a picture: six stages, the active one lit, a pulse travelling along the line.
// Used by /try (driven by the demo's step) and by the home pages (looping on its own).
import { useEffect, useState } from "react";
import { useLang } from "@/lib/client/lang";

export const FLOW_STAGES = [
  { key: "ask", label: "依頼", sub: "エージェントが頼む" },
  { key: "escrow", label: "報酬を預ける", sub: "Solana のエスクローに" },
  { key: "work", label: "人が確かめる", sub: "現地で撮って答える" },
  { key: "check", label: "検査と AI", sub: "場所・時刻・中身" },
  { key: "chain", label: "記録と支払い", sub: "1つの取引で" },
  { key: "result", label: "結果", sub: "証明つきの答え" },
] as const;

const ICONS: Record<(typeof FLOW_STAGES)[number]["key"], string> = {
  // simple line icons (24x24 paths), stroke only
  ask: "M4 6h16v9H9l-5 4V6z",
  escrow: "M5 10h14v9H5zM8 10V7a4 4 0 0 1 8 0v3",
  work: "M12 5a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM5 20a7 7 0 0 1 14 0",
  check: "M4 12l5 5L20 6",
  chain: "M9 15l-3 3a3 3 0 0 1-4-4l4-4a3 3 0 0 1 4 0M15 9l3-3a3 3 0 0 1 4 4l-4 4a3 3 0 0 1-4 0M9 15l6-6",
  result: "M6 3h9l4 4v14H6zM9 12h6M9 16h6",
};

export function FlowDiagram({
  active,
  loop = false,
  compact = false,
  en,
}: {
  /** Index of the lit stage; -1 lights nothing. Ignored while `loop` is on. */
  active?: number;
  /** Cycle through the stages by itself (home pages). */
  loop?: boolean;
  compact?: boolean;
  /** Force English; by default the page language decides. */
  en?: boolean;
}) {
  const lang = useLang();
  const isEn = en ?? lang === "en";
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!loop) return;
    const t = setInterval(() => setI((k) => (k + 1) % FLOW_STAGES.length), 1600);
    return () => clearInterval(t);
  }, [loop]);
  const lit = loop ? i : (active ?? -1);
  const labels = isEn
    ? ["Ask", "Escrow", "A person acts", "Checks + AI", "Record + pay", "Result"]
    : FLOW_STAGES.map((s) => s.label);
  const subs = isEn
    ? [
        "one tool call",
        "bounty on Solana",
        "photo + answer",
        "place, time, content",
        "one transaction",
        "answer with proof",
      ]
    : FLOW_STAGES.map((s) => s.sub);
  const W = 960;
  const n = FLOW_STAGES.length;
  const gap = W / n;
  const y = 44;
  return (
    <svg
      viewBox={`0 0 ${W} ${compact ? 96 : 118}`}
      className="w-full"
      role="img"
      aria-label={labels.join(" → ")}
    >
      <title>{labels.join(" → ")}</title>
      <line x1={gap / 2} y1={y} x2={W - gap / 2} y2={y} stroke="#cbd5e1" strokeWidth="3" />
      {lit >= 0 ? (
        <line
          x1={gap / 2}
          y1={y}
          x2={gap / 2 + gap * lit}
          y2={y}
          stroke="#0f766e"
          strokeWidth="3"
          style={{ transition: "x2 .6s ease" }}
        />
      ) : null}
      {/* travelling pulse */}
      <circle r="6" fill="#0f766e" opacity="0.9">
        <animateMotion dur="3.2s" repeatCount="indefinite" path={`M${gap / 2},${y} L${W - gap / 2},${y}`} />
      </circle>
      {FLOW_STAGES.map((s, k) => {
        const cx = gap / 2 + gap * k;
        const on = k === lit;
        const past = lit >= 0 && k < lit;
        return (
          <g key={s.key} style={{ transition: "opacity .4s" }}>
            <circle
              cx={cx}
              cy={y}
              r={on ? 22 : 18}
              fill={on ? "#0f766e" : past ? "#ccfbf1" : "#ffffff"}
              stroke={on || past ? "#0f766e" : "#94a3b8"}
              strokeWidth={on ? 3 : 2}
              style={{ transition: "all .4s ease" }}
            />
            {on ? (
              <circle cx={cx} cy={y} r="22" fill="none" stroke="#0f766e" strokeWidth="2" opacity="0.5">
                <animate attributeName="r" values="22;34" dur="1.4s" repeatCount="indefinite" />
                <animate attributeName="opacity" values="0.5;0" dur="1.4s" repeatCount="indefinite" />
              </circle>
            ) : null}
            <path
              d={ICONS[s.key]}
              transform={`translate(${cx - 12} ${y - 12})`}
              fill="none"
              stroke={on ? "#ffffff" : past ? "#0f766e" : "#64748b"}
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <text
              x={cx}
              y={y + 42}
              textAnchor="middle"
              fontSize="15"
              fontWeight={on ? 700 : 600}
              fill={on ? "#0f766e" : "#334155"}
            >
              {labels[k]}
            </text>
            {!compact ? (
              <text x={cx} y={y + 62} textAnchor="middle" fontSize="12" fill="#64748b">
                {subs[k]}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
