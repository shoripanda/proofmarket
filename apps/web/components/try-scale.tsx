"use client";
// S-13b 体験・大勢で同時に: one agent asks about ten station elevators at once; ten people answer in parallel;
// each result lands on the map and the agent routes a wheelchair user. Same request shape as production
// (publish: true puts verified facts on the public map). Nothing here touches money or Solana.
import { useEffect, useMemo, useRef, useState } from "react";
import { useLang } from "@/lib/client/lang";
import { type Lang, pick } from "@/lib/lang";
import { FlowDiagram } from "./flow-diagram";
import { Button, Notice } from "./ui";

type St = "queued" | "open" | "claimed" | "submitted" | "verified";
interface Station {
  name: string;
  en: string;
  x: number; // 0..100 on the schematic map
  y: number;
  working: boolean;
  /** seconds after start at which each state is reached (autoplay) */
  t: [number, number, number, number];
}

// Positions are schematic (west→east, north→south), not coordinates.
const STATIONS: Station[] = [
  { name: "新宿", en: "Shinjuku", x: 30, y: 38, working: true, t: [1.5, 4, 8, 11] },
  { name: "渋谷", en: "Shibuya", x: 28, y: 62, working: true, t: [1.8, 6, 10, 13] },
  { name: "池袋", en: "Ikebukuro", x: 34, y: 14, working: true, t: [2.1, 5, 9.5, 14] },
  { name: "東京", en: "Tokyo", x: 66, y: 46, working: true, t: [2.4, 4.5, 9, 12] },
  { name: "品川", en: "Shinagawa", x: 56, y: 82, working: true, t: [2.7, 7, 12, 16] },
  { name: "上野", en: "Ueno", x: 70, y: 20, working: false, t: [3.0, 6.5, 11, 15] },
  { name: "秋葉原", en: "Akihabara", x: 68, y: 34, working: true, t: [3.3, 8, 13, 17] },
  { name: "目黒", en: "Meguro", x: 40, y: 78, working: true, t: [3.6, 9, 14, 18] },
  { name: "中野", en: "Nakano", x: 14, y: 36, working: true, t: [3.9, 10, 15.5, 19] },
  { name: "錦糸町", en: "Kinshicho", x: 86, y: 44, working: true, t: [4.2, 11, 16.5, 20.5] },
];
const BOUNTY = 0.3;

const ST_TEXT: Record<Lang, Record<St, string>> = {
  ja: {
    queued: "依頼中",
    open: "worker 待ち",
    claimed: "向かっている",
    submitted: "確認中",
    verified: "確定",
  },
  en: {
    queued: "requesting",
    open: "waiting",
    claimed: "on the way",
    submitted: "checking",
    verified: "final",
  },
};

function stateAt(s: Station, sec: number): St {
  if (sec >= s.t[3]) return "verified";
  if (sec >= s.t[2]) return "submitted";
  if (sec >= s.t[1]) return "claimed";
  if (sec >= s.t[0]) return "open";
  return "queued";
}

