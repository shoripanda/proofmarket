"use client";
// S-13 体験ページ (/try). One person plays both sides in the browser: the agent that asks (left) and the worker's
// phone (right). Screens, wording, JSON shapes and the review rule mirror production; nothing here touches the
// database, the balance or Solana. IDs, signatures and the photo are samples.
import type { TaskType } from "@proofmarket/core";
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FlowDiagram } from "@/components/flow-diagram";
import { RequestCard, ResultCard, StatusCard } from "@/components/try-cards";
import { taskTypeText } from "@/lib/answers";
import { LLink, useLang } from "@/lib/client/lang";
import { speak, speechSupported, stopSpeaking } from "@/lib/client/speech";
import { dateLocale, type Lang, pick } from "@/lib/lang";
import { Button, Card, Notice, remaining, safetyNotes, useNow } from "./ui";

// ---------- the scenario ----------

const TYPE: TaskType = "SIGN_TRANSCRIPTION";
const BOUNTY = "0.30";
const PLACE = { lat: 35.6595, lng: 139.7005, radius_m: 80 };
const IDS = {
  verification: "ver_01TRY0000000000000000DEMO1",
  claim: "clm_01TRY0000000000000000DEMO1",
  fundTx: "3TryFundEscrow11111111111111111111111111111111111111111111111111111111111111111111111",
  settleTx: "5TrySettlePayout1111111111111111111111111111111111111111111111111111111111111111111111",
};
const explorer = (sig: string) => `https://explorer.solana.com/tx/${sig}?cluster=devnet`;

/** Everything a reader sees, in both languages. The sign itself is translated too, so the English demo reads
 *  as one piece; the shop is still in Shibuya. */
