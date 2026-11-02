"use client";
// Audio clip for a sensory report (docs/architecture 16 §9): only when the request asks for one, at most
// `maxSeconds`. The worker can play it back, record again or delete it before sending. Nothing listens to it on
// our side; the requester can play it for 30 days.
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui";
import type { Lang } from "@/lib/lang";
import { pick } from "@/lib/lang";

export interface Clip {
  blob: Blob;
  /** "audio/mp4" (Safari) or "audio/webm" (Chrome), without codec parameters. */
  type: "audio/mp4" | "audio/webm";
  durationMs: number;
  url: string;
}

/** The container this browser records, preferring MP4 (what iOS Safari makes). */
function recorderType(): { mime: string; type: Clip["type"] } | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const [mime, type] of [
    ["audio/mp4", "audio/mp4"],
    ["audio/webm;codecs=opus", "audio/webm"],
    ["audio/webm", "audio/webm"],
  ] as const) {
    if (MediaRecorder.isTypeSupported(mime)) return { mime, type };
  }
  return null;
}

type State = { s: "idle" } | { s: "recording"; left: number } | { s: "failed" };

export function AudioClip({
  lang,
  maxSeconds,
  required,
  disabled,
  onChange,
}: {
  lang: Lang;
  maxSeconds: number;
  required: boolean;
  disabled?: boolean;
  onChange: (c: Clip | null) => void;
}) {
  const [state, setState] = useState<State>({ s: "idle" });
  const [clip, setClip] = useState<Clip | null>(null);
  const stop = useRef<() => void>(() => {});
  useEffect(() => () => stop.current(), []);
  useEffect(() => () => (clip ? URL.revokeObjectURL(clip.url) : undefined), [clip]);

  const set = (c: Clip | null) => {
    setClip(c);
    onChange(c);
  };

  async function record() {
    const kind = recorderType();
    let stream: MediaStream;
    try {
      if (!kind) throw new Error("no recorder");
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setState({ s: "failed" });
      return;
    }
    set(null);
    const rec = new MediaRecorder(stream, { mimeType: kind.mime });
    const parts: Blob[] = [];
    const started = performance.now();
    let tick: ReturnType<typeof setInterval> | undefined;
    rec.ondataavailable = (e) => {
      if (e.data.size) parts.push(e.data);
    };
    rec.onstop = () => {
      clearInterval(tick);
      for (const t of stream.getTracks()) t.stop();
      const durationMs = Math.min(Math.round(performance.now() - started), maxSeconds * 1000);
      const blob = new Blob(parts, { type: kind.type });
      setState({ s: "idle" });
      if (blob.size && durationMs >= 1000)
        set({ blob, type: kind.type, durationMs, url: URL.createObjectURL(blob) });
    };
    stop.current = () => {
      if (rec.state !== "inactive") rec.stop();
    };
    rec.start();
    setState({ s: "recording", left: maxSeconds });
    tick = setInterval(() => {
      const left = maxSeconds - Math.floor((performance.now() - started) / 1000);
      // Stop a little before the limit so the file is never longer than the request allows.
      if (performance.now() - started >= maxSeconds * 1000 - 250) stop.current();
      else setState({ s: "recording", left });
    }, 200);
  }

  return (
    <section className="grid gap-3 rounded-2xl border border-slate-200 p-4">
      <h3 className="font-bold">
        {pick(lang, `音の録音（${maxSeconds}秒まで）`, `Sound clip (up to ${maxSeconds} s)`)}
        <span className="ml-2 text-sm font-normal text-slate-500">
          {required ? pick(lang, "必須", "required") : pick(lang, "任意", "optional")}
        </span>
      </h3>
      <p className="rounded-xl bg-amber-50 p-3 text-sm leading-relaxed text-amber-900">
        {pick(
          lang,
          "周りの音を録ってください。会話は録らないでください。録られることに同意していない人の声も入れないでください。",
          "Record the surroundings, not a conversation. Do not record anyone who has not agreed.",
        )}
      </p>
      {state.s === "failed" ? (
        <p className="text-sm text-rose-700">
          {pick(
            lang,
            "マイクを使えませんでした。ブラウザの設定でマイクを許可してから、もう一度押してください。",
            "The microphone could not be used. Allow it in the browser settings and try again.",
          )}
        </p>
      ) : null}
      {clip ? (
        <>
          {/* biome-ignore lint/a11y/useMediaCaption: a recording of ambient sound has no speech to caption */}
          <audio controls src={clip.url} className="w-full" />
          <p className="text-xs text-slate-500">
            {pick(
              lang,
              `${(clip.durationMs / 1000).toFixed(1)}秒`,
              `${(clip.durationMs / 1000).toFixed(1)} s`,
            )}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={record} disabled={disabled}>
              {pick(lang, "録り直す", "Record again")}
            </Button>
            <Button variant="danger" onClick={() => set(null)} disabled={disabled}>
              {pick(lang, "消す", "Delete")}
            </Button>
          </div>
        </>
      ) : state.s === "recording" ? (
        <Button onClick={() => stop.current()}>
          {pick(lang, `止める（残り${state.left}秒）`, `Stop (${state.left} s left)`)}
        </Button>
      ) : (
        <Button variant="secondary" onClick={record} disabled={disabled}>
          {pick(lang, "録音を始める", "Start recording")}
        </Button>
      )}
      <p className="text-xs text-slate-500">
        {pick(
          lang,
          "録音を聞けるのは依頼者だけで、30日後に消えます。AI の確認には使いません。",
          "Only the requester can play it, and it is deleted after 30 days. AI review does not listen to it.",
        )}
      </p>
    </section>
  );
}
