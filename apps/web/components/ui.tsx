"use client";
import { type ReactNode, useEffect, useState } from "react";
import { LLink, useLang } from "@/lib/client/lang";
import { yenHint } from "@/lib/client/rate";
import { setSoundOn, soundOn } from "@/lib/client/sound";
import { appendTranscript, speak, speechSupported, stopSpeaking, useSpeechInput } from "@/lib/client/speech";
import { type Lang, pick } from "@/lib/lang";

export function Shell({ title, back, children }: { title: string; back?: string; children: ReactNode }) {
  const lang = useLang();
  return (
    <div className="mx-auto min-h-dvh max-w-md bg-white shadow-sm">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        {back ? (
          <LLink
            href={back}
            className="-ml-2 rounded-lg px-2 py-1 text-2xl leading-none text-slate-500"
            aria-label={pick(lang, "戻る", "Back")}
          >
            ‹
          </LLink>
        ) : null}
        <h1 className="flex-1 text-lg font-bold">{title}</h1>
        <SoundToggle />
        <LLink href="/payouts" className="text-sm font-medium text-teal-700">
          {pick(lang, "報酬", "Earnings")}
        </LLink>
      </header>
      <main className="space-y-4 p-4 pb-28">{children}</main>
    </div>
  );
}

export function Button({
  children,
  onClick,
  variant = "primary",
  disabled,
  type = "button",
  pressed = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: "primary" | "secondary" | "danger";
  disabled?: boolean;
  type?: "button" | "submit";
  /** Drawn as if a finger is on it (the /try autoplay shows taps this way). */
  pressed?: boolean;
}) {
  const cls = {
    primary: "bg-teal-700 text-white hover:bg-teal-600 hover:shadow-md active:bg-teal-800",
    secondary:
      "bg-white text-slate-800 ring-1 ring-slate-300 hover:bg-slate-50 hover:ring-slate-400 active:bg-slate-100",
    danger: "bg-white text-rose-700 ring-1 ring-rose-300 hover:bg-rose-50 active:bg-rose-100",
  }[variant];
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`w-full rounded-2xl px-4 py-4 text-base font-bold transition active:scale-[0.98] disabled:opacity-40 disabled:active:scale-100 ${cls} ${pressed ? "scale-95 ring-4 ring-teal-300 ring-offset-2" : ""}`}
    >
      {children}
    </button>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-slate-200 bg-white p-4">{children}</div>;
}

export function Notice({ tone = "info", children }: { tone?: "info" | "error" | "ok"; children: ReactNode }) {
  const cls = {
    info: "bg-slate-100 text-slate-700",
    error: "bg-rose-50 text-rose-800 ring-1 ring-rose-200",
    ok: "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200",
  }[tone];
  return <div className={`rounded-xl px-4 py-3 text-sm leading-relaxed ${cls}`}>{children}</div>;
}

export function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/** "12分34秒" / "12m 34s", or "終了" / "ended" once the moment has passed. */
export function remaining(iso: string, now: number, lang: Lang = "ja") {
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return pick(lang, "終了", "ended");
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  if (lang === "en")
    return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m ${String(s).padStart(2, "0")}s`;
  return m >= 60 ? `${Math.floor(m / 60)}時間${m % 60}分` : `${m}分${String(s).padStart(2, "0")}秒`;
}

/** 24×24 line icons (stroke only) for the read-aloud, voice and sound controls. */
function Icon({ d }: { d: string[] }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {d.map((x) => (
        <path key={x} d={x} />
      ))}
    </svg>
  );
}
const SPEAKER = "M4 9h4l5-4v14l-5-4H4z";
const ICON = {
  speaker: [SPEAKER, "M16 9a4 4 0 0 1 0 6", "M19 6a8 8 0 0 1 0 12"],
  muted: [SPEAKER, "M16 9l5 6", "M21 9l-5 6"],
  stop: ["M7 7h10v10H7z"],
  mic: ["M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z", "M5 11a7 7 0 0 0 14 0", "M12 18v3"],
};

/** 13 §6: reads `text` aloud; tap again to stop. Renders nothing where the browser cannot speak. */
export function ListenButton({ text }: { text: string }) {
  const lang = useLang();
  const [supported, setSupported] = useState(false);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    setSupported(speechSupported());
    return () => stopSpeaking();
  }, []);
  if (!supported) return null;
  function toggle() {
    if (playing) {
      stopSpeaking();
      setPlaying(false);
      return;
    }
    setPlaying(speak(text, lang, () => setPlaying(false)).supported);
  }
  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={playing}
      aria-label={
        playing ? pick(lang, "読み上げを止める", "Stop reading") : pick(lang, "読み上げる", "Read aloud")
      }
      className={`inline-flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-sm font-bold ring-1 transition active:scale-95 ${playing ? "bg-teal-700 text-white ring-teal-700" : "bg-white text-teal-700 ring-teal-300"}`}
    >
      <Icon d={playing ? ICON.stop : ICON.speaker} />
      {playing ? pick(lang, "止める", "Stop") : pick(lang, "聞く", "Listen")}
    </button>
  );
}

/** 13 §6: "Speak" for a text answer. Adds what was said to the box, so it can be read and fixed before sending. */
export function SpeakButton({ onText }: { onText: (append: (prev: string) => string) => void }) {
  const lang = useLang();
  const mic = useSpeechInput(lang);
  if (!mic.supported) return null;
  return (
    <button
      type="button"
      onClick={() =>
        mic.listening ? mic.stop() : mic.start((said) => onText((prev) => appendTranscript(prev, said, lang)))
      }
      aria-pressed={mic.listening}
      className={`inline-flex items-center gap-1 justify-self-start rounded-full px-3 py-1.5 text-sm font-bold ring-1 transition active:scale-95 ${mic.listening ? "animate-pulse bg-rose-600 text-white ring-rose-600" : "bg-white text-teal-700 ring-teal-300"}`}
    >
      <Icon d={ICON.mic} />
      {mic.listening
        ? pick(lang, "聞いています…（止める）", "Listening… (stop)")
        : pick(lang, "話して入力", "Speak")}
    </button>
  );
}

/** 13 §6: turns the cues (sound and vibration) on and off. Remembered in localStorage "pm.sound". */
export function SoundToggle() {
  const lang = useLang();
  const [on, setOn] = useState(true);
  useEffect(() => setOn(soundOn()), []);
  return (
    <button
      type="button"
      onClick={() => {
        setSoundOn(!on);
        setOn(!on);
      }}
      aria-pressed={on}
      aria-label={
        on
          ? pick(lang, "音と振動: オン", "Sound and vibration: on")
          : pick(lang, "音と振動: オフ", "Sound and vibration: off")
      }
      title={
        on
          ? pick(lang, "音と振動: オン", "Sound and vibration: on")
          : pick(lang, "音と振動: オフ", "Sound and vibration: off")
      }
      className={`rounded-lg p-1.5 ${on ? "text-teal-700" : "text-slate-400"}`}
    >
      <Icon d={on ? ICON.speaker : ICON.muted} />
    </button>
  );
}

/** "0.30 USDC（約 45 円）": the amount with a yen estimate, so no one has to know what USDC is worth. */
export const yen = (usdc: string, lang: Lang = "ja") =>
  pick(lang, `${usdc} USDC（${yenHint(usdc, lang)}）`, `${usdc} USDC (${yenHint(usdc, lang)})`);

export { SAFETY_NOTES, safetyNotes } from "./safety";
