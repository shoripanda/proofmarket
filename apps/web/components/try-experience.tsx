"use client";
// S-13 体験ページ (/try). One person plays both sides in the browser: the agent that asks (left) and the worker's
// phone (right). Screens, wording, JSON shapes and the review rule mirror production; nothing here touches the
// database, the balance or Solana. IDs, signatures and the photo are samples.
import type { TaskType } from "@proofmarket/core";
import Link from "next/link";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { TASK_TYPE_JA } from "@/lib/answers";
import { Button, Card, Notice, remaining, SAFETY_NOTES, useNow } from "./ui";

// ---------- the scenario ----------

const TYPE: TaskType = "SIGN_TRANSCRIPTION";
const QUESTION = "入口に貼ってある営業時間の掲示を、書いてあるとおりに書き起こしてください。";
const SIGN_LINES = [
  "営業時間",
  "平日 11:00〜20:00",
  "土曜 11:00〜18:00",
  "日曜・祝日 定休",
  "ラストオーダー 19:30",
];
const EXACT = SIGN_LINES.join("\n");
const SUMMARY = "平日は11時から20時まで。土曜は18時まで。日曜は休み。";
const BOUNTY = "0.30";
const PLACE = { lat: 35.6595, lng: 139.7005, radius_m: 80 };
const IDS = {
  verification: "ver_01TRY0000000000000000DEMO1",
  claim: "clm_01TRY0000000000000000DEMO1",
  fundTx: "3TryFundEscrow11111111111111111111111111111111111111111111111111111111111111111111111",
  settleTx: "5TrySettlePayout1111111111111111111111111111111111111111111111111111111111111111111111",
};
const explorer = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

type Step =
  | "intro"
  | "requesting" // agent sends the tool call
  | "funding" // escrow on Solana
  | "open" // task listed for workers
  | "detail"
  | "claimed"
  | "capture"
  | "checking" // machine checks + AI review
  | "rejected"
  | "verified"
  | "settled";

const STEP_LABELS: [Step[], string][] = [
  [["intro", "requesting", "funding"], "1. エージェントが依頼する"],
  [["open", "detail", "claimed"], "2. worker が引き受ける"],
  [["capture", "checking", "rejected"], "3. 撮って答える・AI が確かめる"],
  [["verified", "settled"], "4. 確定して支払う"],
];

// ---------- the sign "photo" (an SVG, so the page needs no image files) ----------

