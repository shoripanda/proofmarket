"use client";
// Sensory report answer (docs/architecture 16): one block per sense the requester chose, each starting with
// "report / nothing there / skip". Hearing measures the sound level on the phone for 10 s; no audio is kept.
import {
  SENSE_CATALOGUE,
  SENSE_STATUSES,
  type Sense,
  type SenseStatus,
  SOUND_DB,
} from "@proofmarket/core/task/senses";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormFieldView } from "@/lib/answers";
import type { Lang } from "@/lib/lang";
import { pick } from "@/lib/lang";
import {
  BODY_NOTE,
  MEASURE_NOTE,
  SENSE_FIELD_TEXT,
  SENSE_NAME,
  SENSE_STATUS_TEXT,
  SENSE_WORD,
  senseText,
} from "@/lib/senses-text";

export interface SoundWindow {
  started_at: string;
  ended_at: string;
}
export interface SensoryValue {
  answer: Record<string, unknown> | null;
  sound: SoundWindow | null;
}

const MEASURE_MS = 10_000;
/**
 * 16 §8: browsers give dBFS; this fixed offset per platform turns it into an approximate level. Provisional:
 * both platforms start at the same value until real phones are compared with a sound meter.
 */
const DB_OFFSET = { ios: 100, android: 100, other: 100 } as const;
const platform = (): keyof typeof DB_OFFSET => {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "other";
};
const toDb = (meanSquare: number) => {
  const dbfs = 10 * Math.log10(Math.max(meanSquare, 1e-12));
  const v = dbfs + DB_OFFSET[platform()];
  return Math.round(Math.min(SOUND_DB.max, Math.max(SOUND_DB.min, v)) * 10) / 10;
};

type Measure =
  | { state: "idle" }
  | { state: "running"; live: number; startedAt: string }
  | { state: "done"; level: number; peak: number; window: SoundWindow }
  | { state: "failed" };

/** Measure for 10 s: the energy mean over the whole time (Leq) and the loudest 1 s window. */
function useSoundMeter() {
  const [m, setM] = useState<Measure>({ state: "idle" });
  const stop = useRef<(() => void) | null>(null);
  useEffect(() => () => stop.current?.(), []);

  async function start() {
    stop.current?.();
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
        video: false,
      });
    } catch {
      setM({ state: "failed" });
      return;
    }
    const ctx = new AudioContext();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const buf = new Float32Array(analyser.fftSize);
    const startedAt = new Date();
    let total = 0;
    let frames = 0;
    let second = { sum: 0, n: 0, from: performance.now() };
    let peak = 0;
    let raf = 0;
    const end = () => {
      cancelAnimationFrame(raf);
      for (const t of stream.getTracks()) t.stop();
      void ctx.close();
    };
    stop.current = end;
    setM({ state: "running", live: SOUND_DB.min, startedAt: startedAt.toISOString() });
    const t0 = performance.now();
    const tick = () => {
      analyser.getFloatTimeDomainData(buf);
      let sq = 0;
      for (const x of buf) sq += x * x;
      const ms = sq / buf.length;
      total += ms;
      frames += 1;
      second.sum += ms;
      second.n += 1;
      const now = performance.now();
      if (now - second.from >= 1000) {
        peak = Math.max(peak, second.sum / second.n);
        second = { sum: 0, n: 0, from: now };
      }
      if (now - t0 >= MEASURE_MS) {
        end();
        if (second.n > 0) peak = Math.max(peak, second.sum / second.n);
        const level = toDb(total / Math.max(frames, 1));
        setM({
          state: "done",
          level,
          peak: Math.max(level, toDb(peak)),
          window: { started_at: startedAt.toISOString(), ended_at: new Date().toISOString() },
        });
        return;
      }
      setM({ state: "running", live: toDb(ms), startedAt: startedAt.toISOString() });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }
  return { m, start };
}

type Values = Record<string, string | string[]>;