const TEXT = {
  ja: {
    question: "入口に貼ってある営業時間の掲示を、書いてあるとおりに書き起こしてください。",
    signLines: [
      "営業時間",
      "平日 11:00〜20:00",
      "土曜 11:00〜18:00",
      "日曜・祝日 定休",
      "ラストオーダー 19:30",
    ],
    summary: "平日は11時から20時まで。土曜は18時まで。日曜は休み。",
    stepLabels: [
      "1. エージェントが依頼する",
      "2. worker が引き受ける",
      "3. 撮って答える・AI が確かめる",
      "4. 確定して支払う",
    ],
    autoOn: "自動で再生中",
    autoOff: "自分で操作中",
    takeOver: "止めて自分で操作する",
    resume: "続きを自動で再生",
    restart: "最初から",
    speed: "速さ",
    agentSide: "AI エージェント（依頼する側）",
    userAsk: "渋谷の「坂の上のパン屋」、今日は何時まで開いてる？ 正確な時間が知りたい。",
    thinkingTitle: "エージェントの考え",
    readThinking: "考えを読み上げる",
    thinking:
      "ウェブの営業時間は古いかもしれない。確実なのは、いま現地にいる人に入口の掲示を書き起こしてもらうこと。ProofMarket の request_reality_verification を、種類 SIGN_TRANSCRIPTION・場所はこの店・締め切り45分・報酬 0.30 USDC で呼ぶ。",
    agentAsks: `ウェブの情報は古いかもしれません。ProofMarket で、いま近くにいる人に入口の掲示をそのまま書き写してもらいます。費用は ${BOUNTY} USDC、45分以内に返ってきます。頼んでいいですか？`,
    requestBtn: "依頼を出す（request_reality_verification）",
    agentSends: "現地の人に頼みます。",
    place: "渋谷・指定地点から 80 m 以内",
    accepting: "依頼を受け付けています",
    funding: `報酬 ${BOUNTY} USDC を Solana のエスクローへ預けています`,
    funded:
      "報酬を預けました。依頼は worker の一覧に出ています。右のスマートフォン（画面が狭いときは下）で引き受けてください。",
    rejectedNote:
      "最初の提出は AI の確認で差し戻されました。結果はまだ出ていないので、エージェントはそのまま待ちます。",
    reviewReason: "掲示の文字がそのまま書き起こされています。",
    observed: "入口のガラス戸に貼られた営業時間の掲示",
    settling: `結果のハッシュを Solana に記録し、worker に ${BOUNTY} USDC を払っています`,
    finalIntro: "いま現地で確かめてもらいました。入口の掲示はこのとおりです。",
    finalToday: ["今日は平日なので ", "20:00 まで", "（ラストオーダー 19:30）です。"],
    badgeLeft: "人が確認",
    badgeRight: "回答あり・",
    seeProof: "確かめた記録を見る",
    proofNote:
      "答えと一緒に「人が確かめた証明」のリンクが利用者に届きます。本番ではリンク先が公開ページ（/r/…）になり、Solana の記録まで誰でも確かめられます。",
    replay: "最初からもう一度",
    goLive: "本番につないで試す",
    phoneSide: "worker のスマートフォン",
    nearby: "近くのタスク",
    tabNear: "近くで",
    tabHome: "家でできる",
    noTasks: "いまは近くにタスクがありません。少し時間をおいて更新してください。",
    autoRefresh: "開いている間は30秒ごとに自動で更新します",
    newTask: "新しいタスクが 1 件届きました。",
    newBadge: "新着",
    deadlineIn: "締切まで",
    needsPhoto: "写真と位置が必要",
    tapToOpen: "タップして内容を見る",
    taskDetail: "タスクの内容",
    whatToCheck: "確かめること・",
    answerText: "文章で答える（500字まで）",
    bounty: "報酬",
    placeLabel: "場所",
    withinM: `指定地点から ${PLACE.radius_m} m 以内`,
    captureWindow: "撮影の受付時間",
    captureWindowValue: "「撮影を始める」から 5 分",
    safetyTitle: "撮影の注意",
    claim: "引き受ける",
    quitAnytime: "引き受けた後でも、いつでもやめられます。",
    heading: "現地へ向かう",
    claimLeft: "引き受けの残り時間",
    arriveHint: "お店の前に着いたら「現地に着いた」を押してください。そこから撮影の受付時間が始まります。",
    arrive: "現地に着いた（撮影を始める）",
    quit: "やめる",
    captureTitle: "撮影と回答",
    windowLabel: "撮影の受付時間: ",
    attemptN: (n: number) => `・${n}回目の提出`,
    photoAlt: "撮影した見本の写真",
    cameraPlaceholder: ["カメラの映像", "（体験では見本の掲示が写ります）"],
    noFaces: "人の顔が大きく写らないようにしてください。",
    shoot: "撮影する",
    located: "位置を取得しました（誤差 約12 m）",
    pickTitle: "体験用：答え方を選べます",
    pickSummary: "要約して送る（AI に差し戻される例）",
    pickExact: "書いてあるとおりに書き起こす",
    placeholder: "見たこと・書かれていたことを、そのまま書いてください",
    chars: (n: number) => `${n} 字`,
    submit: "この内容で送信する",
    verdict: "判定",
    checking: "内容を確認しています",
    pass: "合格",
    aiCheck: "写真と答えが依頼に合っているか（AI）",
    checkingNow: "確認中…",
    aiNote: "本番では、Claude が写真と答えを依頼文と突き合わせます。",
    rejected: "確認できませんでした",
    aiReview: "AI の確認: ",
    rejectSummary:
      "依頼は「書いてあるとおりに書き起こす」ことですが、送られた答えは要約になっています。掲示の文字をそのまま書いてください。",
    rejectMismatch: "送られた答えが、写真の掲示の文字と一致しません。掲示の文字をそのまま書いてください。",
    retriesLeft: (n: number) => `あと ${n} 回やり直せます。`,
    retake: "撮り直す",
    backToList: "一覧に戻る",
    verified: "確認できました",
    paidAfter: `報酬 ${BOUNTY} USDC は、依頼が確定したあとに送られます。`,
    waitingPay: "支払いを待っています",
    payouts: "支払い履歴",
    received: "受け取り済み",
    viewTx: "取引記録を見る（Solana Explorer）",
    endNote:
      "体験はここまでです。本番では、この取引が Solana Devnet に記録され、Explorer で誰でも見られます。",
    checks: [
      "この依頼のために撮られた写真か（合言葉）",
      "いま撮られた写真か（受付時間）",
      "写真の形式",
      "指定された場所で撮られたか（位置）",
      "過去の写真の使い回しでないか",
      "ほかの人の写真と同じでないか",
    ],
  },
  en: {
    question: "Transcribe the opening-hours notice at the entrance exactly as written.",
    signLines: [
      "OPENING HOURS",
      "Mon–Fri 11:00–20:00",
      "Sat 11:00–18:00",
      "Closed Sun & holidays",
      "Last order 19:30",
    ],
    summary: "Open 11 to 8 on weekdays, until 6 on Saturdays, closed Sundays.",
    stepLabels: [
      "1. The agent asks",
      "2. A worker claims it",
      "3. Shoot, answer, AI reviews",
      "4. Final and paid",
    ],
    autoOn: "Autoplay",
    autoOff: "Manual",
    takeOver: "Stop and take over",
    resume: "Resume autoplay",
    restart: "Restart",
    speed: "Speed",
    agentSide: "AI agent (the requester)",
    userAsk: "The bakery “Sakanoue” in Shibuya — until what time is it open today? I need the exact hours.",
    thinkingTitle: "Agent's reasoning",
    readThinking: "Read the reasoning aloud",
    thinking:
      "Opening hours on the web may be stale. The sure way is to have someone on the spot transcribe the notice at the entrance. Call ProofMarket's request_reality_verification with type SIGN_TRANSCRIPTION, this shop as the place, a 45-minute deadline and a 0.30 USDC bounty.",
    agentAsks: `The web listing may be out of date. Through ProofMarket I can have someone nearby copy the notice at the entrance word for word. It costs ${BOUNTY} USDC and comes back within 45 minutes. Shall I go ahead?`,
    requestBtn: "Send the request (request_reality_verification)",
    agentSends: "Asking someone on the spot.",
    place: "Shibuya · within 80 m of the pin",
    accepting: "Request being accepted",
    funding: `Locking the ${BOUNTY} USDC bounty in escrow on Solana`,
    funded:
      "Bounty escrowed. The request is now listed for workers. Claim it on the phone on the right (below on a narrow screen).",
    rejectedNote:
      "The first submission was sent back by the AI review. There is no result yet, so the agent keeps waiting.",
    reviewReason: "The text of the notice is transcribed exactly as written.",
    observed: "An opening-hours notice taped to the glass door at the entrance",
    settling: `Recording the result hash on Solana and paying the worker ${BOUNTY} USDC`,
    finalIntro: "Someone just checked on the spot. The notice at the entrance reads:",
    finalToday: ["Today is a weekday, so it's open ", "until 20:00", " (last order 19:30)."],
    badgeLeft: "Human-verified",
    badgeRight: "answered · ",
    seeProof: "See the proof",
    proofNote:
      "The answer reaches the user together with a link to the human-verified proof. In production the link opens a public page (/r/…) where anyone can check right down to the Solana record.",
    replay: "Play again",
    goLive: "Try it against production",
    phoneSide: "Worker's phone",
    nearby: "Tasks nearby",
    tabNear: "Nearby",
    tabHome: "From home",
    noTasks: "No tasks nearby right now. Check back in a little while.",
    autoRefresh: "Refreshes every 30 seconds while open",
    newTask: "1 new task arrived.",
    newBadge: "NEW",
    deadlineIn: "Deadline in",
    needsPhoto: "photo and location required",
    tapToOpen: "Tap to see the details",
    taskDetail: "Task details",
    whatToCheck: "What to check · ",
    answerText: "Answer in text (up to 500 characters)",
    bounty: "Bounty",
    placeLabel: "Place",
    withinM: `within ${PLACE.radius_m} m of the pin`,
    captureWindow: "Capture window",
    captureWindowValue: "5 min from “Start capture”",
    safetyTitle: "Before you shoot",
    claim: "Claim this task",
    quitAnytime: "You can quit at any time, even after claiming.",
    heading: "Heading there",
    claimLeft: "Time left on your claim",
    arriveHint: "When you reach the shop, tap “I'm here”. The capture window starts from that moment.",
    arrive: "I'm here (start capture)",
    quit: "Quit",
    captureTitle: "Shoot and answer",
    windowLabel: "Capture window: ",
    attemptN: (n: number) => ` · attempt ${n}`,
    photoAlt: "Sample photo taken in the demo",
    cameraPlaceholder: ["Camera view", "(the demo shows a sample notice)"],
    noFaces: " Keep people's faces out of the frame.",
    shoot: "Take the photo",
    located: "Location acquired (accuracy about 12 m)",
    pickTitle: "Demo only: choose how to answer",
    pickSummary: "Send a summary (the AI sends it back)",
    pickExact: "Transcribe it exactly as written",
    placeholder: "Write exactly what you saw or what was written",
    chars: (n: number) => `${n} chars`,
    submit: "Submit",
    verdict: "Verdict",
    checking: "Checking the submission",
    pass: "pass",
    aiCheck: "Do the photo and answer match the request? (AI)",
    checkingNow: "reviewing…",
    aiNote: "In production, Claude compares the photo and the answer with the request.",
    rejected: "Not accepted",
    aiReview: "AI review: ",
    rejectSummary:
      "The request asks for a transcription exactly as written, but the answer is a summary. Copy the text of the notice as it is.",
    rejectMismatch:
      "The answer does not match the text of the notice in the photo. Copy the text of the notice as it is.",
    retriesLeft: (n: number) => `${n} ${n === 1 ? "attempt" : "attempts"} left.`,
    retake: "Retake",
    backToList: "Back to the list",
    verified: "Accepted",
    paidAfter: `The ${BOUNTY} USDC bounty is sent once the request becomes final.`,
    waitingPay: "Waiting for the payout",
    payouts: "Earnings",
    received: "Received",
    viewTx: "View the transaction (Solana Explorer)",
    endNote:
      "That is the end of the demo. In production this transaction is recorded on Solana Devnet, where anyone can see it in the Explorer.",
    checks: [
      "Taken for this request? (nonce)",
      "Taken just now? (capture window)",
      "Photo format",
      "Taken at the requested place? (location)",
      "Not a reused photo?",
      "Not the same as someone else's photo?",
    ],
  },
} satisfies Record<Lang, unknown>;

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

