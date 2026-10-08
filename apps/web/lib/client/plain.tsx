"use client";
// "Plain words" (13 §0, §7): jargon on the public pages can be swapped for everyday words. On by default; the
// choice is kept in localStorage `pm.plain`. <Term k="solana"> wraps one word; <Plain>{text}</Plain> finds the
// words inside a sentence, so the pages keep their copy as plain strings. /developers does not use either.
import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useLang } from "@/lib/client/lang";
import type { Lang } from "@/lib/lang";

export type TermKey = "solana" | "usdc" | "escrow" | "mcp" | "x402" | "api-key" | "wallet";

/** The word as written on the page, and the everyday word that replaces it. */
export const TERMS: Record<TermKey, Record<Lang, { word: string; plain: string }>> = {
  solana: {
    ja: { word: "Solana", plain: "改ざんできない台帳" },
    en: { word: "Solana", plain: "a tamper-proof ledger" },
  },
  usdc: {
    ja: { word: "USDC", plain: "ドル建てのデジタルマネー" },
    en: { word: "USDC", plain: "digital dollars" },
  },
  escrow: {
    ja: { word: "エスクロー", plain: "預かり" },
    en: { word: "escrow", plain: "holding" },
  },
  mcp: {
    ja: { word: "MCP", plain: "AI の接続口" },
    en: { word: "MCP", plain: "AI connector" },
  },
  x402: {
    ja: { word: "x402", plain: "その場払い" },
    en: { word: "x402", plain: "pay-on-the-spot" },
  },
  "api-key": {
    ja: { word: "API キー", plain: "利用の鍵" },
    en: { word: "API key", plain: "access key" },
  },
  wallet: {
    ja: { word: "ウォレット", plain: "デジタルのお財布" },
    en: { word: "wallet", plain: "digital wallet" },
  },
};

/**
 * Phrases found inside sentences, longest first. `plain` may differ from TERMS when the grammar around the word
 * changes ("5 USDC" → "5 ドル相当", "an escrow account" → "a holding account").
 */
const PHRASES: Record<Lang, { re: RegExp; k: TermKey; plain: (m: RegExpExecArray) => string }[]> = {
  ja: [
    // Japanese copy puts a space around Latin words ("結果は Solana に"); the swap takes those spaces with it.
    { re: / ?Solana Devnet ?/, k: "solana", plain: () => "試験用の台帳" },
    { re: / ?Solana のウォレット/, k: "wallet", plain: () => "デジタルのお財布" },
    { re: / ?Solana のエスクロー/, k: "escrow", plain: () => "改ざんできない預かり" },
    { re: / ?Solana ?/, k: "solana", plain: () => "改ざんできない台帳" },
    { re: /テスト用 ?USDC ?/, k: "usdc", plain: () => "テスト用のデジタルマネー" },
    { re: /(\d+(?:\.\d+)?) ?USDC ?/, k: "usdc", plain: (m) => `${m[1]} ドル相当` },
    { re: / ?USDC ?/, k: "usdc", plain: () => "ドル建てのデジタルマネー" },
    { re: /エスクロー/, k: "escrow", plain: () => "預かり" },
    { re: / ?MCP ?/, k: "mcp", plain: () => "AI の接続口" },
    { re: / ?x402 ?/, k: "x402", plain: () => "その場払い" },
    { re: / ?API ?キー/, k: "api-key", plain: () => "利用の鍵" },
    { re: /ウォレット/, k: "wallet", plain: () => "デジタルのお財布" },
  ],
  en: [
    { re: /Solana Devnet/, k: "solana", plain: () => "a test ledger" },
    { re: /Solana (wallet)/, k: "wallet", plain: () => "digital wallet" },
    { re: /\bon Solana\b/, k: "solana", plain: () => "on a tamper-proof ledger" },
    { re: /Solana/, k: "solana", plain: () => "a tamper-proof ledger" },
    { re: /test USDC/, k: "usdc", plain: () => "test digital dollars" },
    { re: /(\d+(?:\.\d+)?) ?USDC/, k: "usdc", plain: (m) => `$${m[1]} in digital dollars` },
    { re: /USDC/, k: "usdc", plain: () => "digital dollars" },
    { re: /\b([Aa])n escrow account/, k: "escrow", plain: (m) => `${m[1]} holding account` },
    { re: /\bescrow\b/, k: "escrow", plain: () => "holding" },
    { re: /\bMCP\b/, k: "mcp", plain: () => "AI connector" },
    { re: /\bx402\b/, k: "x402", plain: () => "pay-on-the-spot" },
    { re: /\bAPI keys?\b/, k: "api-key", plain: (m) => (m[0].endsWith("s") ? "access keys" : "access key") },
    {
      re: /\bwallets?\b/,
      k: "wallet",
      plain: (m) => (m[0].endsWith("s") ? "digital wallets" : "digital wallet"),
    },
  ],
};