export function SensoryForm({
  lang,
  fields,
  onChange,
}: {
  lang: Lang;
  fields: FormFieldView[];
  onChange: (v: SensoryValue) => void;
}) {
  const senses = useMemo(
    () =>
      (["sight", "hearing", "smell", "taste", "touch"] as const).filter((s) =>
        fields.some((f) => f.key === `${s}_status`),
      ),
    [fields],
  );
  const [status, setStatus] = useState<Partial<Record<Sense, SenseStatus>>>({});
  const [v, setV] = useState<Values>({});
  const meter = useSoundMeter();

  // Build the answer whenever anything changes; null until every sense has a status and its required values.
  useEffect(() => {
    const out: Record<string, unknown> = {};
    let ok = senses.length > 0;
    let anyAnswer = false;
    for (const s of senses) {
      const st = status[s];
      if (!st) {
        ok = false;
        continue;
      }
      out[`${s}_status`] = st;
      const note = String(v[`${s}_note`] ?? "").trim();
      if (note) out[`${s}_note`] = note;
      if (st !== "declined") anyAnswer = true;
      if (st !== "reported") continue;
      for (const f of SENSE_CATALOGUE[s].fields) {
        const x = v[f.key];
        if (f.type === "tags") {
          if (Array.isArray(x) && x.length) out[f.key] = x;
        } else if (typeof x === "string" && x !== "") {
          out[f.key] = f.type === "enum" ? x : Number(x);
        }
      }
      if (s === "hearing" && meter.m.state === "done") {
        out.hearing_level_db = meter.m.level;
        out.hearing_peak_db = meter.m.peak;
      }
      if (SENSE_CATALOGUE[s].required.some((k) => out[k] === undefined)) ok = false;
    }
    const measured = out.hearing_level_db !== undefined && meter.m.state === "done";
    onChange({
      answer: ok && anyAnswer ? out : null,
      sound: measured && meter.m.state === "done" ? meter.m.window : null,
    });
  }, [senses, status, v, meter.m, onChange]);

  const set = (k: string, x: string | string[]) => setV((s) => ({ ...s, [k]: x }));
  const fieldText = (key: string) => SENSE_FIELD_TEXT[key];

  return (
    <div className="grid gap-4">
      {senses.map((s) => (
        <section key={s} className="grid gap-3 rounded-2xl border border-slate-200 p-3">
          <h3 className="text-base font-bold text-slate-800">{senseText(lang, SENSE_NAME[s], s)}</h3>
          {s === "taste" || s === "touch" ? (
            <p className="rounded-xl bg-amber-50 p-2 text-xs leading-relaxed text-amber-900">
              {senseText(lang, BODY_NOTE, "")}
            </p>
          ) : null}
          <div className="grid grid-cols-3 gap-2">
            {SENSE_STATUSES.map((st) => (
              <button
                key={st}
                type="button"
                aria-pressed={status[s] === st}
                onClick={() => setStatus((x) => ({ ...x, [s]: st }))}
                className={`rounded-xl px-2 py-2 text-sm font-bold transition ${status[s] === st ? "bg-teal-600 text-white ring-4 ring-teal-200" : "bg-slate-100 text-slate-800"}`}
              >
                {senseText(lang, SENSE_STATUS_TEXT[st], st)}
              </button>
            ))}
          </div>
          {status[s] === "reported" ? (
            <>
              {s === "hearing" ? <Meter lang={lang} m={meter.m} start={meter.start} /> : null}
              {SENSE_CATALOGUE[s].fields
                .filter((f) => f.type !== "number")
                .map((f) => (
                  <div key={f.key} className="grid gap-1 text-sm font-medium text-slate-700">
                    <span>{senseText(lang, fieldText(f.key)?.label, f.label)}</span>
                    {f.type === "scale" ? (
                      <div className="grid gap-1">
                        <fieldset className="flex justify-between gap-1" aria-label={f.label}>
                          {["1", "2", "3", "4", "5"].map((n) => (
                            <button
                              key={n}
                              type="button"
                              aria-pressed={v[f.key] === n}
                              aria-label={n}
                              onClick={() => set(f.key, v[f.key] === n ? "" : n)}
                              className={`aspect-square max-w-12 flex-1 rounded-full border-2 transition ${v[f.key] === n ? "border-teal-600 bg-teal-600 ring-4 ring-teal-200" : "border-slate-300 bg-white"}`}
                            />
                          ))}
                        </fieldset>
                        <div className="flex justify-between text-xs font-normal text-slate-500">
                          <span>{senseText(lang, fieldText(f.key)?.ends?.[0], f.labels[0])}</span>
                          <span>{senseText(lang, fieldText(f.key)?.ends?.[1], f.labels[1])}</span>
                        </div>
                      </div>
                    ) : f.type === "tags" || f.type === "enum" ? (
                      <div className="grid grid-cols-2 gap-2">
                        {f.values.map((w) => {
                          const cur = v[f.key];
                          const on = f.type === "tags" ? Array.isArray(cur) && cur.includes(w) : cur === w;
                          const toggle = () => {
                            if (f.type === "enum") return set(f.key, on ? "" : w);
                            const list = Array.isArray(cur) ? cur : [];
                            if (on)
                              return set(
                                f.key,
                                list.filter((x) => x !== w),
                              );
                            if (list.length < f.max) set(f.key, [...list, w]);
                          };
                          return (
                            <button
                              key={w}
                              type="button"
                              aria-pressed={on}
                              onClick={toggle}
                              className={`rounded-xl px-3 py-2 text-sm font-bold transition ${on ? "bg-teal-600 text-white ring-4 ring-teal-200" : "bg-slate-100 text-slate-800"}`}
                            >
                              {senseText(lang, SENSE_WORD[w], w)}
                            </button>
                          );
                        })}
                      </div>
                    ) : null}
                  </div>
                ))}
            </>
          ) : null}
          {status[s] ? (
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              <span>
                {pick(lang, "メモ", "Note")}
                <span className="ml-1 font-normal text-slate-400">
                  {pick(lang, "（任意）", " (optional)")}
                </span>
              </span>
              <textarea
                value={String(v[`${s}_note`] ?? "")}
                onChange={(e) => set(`${s}_note`, e.target.value)}
                maxLength={200}
                rows={2}
                className="rounded-2xl border border-slate-300 px-3 py-2 text-base"
              />
            </label>
          ) : null}
        </section>
      ))}
    </div>
  );
}

