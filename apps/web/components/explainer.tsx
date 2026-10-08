"use client";
// "30 秒でわかる" (13 §7): the request flow told in six scenes. One play button; the narration (Kokoro mp3 in
// public/audio) moves the lit stage on `timeupdate`, with the scene's sentence as a one-line caption. Where sound
// cannot play (no audio file for the language, autoplay blocked, a decode error) the captions run on a timer.
import { useCallback, useEffect, useRef, useState } from "react";
import { FLOW_ICONS, FLOW_STAGES, FlowDiagram } from "@/components/flow-diagram";
import { useLang } from "@/lib/client/lang";
import { pick } from "@/lib/lang";
import en from "@/public/audio/explainer-en.json";
import ja from "@/public/audio/explainer-ja.json";

type Script = { audio: string | null; duration: number; lines: { start: number; text: string }[] };
const SCRIPTS: Record<"ja" | "en", Script> = { ja, en };

/** The scene playing at `t` seconds: the last line that has started. */
export function sceneAt(lines: Script["lines"], t: number): number {
  let k = 0;
  lines.forEach((l, i) => {
    if (l.start <= t) k = i;
  });
  return k;
}

type Phase = "idle" | "playing" | "done";

export function Explainer() {
  const lang = useLang();
  const script = SCRIPTS[lang];
  const [phase, setPhase] = useState<Phase>("idle");
  const [scene, setScene] = useState(-1);
  const [muted, setMuted] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopTimer = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
  }, []);

  const finish = useCallback(() => {
    stopTimer();
    setPhase("done");
    setScene(FLOW_STAGES.length - 1);
  }, [stopTimer]);

  /** Captions only: walk the same timings on the clock. */
  const runSilent = useCallback(() => {
    setMuted(true);
    const t0 = Date.now();
    stopTimer();
    timer.current = setInterval(() => {
      const t = (Date.now() - t0) / 1000;
      if (t >= script.duration) finish();
      else setScene(sceneAt(script.lines, t));
    }, 200);
  }, [script, stopTimer, finish]);

  useEffect(
    () => () => {
      stopTimer();
      audio.current?.pause();
    },
    [stopTimer],
  );

  function play() {
    setPhase("playing");
    setScene(0);
    setMuted(false);
    const a = audio.current;
    if (!script.audio || !a) return runSilent();
    a.currentTime = 0;
    a.play().catch(runSilent);
  }

  function stop() {
    stopTimer();
    audio.current?.pause();
    setPhase("idle");
    setScene(-1);
  }

  const k = Math.max(scene, 0);
  const stage = FLOW_STAGES[k]?.key ?? "ask";
  return (
    <section className="mx-auto max-w-5xl px-4 py-10" aria-labelledby="explainer-title">
      <div className="rounded-3xl border border-teal-100 bg-gradient-to-b from-teal-50/60 to-white p-5 sm:p-8">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={phase === "playing" ? stop : play}
            aria-label={
              phase === "playing"
                ? pick(lang, "止める", "Stop")
                : pick(lang, "30 秒の説明を再生", "Play the 30-second tour")
            }
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-teal-700 text-white shadow-md transition hover:bg-teal-800 active:scale-95"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-7 w-7"
              fill="none"
              stroke="#ffffff"
              strokeWidth="2.2"
              aria-hidden="true"
            >
              {phase === "playing" ? (
                <path d="M8 6v12M16 6v12" strokeLinecap="round" />
              ) : phase === "done" ? (
                <path d="M4 12a8 8 0 1 0 2.5-5.8M4 4v4h4" strokeLinecap="round" strokeLinejoin="round" />
              ) : (
                <path d="M8 5l11 7-11 7z" strokeLinejoin="round" />
              )}
            </svg>
          </button>
          <div>
            <h2 id="explainer-title" className="text-2xl font-bold tracking-tight">
              {pick(lang, "30 秒でわかる", "ProofMarket in 30 seconds")}
            </h2>
            <p className="text-sm text-slate-500">
              {muted
                ? pick(
                    lang,
                    "音が出せないので、字幕だけで進みます",
                    "No sound here, so the captions run on their own",
                  )
                : pick(lang, "押すと音声が流れます", "Tap to play with sound")}
            </p>
          </div>
        </div>

        <div className="mt-6 grid items-center gap-6 sm:grid-cols-[160px_1fr]">
          {/* the current stage, big enough to read on a phone */}
          <div className="mx-auto flex h-36 w-36 items-center justify-center rounded-full bg-white ring-4 ring-teal-700/15">
            <svg
              key={stage}
              viewBox="0 0 24 24"
              className="h-20 w-20 motion-safe:animate-[pm-pop_.45s_ease-out]"
              fill="none"
              // explicit colours, so the picture survives with every letter hidden (13 §7 check)
              stroke={phase === "idle" ? "#94a3b8" : "#0f766e"}
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d={FLOW_ICONS[stage]} />
            </svg>
          </div>
          <div className="min-w-0">
            <FlowDiagram active={scene} />
          </div>
        </div>

        <p
          className="mt-4 min-h-[3.5rem] rounded-2xl bg-slate-900/90 px-4 py-3 text-center text-lg font-semibold leading-snug text-white"
          aria-live="polite"
        >
          {phase === "idle" ? pick(lang, "▶ を押してください", "Press ▶") : script.lines[k]?.text}
        </p>
      </div>
      {script.audio ? (
        // biome-ignore lint/a11y/useMediaCaption: the caption is drawn above from the same script
        <audio
          ref={audio}
          src={script.audio}
          preload="none"
          onTimeUpdate={(e) => setScene(sceneAt(script.lines, e.currentTarget.currentTime))}
          onEnded={finish}
          onError={() => phase === "playing" && runSilent()}
        />
      ) : null}
    </section>
  );
}