export type PlainPiece = string | { k: TermKey; word: string; plain: string };

/** Split a sentence into text and the jargon found in it. Pure, so it can be tested without a DOM. */
export function splitTerms(text: string, lang: Lang): PlainPiece[] {
  const out: PlainPiece[] = [];
  let rest = text;
  while (rest) {
    let best: { at: number; m: RegExpExecArray; p: (typeof PHRASES)[Lang][number] } | null = null;
    for (const p of PHRASES[lang]) {
      const m = p.re.exec(rest);
      // earliest match wins; on a tie the earlier (longer) phrase in the list wins
      if (m && (!best || m.index < best.at)) best = { at: m.index, m, p };
    }
    if (!best) {
      out.push(rest);
      break;
    }
    if (best.at > 0) out.push(rest.slice(0, best.at));
    out.push({ k: best.p.k, word: best.m[0], plain: best.p.plain(best.m) });
    rest = rest.slice(best.at + best.m[0].length);
  }
  return out;
}

const STORAGE_KEY = "pm.plain";

const PlainContext = createContext<{ on: boolean; setOn: (on: boolean) => void }>({
  on: true,
  setOn: () => {},
});

export function PlainProvider({ children }: { children: ReactNode }) {
  const [on, setOnState] = useState(true);
  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === "0") setOnState(false);
    } catch {
      // storage blocked: keep the default
    }
  }, []);
  const setOn = useCallback((v: boolean) => {
    setOnState(v);
    try {
      localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
    } catch {
      // storage blocked: the switch still works for this page
    }
  }, []);
  const value = useMemo(() => ({ on, setOn }), [on, setOn]);
  return <PlainContext.Provider value={value}>{children}</PlainContext.Provider>;
}

export const usePlain = () => useContext(PlainContext);

function Swap({ word, plain }: { word: string; plain: string }) {
  const { on } = usePlain();
  if (!on) return <>{word}</>;
  return (
    <span
      title={word}
      className="decoration-teal-600/50 decoration-dotted underline-offset-4 [text-decoration-line:underline]"
    >
      {plain}
    </span>
  );
}

/** One jargon word. Children override the word shown when plain words are off. */
export function Term({ k, children }: { k: TermKey; children?: string }) {
  const lang = useLang();
  const t = TERMS[k][lang];
  return <Swap word={children ?? t.word} plain={t.plain} />;
}

/** A sentence whose jargon follows the plain-words switch. */
export function Plain({ children }: { children: string }) {
  const lang = useLang();
  return (
    <>
      {splitTerms(children, lang).map((p, i) =>
        typeof p === "string" ? (
          p
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: pieces of one fixed sentence, never reordered
          <Swap key={i} word={p.word} plain={p.plain} />
        ),
      )}
    </>
  );
}

/** Header switch. A pill with a speech-bubble icon; pressed = plain words on. */
export function PlainToggle() {
  const { on, setOn } = usePlain();
  const lang = useLang();
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => setOn(!on)}
      title={lang === "en" ? "Swap jargon for everyday words" : "専門語をふだんの言葉に置き換える"}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ring-1 transition ${
        on ? "bg-teal-50 text-teal-800 ring-teal-600" : "bg-white text-slate-500 ring-slate-300"
      }`}
    >
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <path d="M4 5h16v11H9l-5 4z" strokeLinejoin="round" />
        {on ? <path d="M8 10.5l2.5 2.5L16 8" strokeLinecap="round" strokeLinejoin="round" /> : null}
      </svg>
      {lang === "en" ? "Plain words" : "やさしい言葉"}
    </button>
  );
}
