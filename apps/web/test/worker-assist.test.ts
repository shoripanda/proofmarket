// 13 §6: the pure parts of the worker's in-browser help — the camera checklist, voice choice, transcripts, sound setting.
import { describe, expect, it } from "vitest";
import { captureGuide } from "../lib/capture-guide";
import { SOUND_KEY, setSoundOn, soundOn } from "../lib/client/sound";
import { appendTranscript, pickVoice, speak, speechTag } from "../lib/client/speech";

describe("captureGuide", () => {
  it("splits the criteria at 。 and keeps the first four lines", () => {
    expect(
      captureGuide("看板が写っている。営業時間が読める。日付が分かる。入口が写る。店名が読める。", "x"),
    ).toEqual(["看板が写っている", "営業時間が読める", "日付が分かる", "入口が写る"]);
  });
  it("handles English sentences and bulleted lines", () => {
    expect(captureGuide("The sign is visible. Hours are readable.", null)).toEqual([
      "The sign is visible",
      "Hours are readable",
    ]);
    expect(captureGuide("・看板\n・営業時間", null)).toEqual(["看板", "営業時間"]);
    expect(captureGuide("Price is $1.50 today.", null)).toEqual(["Price is $1.50 today"]);
  });
  it("falls back to the task type's howTo, else nothing", () => {
    expect(captureGuide(null, "店頭を写す。")).toEqual(["店頭を写す。"]);
    expect(captureGuide("  ", undefined)).toEqual([]);
  });
});

describe("speech", () => {
  const voices = [{ lang: "en-GB" }, { lang: "ja_JP" }, { lang: "en-US" }];
  it("picks the exact voice, then the same language, else none", () => {
    expect(pickVoice(voices, speechTag("ja"))).toBe(voices[1]);
    expect(pickVoice(voices, speechTag("en"))).toBe(voices[2]);
    expect(pickVoice([{ lang: "en-GB" }], "en-US")).toEqual({ lang: "en-GB" });
    expect(pickVoice([{ lang: "fr-FR" }], "ja-JP")).toBeUndefined();
  });
  it("does nothing where the browser cannot speak", () => {
    expect(speak("こんにちは", "ja")).toEqual({ supported: false });
  });
  it("appends what was said: Japanese runs on, English gets a space", () => {
    expect(appendTranscript("", " 開いていました ", "ja")).toBe("開いていました");
    expect(appendTranscript("看板あり。", "営業中", "ja")).toBe("看板あり。営業中");
    expect(appendTranscript("Sign is up.", "It is open", "en")).toBe("Sign is up. It is open");
    expect(appendTranscript("keep", "  ", "en")).toBe("keep");
  });
});

describe("sound setting", () => {
  it("is on unless pm.sound is off, and survives a storage that throws", () => {
    const m = new Map<string, string>();
    const s = {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
    };
    expect(soundOn(s)).toBe(true);
    setSoundOn(false, s);
    expect(m.get(SOUND_KEY)).toBe("off");
    expect(soundOn(s)).toBe(false);
    setSoundOn(true, s);
    expect(soundOn(s)).toBe(true);
    const broken = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(soundOn(broken)).toBe(true);
    expect(() => setSoundOn(false, broken)).not.toThrow();
  });
});