const STEP_GROUPS: Step[][] = [
  ["intro", "requesting", "funding"],
  ["open", "detail", "claimed"],
  ["capture", "checking", "rejected"],
  ["verified", "settled"],
];

// ---------- the sign "photo" (an SVG, so the page needs no image files) ----------

function signPhoto(signLines: string[], takenAt: string, tilt: number): string {
  // The sign text goes into SVG markup, so "&" (Sun & holidays) must be escaped or the image fails to load.
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const lines = signLines
    .map(
      (l, i) =>
        `<text x="300" y="${150 + i * 64}" text-anchor="middle" font-size="${i === 0 ? 40 : 30}" font-weight="${i === 0 ? 700 : 500}" fill="#1e293b" font-family="'Hiragino Sans','Noto Sans JP',sans-serif">${esc(l)}</text>`,
    )
    .join("");
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

/** Reveals text a few characters at a time; `on=false` shows it at once (manual mode). */
function useTypewriter(text: string, on: boolean, cps = 40): { shown: string; done: boolean } {
  const [n, setN] = useState(on ? 0 : text.length);
  useEffect(() => {
    if (!on) {
      setN(text.length);
      return;
    }
    setN(0);
    const step = Math.max(1, Math.round(cps / 25));
    const id = setInterval(() => {
      setN((k) => {
        if (k >= text.length) {
          clearInterval(id);
          return k;
        }
        return Math.min(text.length, k + step);
      });
    }, 40);
    return () => clearInterval(id);
  }, [text, on, cps]);
  return { shown: text.slice(0, n), done: n >= text.length };
}

function Typed({
  text,
  on,
  cps,
  className,
}: {
  text: string;
  on: boolean;
  cps?: number;
  className?: string;
}) {
  const { shown, done } = useTypewriter(text, on, cps);
  return <span className={`${className ?? ""} ${on && !done ? "typing-caret" : ""}`}>{shown}</span>;
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

function Phone({ title, earnings, children }: { title: string; earnings: string; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[22rem] overflow-hidden rounded-[2rem] border-8 border-slate-900 bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3">
        <h3 className="text-base font-bold">{title}</h3>
        <span className="text-sm font-medium text-teal-700">{earnings}</span>
      </div>
      <div key={title} className="fade-in-up h-[34rem] space-y-4 overflow-y-auto bg-slate-50 p-4">
        {children}
      </div>
    </div>
  );
}

function Dots() {
  return <span className="inline-block w-5 animate-pulse text-left">…</span>;
}

// ---------- the walkthrough ----------

export function TryExperience() {
  const lang = useLang();
  const t = TEXT[lang];
  const types = taskTypeText(lang);
  const EXACT = t.signLines.join("\n");
  const SUMMARY = t.summary;
  // English speakers type more characters per idea, so the typewriter runs a little faster there.
  const cps = lang === "en" ? 70 : 40;

  const [step, setStep] = useState<Step>("intro");
  const [attempt, setAttempt] = useState(1);
  const [photo, setPhoto] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const [claimedAt, setClaimedAt] = useState<number | null>(null);
  const [checkIdx, setCheckIdx] = useState(0);
  const now = useNow(1000);
  const [startedAt] = useState(() => Date.now());
  // Autoplay: the page performs every tap itself, like a screen recording you can take over at any moment.
  const [auto, setAuto] = useState(true);
  const [speed, setSpeed] = useState<1 | 2>(1);
  const [pressedId, setPressedId] = useState<string | null>(null);
  const autoRef = useRef(auto);
  autoRef.current = auto;
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
  const nChecks = t.checks.length;

  // Timed transitions, so the page moves like the real system does.
  useEffect(() => {
    const tm: ReturnType<typeof setTimeout>[] = [];
    if (step === "requesting") tm.push(setTimeout(() => setStep("funding"), 1400));
    if (step === "funding") tm.push(setTimeout(() => setStep("open"), 1800));
    if (step === "checking") {
      for (let i = 1; i <= nChecks; i++) tm.push(setTimeout(() => setCheckIdx(i), 500 * i));
      tm.push(
        setTimeout(() => setStep(isSummary || !isExact ? "rejected" : "verified"), 500 * nChecks + 1600),
      );
    }
    if (step === "verified") tm.push(setTimeout(() => setStep("settled"), 2200));
    return () => {
      for (const x of tm) clearTimeout(x);
    };
  }, [step, isSummary, isExact, nChecks]);

  const reset = useCallback(() => {
    setStep("intro");
    setAttempt(1);
    setPhoto(null);
    setAnswer("");
    setClaimedAt(null);
    setCheckIdx(0);
    setPressedId(null);
  }, []);

  // Every tap in the story has a name, so autoplay and a real finger run the same code.
  const act = useCallback(
    (id: string) => {
      switch (id) {
        case "request":
          setStep("requesting");
          break;
        case "card":
          setStep("detail");
          break;
        case "claim":
          setClaimedAt(Date.now());
          setStep("claimed");
          break;
        case "arrive":
          setStep("capture");
          break;
        case "shoot":
          setPhoto(signPhoto(t.signLines, new Date().toISOString().slice(0, 19), attempt === 1 ? -2 : 1.5));
          break;
        case "pickSummary":
          setAnswer(SUMMARY);
          break;
        case "pickExact":
          setAnswer(EXACT);
          break;
        case "submit":
          setCheckIdx(0);
          setStep("checking");
          break;
        case "retry":
          setAttempt((a) => a + 1);
          setPhoto(null);
          setAnswer("");
          setStep("capture");
          break;
      }
    },
    [attempt, t.signLines, SUMMARY, EXACT],
  );

  /** Show the finger on the control for a moment, then do it. */
  const press = useCallback(
    (id: string) => {
      setPressedId(id);
      setTimeout(() => {
        setPressedId(null);
        act(id);
      }, 320);
    },
    [act],
  );

  // The autoplay script: what happens next, and after how long. Stops the moment the person takes over.
  useEffect(() => {
    if (!auto) return;
    const d = (ms: number) => ms / speed;
    let next: [string, number] | null = null;
    if (step === "intro") next = ["request", 5200];
    else if (step === "open") next = ["card", 2200];
    else if (step === "detail") next = ["claim", 2600];
    else if (step === "claimed") next = ["arrive", 2200];
    else if (step === "capture" && !photo) next = ["shoot", 1800];
    else if (step === "capture" && photo && !answer)
      next = [attempt === 1 ? "pickSummary" : "pickExact", 1600];
    else if (step === "capture" && photo && answer) next = ["submit", 2200];
    else if (step === "rejected") next = ["retry", 3800];
    if (!next) return;
    const [id, ms] = next;
    const tm = setTimeout(() => {
      if (autoRef.current) press(id);
    }, d(ms));
    return () => clearTimeout(tm);
  }, [auto, speed, step, photo, answer, attempt, press]);

  const takeOver = () => setAuto(false);
  const replay = () => {
    reset();
    setAuto(true);
  };

  const requestBody = {
    type: TYPE,
    question: t.question,
    answer_schema: { type: "text", max_chars: 500 },
    location: PLACE,
    deadline: deadlineIso,
    freshness: { max_age_seconds: 300 },
    evidence_requirements: { photo: true, task_nonce: true },
    assurance: { level: "fast" },
    bounty: { asset: "USDC", amount: BOUNTY, network: "solana-devnet" },
  };
  const proofUrl = `https://proofmarket.example/r/${IDS.verification}`;
  const shortTime = new Date(now).toLocaleString(dateLocale(lang), {
    timeZone: "Asia/Tokyo",
    month: lang === "en" ? "short" : "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const stepIndex = STEP_GROUPS.findIndex((steps) => steps.includes(step));
  const flowIndex = (
    {
      intro: 0,
      requesting: 0,
      funding: 1,
      open: 2,
      detail: 2,
      claimed: 2,
      capture: 3,
      checking: 3,
      rejected: 3,
      verified: 4,
      settled: 5,
    } as Record<Step, number>
  )[step];

  return (
    <div className="space-y-6">
      <ReadThinking on={step === "intro"} text={t.thinking} label={t.readThinking} lang={lang} />
      {/* controls */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 text-sm">
        <span className="font-semibold text-slate-700">{auto ? t.autoOn : t.autoOff}</span>
        <span className="text-slate-400">·</span>
        {auto ? (
          <button
            type="button"
            onClick={takeOver}
            className="rounded-full px-3 py-1 font-semibold text-teal-700 ring-1 ring-teal-700"
          >
            {t.takeOver}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setAuto(true)}
            className="rounded-full px-3 py-1 font-semibold text-teal-700 ring-1 ring-teal-700"
          >
            {t.resume}
          </button>
        )}
        <button
          type="button"
          onClick={replay}
          className="rounded-full px-3 py-1 font-semibold text-slate-600 ring-1 ring-slate-300"
        >
          {t.restart}
        </button>
        <span className="ml-auto flex items-center gap-1 text-xs text-slate-500">
          {t.speed}
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

      {/* where we are, as a picture */}
      <div className="rounded-2xl border border-slate-200 bg-white px-2 py-3">
        <FlowDiagram active={flowIndex} compact />
      </div>
      <p className="text-center text-sm font-semibold text-teal-800">{t.stepLabels[stepIndex]}</p>

      <div className="grid gap-6 lg:grid-cols-[1fr_24rem] lg:items-start">
        {/* ---------- left: the agent ---------- */}
        <section
          ref={log}
          className="max-h-[38rem] space-y-3 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-50 p-4"
        >
          <p className="text-xs font-semibold tracking-wide text-slate-500">{t.agentSide}</p>
          <Bubble who="user">{t.userAsk}</Bubble>

          {step === "intro" ? (
            <>
              <div className="fade-in-up rounded-xl border border-dashed border-slate-300 bg-white/60 px-3 py-2 text-xs leading-relaxed text-slate-600">
                <p className="font-semibold text-slate-500">{t.thinkingTitle}</p>
                <Typed on={auto} cps={cps * 1.5} text={t.thinking} />
              </div>
              <Bubble who="agent">
                <Typed on={auto} cps={cps} text={t.agentAsks} />
              </Bubble>
              <Button onClick={() => press("request")} pressed={pressedId === "request"}>
                {t.requestBtn}
              </Button>
            </>
          ) : null}

          {step !== "intro" ? (
            <>
              <Bubble who="agent">{t.agentSends}</Bubble>
              <RequestCard
                typeName={types[TYPE].name}
                question={t.question}
                place={t.place}
                deadlineMin={45}
                bounty={BOUNTY}
                witnesses={1}
                raw={requestBody}
              />
            </>
          ) : null}

          {step === "requesting" ? (
            <p className="text-sm text-slate-500">
              {t.accepting}
              <Dots />
            </p>
          ) : null}

          {["funding", "open", "detail", "claimed", "capture", "checking", "rejected"].includes(step) ? (
            <StatusCard
              status={
                step === "funding"
                  ? "CREATED"
                  : ["open", "detail"].includes(step)
                    ? "OPEN"
                    : step === "claimed" || step === "capture"
                      ? "CLAIMED"
                      : "SUBMITTED"
              }
              escrow={step === "funding" ? "pending" : "locked"}
              activeClaims={["open", "detail", "funding"].includes(step) ? 0 : 1}
              raw={{
                verification_id: IDS.verification,
                status:
                  step === "funding" ? "CREATED" : ["open", "detail"].includes(step) ? "OPEN" : "CLAIMED",
                deadline: deadlineIso,
                funding: {
                  status: step === "funding" ? "PENDING" : "CONFIRMED",
                  explorer_url: step === "funding" ? null : explorer(IDS.fundTx),
                },
                witness_progress: ["funding", "open", "detail"].includes(step)
                  ? { valid: 0, active_claims: 0, open_slots: 1, required: 1 }
                  : { valid: 0, active_claims: 1, open_slots: 0, required: 1 },
                result: null,
              }}
            />
          ) : null}

          {step === "funding" ? (
            <p className="text-sm text-slate-500">
              {t.funding}
              <Dots />
            </p>
          ) : null}

          {["open", "detail", "claimed", "capture", "checking", "rejected"].includes(step) ? (
            <Notice tone="ok">{t.funded}</Notice>
          ) : null}

          {step === "rejected" ? <p className="text-sm text-slate-600">{t.rejectedNote}</p> : null}

          {step === "verified" || step === "settled" ? (
            <>
              <ResultCard
                answerLines={t.signLines}
                settled={step === "settled"}
                bounty={BOUNTY}
                reviewReason={t.reviewReason}
                proofUrl={proofUrl}
                badgeTime={shortTime}
                raw={{
                  verification_id: IDS.verification,
                  status: step === "settled" ? "SETTLED" : "VERIFIED",
                  result: {
                    status: "VERIFIED",
                    answer: "sha256:9b1c…",
                    answers: [EXACT],
                    reviews: [
                      {
                        verdict: "pass",
                        reason: t.reviewReason,
                        observed: t.observed,
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
                    proof: { url: proofUrl, badge_url: `${proofUrl}/badge.svg` },
                  },
                }}
              />
              {step === "verified" ? (
                <p className="text-sm text-slate-500">
                  {t.settling}
                  <Dots />
                </p>
              ) : null}
            </>
          ) : null}

          {step === "settled" ? (
            <>
              <Bubble who="agent">
                <p>
                  {t.finalIntro}
                  <br />
                  <span className="mt-1 block whitespace-pre-wrap rounded-lg bg-slate-100 p-2 font-medium">
                    {EXACT}
                  </span>
                </p>
                <p className="mt-2">
                  {t.finalToday[0]}
                  <b>{t.finalToday[1]}</b>
                  {t.finalToday[2]}
                </p>
                <p className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                  <span className="inline-flex overflow-hidden rounded-md text-[11px] font-semibold text-white">
                    <span className="bg-slate-700 px-2 py-0.5">{t.badgeLeft}</span>
                    <span className="bg-teal-700 px-2 py-0.5">
                      {t.badgeRight}
                      {shortTime}
                    </span>
                  </span>
                  <span className="underline">{t.seeProof}</span>
                </p>
              </Bubble>
              <Notice tone="ok">{t.proofNote}</Notice>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button variant="secondary" onClick={replay}>
                  {t.replay}
                </Button>
                <LLink
                  href="/developers"
                  className="flex items-center justify-center rounded-2xl bg-teal-700 px-4 py-4 text-base font-bold text-white"
                >
                  {t.goLive}
                </LLink>
              </div>
            </>
          ) : null}
        </section>

        {/* ---------- right: the worker's phone ---------- */}
        <section className="space-y-2 lg:sticky lg:top-20">
          <p className="text-center text-xs font-semibold tracking-wide text-slate-500">{t.phoneSide}</p>

          {["intro", "requesting", "funding"].includes(step) ? (
            <Phone title={t.nearby} earnings={t.payouts}>
              <div className="grid grid-cols-2 gap-1 rounded-full bg-slate-100 p-1 text-sm font-semibold">
                <span className="rounded-full bg-white px-3 py-2 text-center text-teal-700 shadow">
                  {t.tabNear}
                </span>
                <span className="px-3 py-2 text-center text-slate-500">{t.tabHome}</span>
              </div>
              <Notice>{t.noTasks}</Notice>
              <p className="text-center text-xs text-slate-400">{t.autoRefresh}</p>
            </Phone>
          ) : null}

          {step === "open" ? (
            <Phone title={t.nearby} earnings={t.payouts}>
              <div className="grid grid-cols-2 gap-1 rounded-full bg-slate-100 p-1 text-sm font-semibold">
                <span className="rounded-full bg-white px-3 py-2 text-center text-teal-700 shadow">
                  {t.tabNear}
                </span>
                <span className="px-3 py-2 text-center text-slate-500">{t.tabHome}</span>
              </div>
              <Notice tone="ok">{t.newTask}</Notice>
              <button
                type="button"
                className={`card-link block w-full rounded-2xl text-left ${pressedId === "card" ? "scale-[0.98] ring-4 ring-teal-300" : ""}`}
                onClick={() => press("card")}
              >
                <Card>
                  <div className="flex items-baseline justify-between">
                    <span className="text-2xl font-bold text-teal-700">
                      {BOUNTY} USDC
                      <span className="ml-2 rounded-full bg-amber-400 px-2 py-0.5 align-middle text-xs font-bold text-white">
                        {t.newBadge}
                      </span>
                    </span>
                    <span className="flex items-center gap-1 text-sm text-slate-500">
                      120 m
                      <span className="arrow text-lg leading-none text-teal-700" aria-hidden="true">
                        ›
                      </span>
                    </span>
                  </div>
                  <p className="mt-1 text-xs font-medium text-slate-500">{types[TYPE].name}</p>
                  <p className="mt-1 line-clamp-3 font-medium">{t.question}</p>
                  <p className="mt-2 text-sm text-slate-500">
                    {t.deadlineIn} {remaining(deadlineIso, now, lang)}
                    {pick(lang, "・", " · ")}
                    {t.needsPhoto}
                  </p>
                </Card>
              </button>
              <p className="text-center text-xs text-slate-500">{t.tapToOpen}</p>
            </Phone>
          ) : null}

          {step === "detail" ? (
            <Phone title={t.taskDetail} earnings={t.payouts}>
              <Card>
                <p className="text-sm text-slate-500">
                  {t.whatToCheck}
                  {types[TYPE].name}
                </p>
                <p className="mt-1 text-xl font-bold leading-snug">{t.question}</p>
                <p className="mt-3 text-sm text-slate-600">{t.answerText}</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">{types[TYPE].howTo}</p>
              </Card>
              <Card>
                <dl className="grid grid-cols-2 gap-y-3 text-sm">
                  <dt className="text-slate-500">{t.bounty}</dt>
                  <dd className="text-right text-lg font-bold text-teal-700">{BOUNTY} USDC</dd>
                  <dt className="text-slate-500">{t.deadlineIn}</dt>
                  <dd className="text-right font-medium">{remaining(deadlineIso, now, lang)}</dd>
                  <dt className="text-slate-500">{t.placeLabel}</dt>
                  <dd className="text-right font-medium">{t.withinM}</dd>
                  <dt className="text-slate-500">{t.captureWindow}</dt>
                  <dd className="text-right font-medium">{t.captureWindowValue}</dd>
                </dl>
              </Card>
              <Card>
                <h4 className="mb-2 font-bold">{t.safetyTitle}</h4>
                <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                  {safetyNotes(lang)
                    .slice(0, 3)
                    .map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                </ul>
              </Card>
              <Button onClick={() => press("claim")} pressed={pressedId === "claim"}>
                {t.claim}
              </Button>
              <p className="text-center text-xs text-slate-500">{t.quitAnytime}</p>
            </Phone>
          ) : null}

          {step === "claimed" && expiresIso ? (
            <Phone title={t.heading} earnings={t.payouts}>
              <Card>
                <p className="text-sm text-slate-500">{t.claimLeft}</p>
                <p className="mt-1 text-4xl font-bold tabular-nums">{remaining(expiresIso, now, lang)}</p>
              </Card>
              <Notice>{t.arriveHint}</Notice>
              <Button onClick={() => press("arrive")} pressed={pressedId === "arrive"}>
                {t.arrive}
              </Button>
              <Button variant="danger" onClick={reset}>
                {t.quit}
              </Button>
            </Phone>
          ) : null}

          {step === "capture" ? (
            <Phone title={t.captureTitle} earnings={t.payouts}>
              <p className="whitespace-pre-wrap rounded-2xl bg-slate-100 p-3 text-sm">{t.question}</p>
              <Notice>
                {t.windowLabel}
                <b className="tabular-nums">
                  {pick(lang, "4分", "4m ")}
                  {String(59 - (Math.floor((now - startedAt) / 1000) % 60)).padStart(2, "0")}
                  {pick(lang, "秒", "s")}
                </b>
                {attempt > 1 ? t.attemptN(attempt) : ""}
              </Notice>
              {photo ? (
                // biome-ignore lint/performance/noImgElement: inline sample image
                <img src={photo} alt={t.photoAlt} className="aspect-[3/4] w-full rounded-2xl object-cover" />
              ) : (
                <div className="flex aspect-[3/4] w-full items-center justify-center rounded-2xl bg-black text-center text-sm text-slate-300">
                  {t.cameraPlaceholder[0]}
                  <br />
                  {t.cameraPlaceholder[1]}
                </div>
              )}
              <p className="text-xs text-slate-500">
                {types[TYPE].howTo}
                {t.noFaces}
              </p>
              {!photo ? (
                <Button onClick={() => press("shoot")} pressed={pressedId === "shoot"}>
                  {t.shoot}
                </Button>
              ) : (
                <>
                  <p className="text-sm text-slate-600">{t.located}</p>
                  <div className="grid gap-2">
                    <p className="text-xs font-medium text-slate-500">{t.pickTitle}</p>
                    <button
                      type="button"
                      onClick={() => press("pickSummary")}
                      className={`tap rounded-xl px-3 py-2 text-left text-sm ring-1 ${isSummary ? "bg-amber-50 ring-amber-400" : "bg-white ring-slate-300"} ${pressedId === "pickSummary" ? "scale-[0.98] ring-4 ring-teal-300" : ""}`}
                    >
                      {t.pickSummary}
                    </button>
                    <button
                      type="button"
                      onClick={() => press("pickExact")}
                      className={`tap rounded-xl px-3 py-2 text-left text-sm ring-1 ${isExact ? "bg-emerald-50 ring-emerald-400" : "bg-white ring-slate-300"} ${pressedId === "pickExact" ? "scale-[0.98] ring-4 ring-teal-300" : ""}`}
                    >
                      {t.pickExact}
                    </button>
                  </div>
                  <label className="grid gap-1 text-sm font-medium text-slate-700">
                    {t.answerText}
                    <textarea
                      value={answer}
                      onChange={(e) => {
                        setAuto(false);
                        setAnswer(e.target.value);
                      }}
                      maxLength={500}
                      rows={6}
                      className="rounded-2xl border border-slate-300 px-4 py-3 text-base leading-relaxed"
                      placeholder={t.placeholder}
                    />
                    <span className="text-right text-xs text-slate-400">{t.chars(answer.length)}</span>
                  </label>
                  <Button
                    onClick={() => press("submit")}
                    disabled={!answer.trim()}
                    pressed={pressedId === "submit"}
                  >
                    {t.submit}
                  </Button>
                </>
              )}
            </Phone>
          ) : null}

          {step === "checking" ? (
            <Phone title={t.verdict} earnings={t.payouts}>
              <Card>
                <p className="text-xl font-bold text-sky-700">{t.checking}</p>
                <ul className="mt-3 space-y-2 text-sm">
                  {t.checks.map((c, i) => (
                    <li key={c} className="flex items-center justify-between">
                      <span className="text-slate-700">{c}</span>
                      <span className={i < checkIdx ? "font-semibold text-emerald-700" : "text-slate-300"}>
                        {i < checkIdx ? t.pass : "…"}
                      </span>
                    </li>
                  ))}
                  <li className="flex items-center justify-between">
                    <span className="text-slate-700">{t.aiCheck}</span>
                    <span className={checkIdx >= nChecks ? "text-sky-700" : "text-slate-300"}>
                      {checkIdx >= nChecks ? t.checkingNow : "…"}
                    </span>
                  </li>
                </ul>
              </Card>
              <p className="text-center text-xs text-slate-500">{t.aiNote}</p>
            </Phone>
          ) : null}

          {step === "rejected" ? (
            <Phone title={t.verdict} earnings={t.payouts}>
              <Card>
                <p className="text-xl font-bold text-rose-700">{t.rejected}</p>
                <p className="mt-2 text-sm leading-relaxed text-slate-700">
                  {t.aiReview}
                  {isSummary ? t.rejectSummary : t.rejectMismatch}
                </p>
                <p className="mt-2 text-sm text-slate-500">{t.retriesLeft(3 - attempt)}</p>
              </Card>
              <Button onClick={() => press("retry")} pressed={pressedId === "retry"}>
                {t.retake}
              </Button>
              <Button variant="secondary" onClick={reset}>
                {t.backToList}
              </Button>
            </Phone>
          ) : null}

          {step === "verified" ? (
            <Phone title={t.verdict} earnings={t.payouts}>
              <Card>
                <div className="text-center">
                  <p className="text-5xl">✓</p>
                  <p className="mt-2 text-xl font-bold text-emerald-700">{t.verified}</p>
                  <p className="mt-2 text-sm text-slate-600">{t.paidAfter}</p>
                </div>
              </Card>
              <p className="text-center text-sm text-slate-500">
                {t.waitingPay}
                <Dots />
              </p>
            </Phone>
          ) : null}

          {step === "settled" ? (
            <Phone title={t.payouts} earnings={t.payouts}>
              <Card>
                <div className="flex items-baseline justify-between">
                  <span className="text-2xl font-bold text-teal-700">{BOUNTY} USDC</span>
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">
                    {t.received}
                  </span>
                </div>
                <p className="mt-1 text-xs font-medium text-slate-500">{types[TYPE].name}</p>
                <p className="mt-1 text-sm text-slate-600">
                  {new Date(now).toLocaleString(dateLocale(lang), { timeZone: "Asia/Tokyo" })}
                </p>
                <p className="mt-2 text-sm text-teal-700 underline">{t.viewTx}</p>
              </Card>
              <Notice tone="ok">{t.endNote}</Notice>
            </Phone>
          ) : null}
        </section>
      </div>
    </div>
  );
}

/** 13 §7: reads the agent's reasoning aloud when it appears. Off by default (sound that starts on its own is
 *  unwelcome); the choice lasts for the visit only. Hidden where the browser cannot speak. */
function ReadThinking({ on, text, label, lang }: { on: boolean; text: string; label: string; lang: Lang }) {
  const [supported, setSupported] = useState(false);
  const [voice, setVoice] = useState(false);
  useEffect(() => setSupported(speechSupported()), []);
  useEffect(() => {
    if (!voice || !on) return;
    speak(text, lang);
    return () => stopSpeaking();
  }, [voice, on, text, lang]);
  if (!supported) return null;
  return (
    <div className="flex justify-end">
      <button
        type="button"
        aria-pressed={voice}
        onClick={() => setVoice((v) => !v)}
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ring-1 transition ${voice ? "bg-teal-700 text-white ring-teal-700" : "text-slate-600 ring-slate-300"}`}
      >
        <svg
          viewBox="0 0 24 24"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M4 9v6h4l5 4V5L8 9z" strokeLinejoin="round" />
          {voice ? (
            <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" strokeLinecap="round" />
          ) : (
            <path d="M17 9l5 6M22 9l-5 6" strokeLinecap="round" />
          )}
        </svg>
        {label}
      </button>
    </div>
  );
}
