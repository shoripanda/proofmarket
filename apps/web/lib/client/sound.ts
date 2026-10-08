"use client";
// 13 §6: a short two-note cue (and a buzz) when a submission goes out, comes back, or gets its result.
// Synthesised with Web Audio, so there are no sound files. Off when localStorage "pm.sound" is "off".

export type Cue = "ok" | "back" | "result";

export const SOUND_KEY = "pm.sound";

/** Two notes each: rising for "sent", falling for "sent back", a wider rise for "result". [Hz, start s] */
export const CUES: Record<Cue, { notes: [number, number][]; vibrate: number[] }> = {
  ok: {
    notes: [
      [660, 0],
      [880, 0.12],
    ],
    vibrate: [40],
  },
  back: {
    notes: [
      [440, 0],
      [330, 0.16],
    ],
    vibrate: [60, 60, 60],
  },
  result: {
    notes: [
      [523.25, 0],
      [783.99, 0.14],
    ],
    vibrate: [30, 40, 80],
  },
};

type Store = Pick<Storage, "getItem" | "setItem">;
function store(): Store | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null; // private mode or blocked site data
  }
}

export function soundOn(s: Store | null = store()): boolean {
  try {
    return s?.getItem(SOUND_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundOn(on: boolean, s: Store | null = store()) {
  try {
    s?.setItem(SOUND_KEY, on ? "on" : "off");
  } catch {
    // nothing to remember it in; the cue still plays this session
  }
}

let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  ctx ??= new Ctor();
  // Browsers start the context suspended until a tap; the submit tap (or an earlier one) resumes it.
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

export function cue(kind: Cue) {
  if (!soundOn()) return;
  const { notes, vibrate } = CUES[kind];
  try {
    navigator.vibrate?.(vibrate);
  } catch {
    // iOS Safari has no vibrate
  }
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + 0.02;
  for (const [hz, at] of notes) {
    const osc = ac.createOscillator();
    const gain = ac.createGain();
    osc.type = "sine";
    osc.frequency.value = hz;
    gain.gain.setValueAtTime(0.0001, t0 + at);
    gain.gain.exponentialRampToValueAtTime(0.25, t0 + at + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.18);
    osc.connect(gain).connect(ac.destination);
    osc.start(t0 + at);
    osc.stop(t0 + at + 0.2);
  }
}
