"use client";
// 13 §6: reading aloud and answering by voice, with nothing but the phone's browser. No server, no API change.
// Browsers without speechSynthesis / SpeechRecognition get no button rather than a broken one.
import { useCallback, useEffect, useRef, useState } from "react";
import type { Lang } from "@/lib/lang";

export const speechTag = (lang: Lang) => (lang === "en" ? "en-US" : "ja-JP");

/** The voice for "ja-JP" / "en-US": an exact match first, then the same language ("ja", "en-GB"), else none. */
export function pickVoice<V extends { lang: string }>(voices: readonly V[], tag: string): V | undefined {
  const norm = (s: string) => s.replace("_", "-").toLowerCase();
  const want = norm(tag);
  const base = want.split("-")[0];
  return voices.find((v) => norm(v.lang) === want) ?? voices.find((v) => norm(v.lang).split("-")[0] === base);
}

export const speechSupported = () =>
  typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;

/**
 * Read `text` aloud, stopping whatever was being read. `onEnd` runs when it finishes or is cut off.
 * Returns `{ supported: false }` (and does nothing) where the browser cannot speak.
 */
export function speak(text: string, lang: Lang, onEnd?: () => void): { supported: boolean } {
  if (!speechSupported()) return { supported: false };
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = speechTag(lang);
  const voice = pickVoice(synth.getVoices(), u.lang);
  if (voice) u.voice = voice;
  if (onEnd) {
    u.onend = onEnd;
    u.onerror = onEnd;
  }
  synth.speak(u);
  return { supported: true };
}

export function stopSpeaking() {
  if (speechSupported()) window.speechSynthesis.cancel();
}

/** Adds a transcript to what is already in the box: Japanese runs on, English gets a space. */
export function appendTranscript(prev: string, said: string, lang: Lang): string {
  const add = said.trim();
  if (!add) return prev;
  if (!prev.trim()) return add;
  return lang === "en" ? `${prev.trimEnd()} ${add}` : `${prev.trimEnd()}${add}`;
}

interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/**
 * One utterance of speech → text. `supported` stays false until mounted (and on browsers without
 * SpeechRecognition), so the caller renders no button in either case.
 */
export function useSpeechInput(lang: Lang) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const rec = useRef<Recognition | null>(null);

  useEffect(() => {
    setSupported(recognitionCtor() !== null);
    return () => rec.current?.abort();
  }, []);

  const start = useCallback(
    (onText: (text: string) => void) => {
      const Ctor = recognitionCtor();
      if (!Ctor) return;
      rec.current?.abort();
      const r = new Ctor();
      r.lang = speechTag(lang);
      r.continuous = false;
      r.interimResults = false;
      r.maxAlternatives = 1;
      r.onresult = (e) => {
        const text = e.results[0]?.[0]?.transcript ?? "";
        if (text) onText(text);
      };
      r.onend = () => setListening(false);
      r.onerror = () => setListening(false);
      rec.current = r;
      stopSpeaking();
      try {
        r.start();
        setListening(true);
      } catch {
        setListening(false);
      }
    },
    [lang],
  );

  const stop = useCallback(() => rec.current?.stop(), []);

  return { supported, listening, start, stop };
}