export function TryScale() {
  const lang = useLang();
  const [started, setStarted] = useState(false);
  const [sec, setSec] = useState(0);
  const [speed, setSpeed] = useState<1 | 2>(1);
  const raf = useRef<number | null>(null);
  const t0 = useRef(0);

  useEffect(() => {
    if (!started) return;
    t0.current = performance.now();
    const tick = () => {
      setSec(((performance.now() - t0.current) / 1000) * speed);
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [started, speed]);

  const states = useMemo(() => STATIONS.map((s) => stateAt(s, sec)), [sec]);
  const verified = states.filter((s) => s === "verified").length;
  const done = verified === STATIONS.length;
  const stopped = STATIONS.filter((s, i) => states[i] === "verified" && !s.working);
  const phase = !started
    ? 0
    : sec < 1.5
      ? 1
      : verified === 0
        ? 2
        : !done
          ? 3
          : sec < (STATIONS.at(-1)?.t[3] ?? 0) + 2.5
            ? 4
            : 5;
  const feed = STATIONS.flatMap((s, i) =>
    (["open", "claimed", "submitted", "verified"] as St[])
      .map((st, k) => ({ at: s.t[k] ?? 0, st, s, i }))
      .filter((e) => e.at <= sec),
  )
    .sort((a, b) => b.at - a.at)
    .slice(0, 7);

  const reset = () => {
    setStarted(false);
    setSec(0);
  };

  const name = (s: Station) => pick(lang, s.name, s.en);
  const QUESTION = pick(
    lang,
    "駅のエレベーター（改札内から地上）は、いま動いていますか？",
    "Is the station lift (from inside the gates to street level) running right now?",
  );
  const working = pick(lang, "動いている", "running");
  const stoppedText = pick(lang, "停止中", "out of service");
  const total = (BOUNTY * 10).toFixed(2);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-sm">
        <span className="font-semibold text-slate-700">
          {!started
            ? pick(lang, "10駅を一斉に頼む", "Ask about 10 stations at once")
            : done
              ? pick(lang, "10駅すべて確定", "All 10 stations final")
              : pick(lang, `${verified} / 10 駅が確定`, `${verified} / 10 stations final`)}
        </span>
        <span className="text-slate-400">·</span>
        {!started ? (
          <button
            type="button"
            onClick={() => setStarted(true)}
            className="rounded-full px-3 py-1 font-semibold text-teal-700 ring-1 ring-teal-700"
          >
            {pick(lang, "再生する", "Play")}
          </button>
        ) : (
          <button
            type="button"
            onClick={reset}
            className="rounded-full px-3 py-1 font-semibold text-slate-600 ring-1 ring-slate-300"
          >
            {pick(lang, "最初から", "Restart")}
          </button>
        )}
        <span className="ml-auto flex items-center gap-1 text-xs text-slate-500">
          {pick(lang, "速さ", "Speed")}
          {([1, 2] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setSpeed(v)}
              className={`rounded-full px-2 py-0.5 font-semibold ${speed === v ? "bg-teal-700 text-white" : "text-slate-600 ring-1 ring-slate-300"}`}
            >
              {v}x
            </button>
          ))}
        </span>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white px-2 py-3">
        <FlowDiagram active={phase} compact />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_24rem] lg:items-start">
        {/* agent */}
        <section className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <p className="text-xs font-semibold tracking-wide text-slate-500">
            {pick(lang, "AI エージェント（依頼する側）", "AI agent (the requester)")}
          </p>
          <div className="flex justify-end">
            <div className="max-w-[92%] rounded-2xl bg-teal-700 px-4 py-3 text-sm leading-relaxed text-white">
              {pick(
                lang,
                "車いすで、今日の午後に都内を回る。新宿・渋谷・池袋・東京・品川・上野・秋葉原・目黒・中野・錦糸町のエレベーターが、いま動いているか知りたい。",
                "I'm in a wheelchair and crossing Tokyo this afternoon. Are the lifts at Shinjuku, Shibuya, Ikebukuro, Tokyo, Shinagawa, Ueno, Akihabara, Meguro, Nakano and Kinshicho running right now?",
              )}
            </div>
          </div>
          {!started ? (
            <>
              <div className="rounded-xl border border-dashed border-slate-300 bg-white/60 px-3 py-2 text-xs leading-relaxed text-slate-600">
                <p className="font-semibold text-slate-500">
                  {pick(lang, "エージェントの考え", "Agent's reasoning")}
                </p>
                {pick(
                  lang,
                  `鉄道会社の運行情報は駅ごとのエレベーターまで載っていない。10駅を人に見てもらう。1駅 ${BOUNTY} USDC × 10 = ${total} USDC。結果は公開（publish）して、同じ道を通る次の人にも使えるようにする。`,
                  `The railway's service page doesn't cover individual lifts. Ask people to look at all 10 stations: ${BOUNTY} USDC × 10 = ${total} USDC. Publish the results so the next person on the same route can use them.`,
                )}
              </div>
              <Button onClick={() => setStarted(true)}>
                {pick(lang, "10 件の依頼を一斉に出す", "Send 10 requests at once")}
              </Button>
            </>
          ) : null}
          {started ? (
            <div className="fade-in-up rounded-2xl border border-slate-200 bg-white p-4">
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-teal-700 px-2 py-0.5 text-[11px] font-bold text-white">
                  {pick(lang, "依頼 × 10", "Request × 10")}
                </span>
                <span className="text-xs text-slate-500">request_reality_verification (publish: true)</span>
              </div>
              <p className="mt-2 text-sm font-semibold text-slate-900">{QUESTION}</p>
              <ul className="mt-3 grid grid-cols-2 gap-1.5 sm:grid-cols-5">
                {STATIONS.map((s, i) => {
                  const st = states[i] ?? "queued";
                  const ok = st === "verified";
                  return (
                    <li
                      key={s.name}
                      className={`rounded-lg px-2 py-1.5 text-center text-xs transition ${ok ? (s.working ? "bg-emerald-50 text-emerald-900 ring-1 ring-emerald-300" : "bg-rose-50 text-rose-900 ring-1 ring-rose-300") : st === "queued" ? "bg-slate-100 text-slate-400" : "bg-sky-50 text-sky-900 ring-1 ring-sky-200"}`}
                    >
                      <p className="font-bold">{name(s)}</p>
                      <p className="text-[11px]">
                        {ok ? (s.working ? working : stoppedText) : ST_TEXT[lang][st]}
                      </p>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-3 text-xs text-slate-500">
                {pick(
                  lang,
                  `エスクロー ${total} USDC・確定 ${verified}/10・経過 ${Math.floor(sec)} 秒（本番では 10〜60 分）`,
                  `Escrow ${total} USDC · final ${verified}/10 · ${Math.floor(sec)} s elapsed (10–60 min in production)`,
                )}
              </p>
            </div>
          ) : null}
          {done ? (
            <>
              <div className="fade-in-up rounded-2xl bg-white px-4 py-3 text-sm leading-relaxed text-slate-800 ring-1 ring-slate-200">
                <p>{pick(lang, "10駅を人に確かめてもらいました。", "People checked all 10 stations.")}</p>
                <p className="mt-1">
                  <b className="text-emerald-700">
                    {pick(lang, "9駅は動いています。", "Lifts at 9 stations are running.")}
                  </b>
                  {stopped.length ? (
                    <>
                      {" "}
                      <b className="text-rose-700">
                        {pick(
                          lang,
                          `${stopped.map(name).join("・")}は停止中`,
                          `${stopped.map(name).join(", ")} is out of service`,
                        )}
                      </b>
                      {pick(
                        lang,
                        "です。上野へは、秋葉原で降りてエレベーターのある東口から地上に出る道を案内します。",
                        ". For Ueno, I'll route you via Akihabara, where the east exit has a working lift to street level.",
                      )}
                    </>
                  ) : null}
                </p>
                <p className="mt-2 text-xs text-slate-500">
                  {pick(
                    lang,
                    `10件すべてに「人が確認」のバッジと証明のリンクが付き、結果はみんなの地図に72時間載ります。費用 ${total} USDC。`,
                    `All 10 come with a human-verified badge and a proof link, and stay on the public map for 72 hours. Cost: ${total} USDC.`,
                  )}
                </p>
              </div>
              <Notice tone="ok">
                {pick(
                  lang,
                  "1件の依頼と同じ仕組みを、同時に10件出しただけです。50件でも、毎朝の繰り返し（見守り）でも、同じように動きます。",
                  "This is the single-request flow, sent 10 times at once. It works the same for 50, or repeated every morning as a watch.",
                )}
              </Notice>
            </>
          ) : null}
        </section>

        {/* map + feed */}
        <section className="space-y-3 lg:sticky lg:top-20">
          <p className="text-center text-xs font-semibold tracking-wide text-slate-500">
            {pick(lang, "都内の10駅（模式図）", "10 stations in Tokyo (schematic)")}
          </p>
          <svg
            viewBox="0 0 100 100"
            className="w-full rounded-2xl border border-slate-200 bg-slate-50"
            role="img"
            aria-label={pick(lang, "10駅の確認の進み具合", "Progress across the 10 stations")}
          >
            <title>{pick(lang, "10駅の確認の進み具合", "Progress across the 10 stations")}</title>
            <path
              d="M14 36 L30 38 L34 14 M30 38 L28 62 L40 78 L56 82 M30 38 L66 46 L86 44 M66 46 L68 34 L70 20 M66 46 L56 82"
              fill="none"
              stroke="#cbd5e1"
              strokeWidth="1.2"
            />
            {STATIONS.map((s, i) => {
              const st = states[i] ?? "queued";
              const fill =
                st === "verified"
                  ? s.working
                    ? "#059669"
                    : "#e11d48"
                  : st === "queued"
                    ? "#cbd5e1"
                    : "#0ea5e9";
              return (
                <g key={s.name}>
                  {st !== "queued" && st !== "verified" ? (
                    <circle
                      cx={s.x}
                      cy={s.y}
                      r="3"
                      fill="none"
                      stroke="#0ea5e9"
                      strokeWidth="0.6"
                      opacity="0.6"
                    >
                      <animate attributeName="r" values="3;6" dur="1.2s" repeatCount="indefinite" />
                      <animate attributeName="opacity" values="0.6;0" dur="1.2s" repeatCount="indefinite" />
                    </circle>
                  ) : null}
                  <circle
                    cx={s.x}
                    cy={s.y}
                    r="2.6"
                    fill={fill}
                    stroke="#fff"
                    strokeWidth="0.7"
                    style={{ transition: "fill .4s" }}
                  />
                  <text
                    x={s.x}
                    y={s.y + 6}
                    textAnchor="middle"
                    fontSize={lang === "en" ? "3" : "3.6"}
                    fill="#334155"
                    fontWeight="600"
                  >
                    {name(s)}
                  </text>
                </g>
              );
            })}
            <g fontSize="3" fill="#64748b">
              <circle cx="6" cy="94" r="1.6" fill="#059669" />
              <text x="9" y="95">
                {working}
              </text>
              <circle cx="30" cy="94" r="1.6" fill="#e11d48" />
              <text x="33" y="95">
                {stoppedText}
              </text>
              <circle cx="58" cy="94" r="1.6" fill="#0ea5e9" />
              <text x="61" y="95">
                {pick(lang, "確認中", "checking")}
              </text>
            </g>
          </svg>
          <div className="rounded-2xl border border-slate-200 bg-white p-3">
            <p className="text-xs font-semibold text-slate-500">
              {pick(lang, "worker たちの動き", "What the workers are doing")}
            </p>
            {feed.length === 0 ? (
              <p className="mt-2 text-xs text-slate-400">
                {pick(lang, "依頼を出すと、ここに流れます。", "Send the requests and events appear here.")}
              </p>
            ) : (
              <ul className="mt-2 space-y-1 text-xs text-slate-700">
                {feed.map((e) => (
                  <li key={`${e.s.name}-${e.st}`} className="fade-in-up flex items-center gap-2">
                    <span className="w-8 shrink-0 text-right text-slate-400">{Math.floor(e.at)}s</span>
                    <span className="font-semibold">{name(e.s)}</span>
                    <span>
                      {e.st === "open"
                        ? pick(lang, "依頼が一覧に出た", "request listed")
                        : e.st === "claimed"
                          ? pick(
                              lang,
                              `worker ${String.fromCharCode(65 + e.i)} が引き受けた`,
                              `worker ${String.fromCharCode(65 + e.i)} claimed it`,
                            )
                          : e.st === "submitted"
                            ? pick(
                                lang,
                                "写真と答えを提出 → 検査と AI の確認",
                                "photo + answer submitted → checks and AI review",
                              )
                            : pick(
                                lang,
                                `確定：${e.s.working ? "動いている" : "停止中"}（地図に公開）`,
                                `final: ${e.s.working ? "running" : "out of service"} (published to the map)`,
                              )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