function signPhoto(takenAt: string, tilt: number): string {
  const lines = SIGN_LINES.map(
    (l, i) =>
      `<text x="300" y="${150 + i * 64}" text-anchor="middle" font-size="${i === 0 ? 40 : 30}" font-weight="${i === 0 ? 700 : 500}" fill="#1e293b" font-family="'Hiragino Sans','Noto Sans JP',sans-serif">${l}</text>`,
  ).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800" viewBox="0 0 600 800">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#94a3b8"/><stop offset="1" stop-color="#475569"/></linearGradient></defs>
<rect width="600" height="800" fill="url(#g)"/>
<rect x="40" y="620" width="520" height="180" fill="#334155"/>
<g transform="rotate(${tilt} 300 330)"><rect x="80" y="80" width="440" height="420" rx="14" fill="#f8fafc" stroke="#cbd5e1" stroke-width="6"/>${lines}</g>
<rect x="0" y="760" width="600" height="40" fill="rgba(0,0,0,.45)"/>
<text x="16" y="786" font-size="18" fill="#fff" font-family="monospace">${takenAt}  35.6595,139.7005</text>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

// ---------- small pieces ----------

function Json({ title, value, tone = "slate" }: { title: string; value: unknown; tone?: "slate" | "teal" }) {
  return (
    <div
      className={`rounded-xl border ${tone === "teal" ? "border-teal-200 bg-teal-50" : "border-slate-200 bg-slate-50"} p-3`}
    >
      <p className="font-mono text-xs font-semibold text-slate-500">{title}</p>
      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all font-mono text-xs leading-relaxed text-slate-800">
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

function Bubble({ who, children }: { who: "user" | "agent"; children: ReactNode }) {
  const me = who === "user";
  return (
    <div className={`flex ${me ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[92%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${me ? "bg-teal-700 text-white" : "bg-white text-slate-800 ring-1 ring-slate-200"}`}
      >
        {children}
      </div>
    </div>
  );
}

function Phone({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[22rem] overflow-hidden rounded-[2rem] border-8 border-slate-900 bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <h3 className="text-base font-bold">{title}</h3>
        <span className="text-sm font-medium text-teal-700">報酬</span>
      </div>
      <div className="h-[34rem] space-y-4 overflow-y-auto bg-slate-50 p-4">{children}</div>
    </div>
  );
}

function Dots() {
  return <span className="inline-block w-5 animate-pulse text-left">…</span>;
}

// ---------- the walkthrough ----------

export function TryExperience() {
  const [step, setStep] = useState<Step>("intro");
  const [attempt, setAttempt] = useState(1);
  const [photo, setPhoto] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [claimedAt, setClaimedAt] = useState<number | null>(null);
  const [checkIdx, setCheckIdx] = useState(0);
  const now = useNow(1000);
  const [startedAt] = useState(() => Date.now());
  // The agent log grows downward; keep its newest entry in view as the story advances.
  const log = useRef<HTMLElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on every step change on purpose
  useEffect(() => {
    log.current?.scrollTo({ top: log.current.scrollHeight, behavior: "smooth" });
  }, [step]);

  const deadlineIso = useMemo(() => new Date(startedAt + 45 * 60_000).toISOString(), [startedAt]);
  const expiresIso = claimedAt ? new Date(claimedAt + 30 * 60_000).toISOString() : null;
  const isSummary = answer.trim() === SUMMARY;
  const isExact = answer.replace(/\s+/g, "") === EXACT.replace(/\s+/g, "");

  // Timed transitions, so the page moves like the real system does.
  useEffect(() => {
    const t: ReturnType<typeof setTimeout>[] = [];
    if (step === "requesting") t.push(setTimeout(() => setStep("funding"), 1400));
    if (step === "funding") t.push(setTimeout(() => setStep("open"), 1800));
    if (step === "checking") {
      for (let i = 1; i <= CHECKS.length; i++) t.push(setTimeout(() => setCheckIdx(i), 500 * i));
      t.push(
        setTimeout(
          () => setStep(isSummary || !isExact ? "rejected" : "verified"),
          500 * CHECKS.length + 1600,
        ),
      );
    }
    if (step === "verified") t.push(setTimeout(() => setStep("settled"), 2200));
    return () => {
      for (const x of t) clearTimeout(x);
    };
  }, [step, isSummary, isExact]);

  const reset = () => {
    setStep("intro");
    setAttempt(1);
    setPhoto(null);
    setAnswer("");
    setClaimedAt(null);
    setCheckIdx(0);
  };

  const requestBody = {
    type: TYPE,
    question: QUESTION,
    answer_schema: { type: "text", max_chars: 500 },
    location: PLACE,
    deadline: deadlineIso,
    freshness: { max_age_seconds: 300 },
    evidence_requirements: { photo: true, task_nonce: true },
    assurance: { level: "fast" },
    bounty: { asset: "USDC", amount: BOUNTY, network: "solana-devnet" },
  };
  const proofUrl = `https://proofmarket.example/r/${IDS.verification}`;

  const stepIndex = STEP_LABELS.findIndex(([steps]) => steps.includes(step));

  return (
    <div className="space-y-6">
      {/* progress */}
      <ol className="grid gap-2 sm:grid-cols-4">
        {STEP_LABELS.map(([, label], i) => (
          <li
            key={label}
            className={`rounded-xl px-3 py-2 text-sm font-semibold ${i < stepIndex ? "bg-teal-700 text-white" : i === stepIndex ? "bg-teal-50 text-teal-800 ring-2 ring-teal-600" : "bg-slate-100 text-slate-500"}`}
          >
            {label}
          </li>
        ))}
      </ol>

      <div className="grid gap-6 lg:grid-cols-[1fr_24rem] lg:items-start">
        {/* ---------- left: the agent ---------- */}
        <section
          ref={log}
          className="max-h-[38rem] space-y-3 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-4"
        >
          <p className="text-xs font-semibold tracking-wide text-slate-500">AI エージェント（依頼する側）</p>
          <Bubble who="user">
            渋谷の「坂の上のパン屋」、今日は何時まで開いてる？ 正確なところが知りたい。
          </Bubble>

          {step === "intro" ? (
            <>
              <Bubble who="agent">
                ウェブの情報は古いことがあります。ProofMarket
                で、いま現地にいる人に掲示を書き起こしてもらいます。{BOUNTY}{" "}
                USDC、45分以内です。よろしいですか？
              </Bubble>
              <Button onClick={() => setStep("requesting")}>
                依頼を出す（request_reality_verification）
              </Button>
            </>
          ) : null}

          {step !== "intro" ? (
            <>
              <Bubble who="agent">現地の人に頼みます。</Bubble>
              <Json title="→ tools/call request_reality_verification" value={requestBody} />
            </>
          ) : null}

          {step === "requesting" ? (
            <p className="text-sm text-slate-500">
              依頼を受け付けています
              <Dots />
            </p>
          ) : null}

          {[
            "funding",
            "open",
            "detail",
            "claimed",
            "capture",
            "checking",
            "rejected",
            "verified",
            "settled",
          ].includes(step) ? (
            <Json
              title="← 201 Created"
              value={{
                verification_id: IDS.verification,
                status: step === "funding" ? "CREATED" : "OPEN",
                deadline: deadlineIso,
                funding: {
                  status: step === "funding" ? "PENDING" : "CONFIRMED",
                  explorer_url: step === "funding" ? null : explorer(IDS.fundTx),
                },
                note: "A human witness must travel to the place. Poll get_reality_verification for the result.",
              }}
            />
          ) : null}

          {step === "funding" ? (
            <p className="text-sm text-slate-500">
              報酬 {BOUNTY} USDC を Solana のエスクローへ預けています
              <Dots />
            </p>
          ) : null}

          {["open", "detail", "claimed", "capture", "checking", "rejected"].includes(step) ? (
            <>
              <Notice tone="ok">
                エスクローに預けました。依頼は worker
                の一覧に出ています。スマートフォンの画面（横に並ばないときは下）で、worker
                として引き受けてください。
              </Notice>
              <Json
                title="→ get_reality_verification（20秒ごとに待つ）"
                value={{
                  verification_id: IDS.verification,
                  status: ["open", "detail"].includes(step)
                    ? "OPEN"
                    : step === "claimed" || step === "capture"
                      ? "CLAIMED"
                      : "SUBMITTED",
                  witness_progress:
                    step === "open" || step === "detail"
                      ? { valid: 0, active_claims: 0, open_slots: 1, required: 1 }
                      : { valid: 0, active_claims: 1, open_slots: 0, required: 1 },
                  result: null,
                }}
              />
            </>
          ) : null}

          {step === "rejected" ? (
            <p className="text-sm text-slate-600">
              最初の提出は AI の確認で差し戻されました。結果はまだ null のまま、エージェントは待ち続けます。
            </p>
          ) : null}

          {step === "verified" || step === "settled" ? (
            <>
              <Json
                title="← get_reality_verification"
                tone="teal"
                value={{
                  verification_id: IDS.verification,
                  status: step === "settled" ? "SETTLED" : "VERIFIED",
                  result: {
                    status: "VERIFIED",
                    answer: "sha256:9b1c…（文章の答えは要約値で記録）",
                    answers: [EXACT],
                    reviews: [
                      {
                        verdict: "pass",
                        reason: "掲示の文字がそのまま書き起こされています。",
                        observed: "入口のガラス戸に貼られた営業時間の掲示",
                        model: "claude-opus-5-5",
                      },
                    ],
                    witnesses: { valid: 1, required: 1, quorum: 1 },
                    checks: {
                      geofence: "pass",
                      freshness: "pass",
                      task_nonce: "pass",
                      replay: "pass",
                      media_schema: "pass",
                      duplicate: "pass",
                      vision_consistency: "pass",
                    },
                    settlement: {
                      status: step === "settled" ? "SETTLED" : "PENDING",
                      signature: step === "settled" ? IDS.settleTx : null,
                    },
                    proof: {
                      url: proofUrl,
                      badge_url: `${proofUrl}/badge.svg`,
                      markdown: `[![人が確認](${proofUrl}/badge.svg)](${proofUrl})`,
                    },
                  },
                }}
              />
              {step === "verified" ? (
                <p className="text-sm text-slate-500">
                  結果のハッシュを Solana に記録し、worker に {BOUNTY} USDC を払っています
                  <Dots />
                </p>
              ) : null}
            </>
          ) : null}

          {step === "settled" ? (
            <>
              <Bubble who="agent">
                <p>
                  いま現地で確かめてもらいました。入口の掲示はこうです。
                  <br />
                  <span className="mt-1 block whitespace-pre-wrap rounded-lg bg-slate-100 p-2 font-medium">
                    {EXACT}
                  </span>
                </p>
                <p className="mt-2">
                  今日は平日なので <b>20:00 まで</b>（ラストオーダー 19:30）です。
                </p>
                <p className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                  <span className="inline-flex overflow-hidden rounded-md text-[11px] font-semibold text-white">
                    <span className="bg-slate-700 px-2 py-0.5">人が確認</span>
                    <span className="bg-teal-700 px-2 py-0.5">
                      回答あり・
                      {new Date(now).toLocaleString("ja-JP", {
                        timeZone: "Asia/Tokyo",
                        month: "numeric",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </span>
                  <span className="underline">確かめた記録を見る</span>
                </p>
              </Bubble>
              <Notice tone="ok">
                利用者には、答えと一緒に「人が確かめた証明」のリンクが渡ります。本番ではこのリンク先が公開ページ（/r/…）で、Solana
                の記録まで誰でも確かめられます。
              </Notice>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button variant="secondary" onClick={reset}>
                  最初からもう一度
                </Button>
                <Link
                  href="/developers"
                  className="flex items-center justify-center rounded-2xl bg-teal-700 px-4 py-4 text-base font-bold text-white"
                >
                  本番につないで試す
                </Link>
              </div>
            </>
          ) : null}
        </section>

        {/* ---------- right: the worker's phone ---------- */}
        <section className="space-y-2 lg:sticky lg:top-20">
          <p className="text-center text-xs font-semibold tracking-wide text-slate-500">
            worker のスマートフォン
          </p>

          {["intro", "requesting", "funding"].includes(step) ? (
            <Phone title="近くのタスク">
              <div className="grid grid-cols-2 gap-1 rounded-full bg-slate-100 p-1 text-sm font-semibold">
                <span className="rounded-full bg-white px-3 py-2 text-center text-teal-700 shadow">
                  近くで
                </span>
                <span className="px-3 py-2 text-center text-slate-500">家でできる</span>
              </div>
              <Notice>いまは近くにタスクがありません。少し時間をおいて更新してください。</Notice>
              <p className="text-center text-xs text-slate-400">開いている間は30秒ごとに自動で更新します</p>
            </Phone>
          ) : null}

          {step === "open" ? (
            <Phone title="近くのタスク">
              <div className="grid grid-cols-2 gap-1 rounded-full bg-slate-100 p-1 text-sm font-semibold">
                <span className="rounded-full bg-white px-3 py-2 text-center text-teal-700 shadow">
                  近くで
                </span>
                <span className="px-3 py-2 text-center text-slate-500">家でできる</span>
              </div>
              <Notice tone="ok">新しいタスクが 1 件届きました。</Notice>
              <button type="button" className="block w-full text-left" onClick={() => setStep("detail")}>
                <Card>
                  <div className="flex items-baseline justify-between">
                    <span className="text-2xl font-bold text-teal-700">
                      {BOUNTY} USDC
                      <span className="ml-2 rounded-full bg-amber-400 px-2 py-0.5 align-middle text-xs font-bold text-white">
                        新着
                      </span>
                    </span>
                    <span className="text-sm text-slate-500">120 m</span>
                  </div>
                  <p className="mt-1 text-xs font-medium text-slate-500">{TASK_TYPE_JA[TYPE].name}</p>
                  <p className="mt-1 line-clamp-3 font-medium">{QUESTION}</p>
                  <p className="mt-2 text-sm text-slate-500">
                    締切まで {remaining(deadlineIso, now)}・写真と位置が必要
                  </p>
                </Card>
              </button>
              <p className="text-center text-xs text-slate-500">タップして内容を見る</p>
            </Phone>
          ) : null}

          {step === "detail" ? (
            <Phone title="タスクの内容">
              <Card>
                <p className="text-sm text-slate-500">確かめること・{TASK_TYPE_JA[TYPE].name}</p>
                <p className="mt-1 text-xl font-bold leading-snug">{QUESTION}</p>
                <p className="mt-3 text-sm text-slate-600">文章で答える（500字まで）</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{TASK_TYPE_JA[TYPE].howTo}</p>
              </Card>
              <Card>
                <dl className="grid grid-cols-2 gap-y-3 text-sm">
                  <dt className="text-slate-500">報酬</dt>
                  <dd className="text-right text-lg font-bold text-teal-700">{BOUNTY} USDC</dd>
                  <dt className="text-slate-500">締切まで</dt>
                  <dd className="text-right font-medium">{remaining(deadlineIso, now)}</dd>
                  <dt className="text-slate-500">場所</dt>
                  <dd className="text-right font-medium">指定地点から {PLACE.radius_m} m 以内</dd>
                  <dt className="text-slate-500">撮影の受付時間</dt>
                  <dd className="text-right font-medium">「撮影を始める」から 5 分</dd>
                </dl>
              </Card>
              <Card>
                <h4 className="mb-2 font-bold">撮影の注意</h4>
                <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                  {SAFETY_NOTES.slice(0, 3).map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              </Card>
              <Button
                onClick={() => {
                  setClaimedAt(Date.now());
                  setStep("claimed");
                }}
              >
                引き受ける
              </Button>
              <p className="text-center text-xs text-slate-500">引き受けた後でも、いつでもやめられます。</p>
            </Phone>
          ) : null}

          {step === "claimed" && expiresIso ? (
            <Phone title="現地へ向かう">
              <Card>
                <p className="text-sm text-slate-500">引き受けの残り時間</p>
                <p className="mt-1 text-4xl font-bold tabular-nums">{remaining(expiresIso, now)}</p>
              </Card>
              <Notice>
                お店の前に着いたら「現地に着いた」を押してください。そこから撮影の受付時間が始まります。
              </Notice>
              <Button onClick={() => setStep("capture")}>現地に着いた（撮影を始める）</Button>
              <Button variant="danger" onClick={reset}>
                やめる
              </Button>
            </Phone>
          ) : null}

          {step === "capture" ? (
            <Phone title="撮影と回答">
              <p className="whitespace-pre-wrap rounded-2xl bg-slate-100 p-3 text-sm">{QUESTION}</p>
              <Notice>
                撮影の受付時間:{" "}
                <b className="tabular-nums">
                  4分{String(59 - (Math.floor((now - startedAt) / 1000) % 60)).padStart(2, "0")}秒
                </b>
                {attempt > 1 ? `・${attempt}回目の提出` : ""}
              </Notice>
              {photo ? (
                // biome-ignore lint/performance/noImgElement: inline sample image
                <img
                  src={photo}
                  alt="撮影した見本の写真"
                  className="aspect-[3/4] w-full rounded-2xl object-cover"
                />
              ) : (
                <div className="flex aspect-[3/4] w-full items-center justify-center rounded-2xl bg-black text-center text-sm text-slate-300">
                  カメラの映像
                  <br />
                  （体験では見本の掲示が写ります）
                </div>
              )}
              <p className="text-xs text-slate-500">
                {TASK_TYPE_JA[TYPE].howTo}人の顔が大きく写らないようにしてください。
              </p>
              {!photo ? (
                <Button
                  onClick={() =>
                    setPhoto(signPhoto(new Date().toISOString().slice(0, 19), attempt === 1 ? -2 : 1.5))
                  }
                >
                  撮影する
                </Button>
              ) : (
                <>
                  <p className="text-sm text-slate-600">位置を取得しました（誤差 約12 m）</p>
                  <div className="grid gap-2">
                    <p className="text-xs font-medium text-slate-500">体験用: 答えの入れ方を選べます</p>
                    <button
                      type="button"
                      onClick={() => setAnswer(SUMMARY)}
                      className={`rounded-xl px-3 py-2 text-left text-sm ring-1 ${isSummary ? "bg-amber-50 ring-amber-400" : "bg-white ring-slate-300"}`}
                    >
                      要約して送る（AI に差し戻される例）
                    </button>
                    <button
                      type="button"
                      onClick={() => setAnswer(EXACT)}
                      className={`rounded-xl px-3 py-2 text-left text-sm ring-1 ${isExact ? "bg-emerald-50 ring-emerald-400" : "bg-white ring-slate-300"}`}
                    >
                      書いてあるとおりに書き起こす
                    </button>
                  </div>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    文章で答える（500字まで）
                    <textarea
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      maxLength={500}
                      rows={6}
                      className="rounded-2xl border border-slate-300 px-4 py-3 text-base leading-relaxed"
                      placeholder="見たこと・書かれていたことを、そのまま書いてください"
                    />
                    <span className="text-right text-xs text-slate-400">{answer.length} 字</span>
                  </label>
                  <Button
                    onClick={() => {
                      setCheckIdx(0);
                      setStep("checking");
                    }}
                    disabled={!answer.trim()}
                  >
                    この内容で送信する
                  </Button>
                </>
              )}
            </Phone>
          ) : null}

          {step === "checking" ? (
            <Phone title="判定">
              <Card>
                <p className="text-xl font-bold text-sky-700">内容を確認しています</p>
                <ul className="mt-3 space-y-2 text-sm">
                  {CHECKS.map((c, i) => (
                    <li key={c} className="flex items-center justify-between">
                      <span className="text-slate-700">{c}</span>
                      <span className={i < checkIdx ? "font-semibold text-emerald-700" : "text-slate-300"}>
                        {i < checkIdx ? "合格" : "…"}
                      </span>
                    </li>
                  ))}
                  <li className="flex items-center justify-between">
                    <span className="text-slate-700">写真と答えが依頼に合っているか（AI）</span>
                    <span className={checkIdx >= CHECKS.length ? "text-sky-700" : "text-slate-300"}>
                      {checkIdx >= CHECKS.length ? "確認中…" : "…"}
                    </span>
                  </li>
                </ul>
              </Card>
              <p className="text-center text-xs text-slate-500">
                本番では、Claude が写真と答えを依頼文と突き合わせます。
              </p>
            </Phone>
          ) : null}

          {step === "rejected" ? (
            <Phone title="判定">
              <Card>
                <p className="text-xl font-bold text-rose-700">確認できませんでした</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-700">
                  AI の確認:
                  {isSummary
                    ? "「書いてあるとおりに書き起こす」依頼ですが、送られた答えは要約になっています。掲示の文字をそのまま書いてください。"
                    : "送られた答えが、写真の掲示の文字と一致しません。掲示の文字をそのまま書いてください。"}
                </p>
                <p className="mt-2 text-sm text-slate-500">あと {3 - attempt} 回やり直せます。</p>
              </Card>
              <Button
                onClick={() => {
                  setAttempt((a) => a + 1);
                  setPhoto(null);
                  setAnswer("");
                  setStep("capture");
                }}
              >
                撮り直す
              </Button>
              <Button variant="secondary" onClick={reset}>
                一覧に戻る
              </Button>
            </Phone>
          ) : null}

          {step === "verified" ? (
            <Phone title="判定">
              <Card>
                <div className="text-center">
                  <p className="text-5xl">✓</p>
                  <p className="mt-2 text-xl font-bold text-emerald-700">確認できました</p>
                  <p className="mt-2 text-sm text-slate-600">
                    報酬 {BOUNTY} USDC は、依頼が確定したあとに送られます。
                  </p>
                </div>
              </Card>
              <p className="text-center text-sm text-slate-500">
                支払いを待っています
                <Dots />
              </p>
            </Phone>
          ) : null}

          {step === "settled" ? (
            <Phone title="支払い履歴">
              <Card>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-bold text-teal-700">{BOUNTY} USDC</span>
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">
                    受け取り済み
                  </span>
                </div>
                <p className="mt-1 text-xs font-medium text-slate-500">{TASK_TYPE_JA[TYPE].name}</p>
                <p className="mt-1 text-sm text-slate-600">
                  {new Date(now).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}
                </p>
                <p className="mt-2 text-sm text-teal-700 underline">取引記録を見る（Solana Explorer）</p>
              </Card>
              <Notice tone="ok">
                体験はここまでです。本番では、この取引が Solana Devnet に記録され、Explorer
                で誰でも見られます。
              </Notice>
            </Phone>
          ) : null}
        </section>
      </div>
    </div>
  );
}

/** Machine checks shown while a submission is examined, in the production order (minus the AI review). */
const CHECKS = [
  "この依頼のために撮られた写真か（合言葉）",
  "いま撮られた写真か（受付時間）",
  "写真の形式",
  "指定された場所で撮られたか（位置）",
  "過去の写真の使い回しでないか",
  "ほかの人の写真とそっくりでないか",
];
