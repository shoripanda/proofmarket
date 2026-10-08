"use client";
import { type ReactNode, useEffect, useState } from "react";
import { LLink, useLang } from "@/lib/client/lang";
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

export const yen = (usdc: string) => `${usdc} USDC`;

export { SAFETY_NOTES, safetyNotes } from "./safety";