function Meter({ lang, m, start }: { lang: Lang; m: Measure; start: () => void }) {
  const shown = m.state === "running" ? m.live : m.state === "done" ? m.level : null;
  const pct = shown === null ? 0 : ((shown - SOUND_DB.min) / (SOUND_DB.max - SOUND_DB.min)) * 100;
  return (
    <div className="grid gap-2 rounded-xl bg-slate-50 p-3">
      <p className="text-sm font-bold text-slate-700">
        {pick(lang, "音の大きさを測る", "Measure the sound level")}
      </p>
      <p className="text-xs leading-relaxed text-slate-600">{senseText(lang, MEASURE_NOTE, "")}</p>
      <div className="h-3 overflow-hidden rounded-full bg-slate-200" aria-hidden="true">
        <div className="h-full bg-teal-600 transition-[width] duration-100" style={{ width: `${pct}%` }} />
      </div>
      {m.state === "done" ? (
        <p className="text-sm tabular-nums text-slate-800">
          {pick(
            lang,
            `平均 約${m.level} dB・最大 約${m.peak} dB（スマホでの目安）`,
            `Average about ${m.level} dB, loudest about ${m.peak} dB (phone estimate)`,
          )}
        </p>
      ) : null}
      {m.state === "failed" ? (
        <p className="text-sm text-amber-800">
          {pick(
            lang,
            "マイクを使えませんでした。うるささと主な音だけ答えても送れます。",
            "The microphone could not be used. You can still send loudness and main sounds.",
          )}
        </p>
      ) : null}
      <button
        type="button"
        onClick={start}
        disabled={m.state === "running"}
        className="rounded-xl bg-teal-600 px-3 py-2 text-sm font-bold text-white disabled:opacity-50"
      >
        {m.state === "running"
          ? pick(lang, "測っています…", "Measuring…")
          : m.state === "done"
            ? pick(lang, "測り直す", "Measure again")
            : pick(lang, "10秒測る", "Measure for 10 s")}
      </button>
    </div>
  );
}
