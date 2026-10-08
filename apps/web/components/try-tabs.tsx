"use client";
// /try: two stories, one request and ten at once. The tab is remembered only for this visit.
import { useState } from "react";
import { useLang } from "@/lib/client/lang";
import { pick } from "@/lib/lang";
import { TryExperience } from "./try-experience";
import { TryScale } from "./try-scale";

export function TryTabs() {
  const lang = useLang();
  const [tab, setTab] = useState<"one" | "scale">("one");
  const tabs = [
    [
      "one",
      pick(lang, "1件の依頼", "One request"),
      pick(
        lang,
        "掲示を書き起こしてもらう。差し戻しから支払いまで",
        "A sign transcribed: from a rejected attempt to the payout",
      ),
    ],
    [
      "scale",
      pick(lang, "大勢で同時に", "Many at once"),
      pick(
        lang,
        "都内10駅のエレベーターを一斉に確かめる",
        "Ten station lifts across Tokyo, checked at the same time",
      ),
    ],
  ] as const;
  return (
    <div className="space-y-5">
      <div
        className="grid gap-2 sm:grid-cols-2"
        role="tablist"
        aria-label={pick(lang, "体験の筋書き", "Stories to play")}
      >
        {tabs.map(([k, label, sub]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`tap rounded-2xl px-4 py-3 text-left ${tab === k ? "bg-teal-700 text-white shadow" : "bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-teal-50 hover:ring-teal-600"}`}
          >
            <p className="text-base font-bold">{label}</p>
            <p className={`text-xs ${tab === k ? "text-teal-100" : "text-slate-500"}`}>{sub}</p>
          </button>
        ))}
      </div>
      {tab === "one" ? <TryExperience /> : <TryScale />}
    </div>
  );
}
