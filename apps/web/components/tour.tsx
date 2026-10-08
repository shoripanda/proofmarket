"use client";
// 13 §7: the worker app's first-run tour. Three screens, each a picture, one sentence and a "Listen" button,
// skippable at any point. Shown once; `pm.tour=done` in localStorage keeps it away afterwards.
import { useEffect, useState } from "react";
import { Picture, type PictureKey } from "@/components/illustrations";
import { Button, ListenButton } from "@/components/ui";
import { useLang } from "@/lib/client/lang";
import { pick } from "@/lib/lang";

export const TOUR_KEY = "pm.tour";

const STEPS: { k: PictureKey; title: [string, string]; line: [string, string] }[] = [
  {
    k: "nearby",
    title: ["近くの依頼を見る", "See requests nearby"],
    line: [
      "近くの依頼が、報酬と締め切りつきで並びます。",
      "Requests near you appear with the pay and the deadline.",
    ],
  },
  {
    k: "camera",
    title: ["撮って答える", "Shoot and answer"],
    line: [
      "現地でアプリのカメラで撮り、質問に答えます。",
      "At the spot, take a photo with the app's camera and answer.",
    ],
  },
  {
    k: "paid",
    title: ["報酬を受け取る", "Get paid"],
    line: [
      "確かめが済むと、報酬があなたの口座に届きます。",
      "Once it's checked, the pay arrives in your account.",
    ],
  },
];

export function Tour() {
  const lang = useLang();
  const [step, setStep] = useState<number | null>(null);

  useEffect(() => {
    try {
      if (localStorage.getItem(TOUR_KEY) !== "done") setStep(0);
    } catch {
      // storage blocked: showing the tour on every visit would be worse than not at all
    }
  }, []);

  function close() {
    try {
      localStorage.setItem(TOUR_KEY, "done");
    } catch {}
    setStep(null);
  }

  const s = step === null ? undefined : STEPS[step];
  if (step === null || !s) return null;
  const [title, line] = [pick(lang, ...s.title), pick(lang, ...s.line)];
  const last = step === STEPS.length - 1;
  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-slate-900/40 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tour-title"
    >
      <div className="w-full max-w-md rounded-t-3xl bg-white p-6 pb-8 shadow-xl sm:rounded-3xl">
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5" aria-hidden="true">
            {STEPS.map((x, i) => (
              <span
                key={x.k}
                className={`h-2 rounded-full transition-all ${i === step ? "w-6 bg-teal-700" : "w-2 bg-slate-300"}`}
              />
            ))}
          </div>
          <button type="button" onClick={close} className="px-2 py-1 text-sm font-semibold text-slate-500">
            {pick(lang, "飛ばす", "Skip")}
          </button>
        </div>
        <div key={s.k} className="mx-auto mt-4 w-48 animate-[fade-in-up_.3s_ease-out]">
          <Picture k={s.k} lang={lang} />
        </div>
        <h2 id="tour-title" className="mt-4 text-center text-xl font-bold">
          {title}
        </h2>
        <p className="mt-2 text-center text-lg leading-relaxed text-slate-700">{line}</p>
        <div className="mt-3 flex justify-center">
          <ListenButton key={s.k} text={pick(lang, `${title}。${line}`, `${title}. ${line}`)} />
        </div>
        <div className="mt-6">
          <Button onClick={() => (last ? close() : setStep(step + 1))}>
            {last ? pick(lang, "はじめる", "Start") : pick(lang, "次へ", "Next")}
          </Button>
        </div>
      </div>
    </div>
  );
}
