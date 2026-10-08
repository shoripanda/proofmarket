"use client";
import type { TaskType } from "@proofmarket/core";
// W-03 タスク一覧 — 「近くで」は現在地（小数3桁に丸める）から近い順、「家でできる」は場所の要らない依頼だけで
// 位置情報を使わない (01 §4.20)。開いている間は30秒ごとに取り直し、新着に印を付ける。
import { useCallback, useEffect, useRef, useState } from "react";
import { PushOptIn } from "@/components/push-opt-in";
import { Button, Card, Notice, remaining, Shell, useNow, yen } from "@/components/ui";
import { taskTypeText } from "@/lib/answers";
import { errorText, useApi } from "@/lib/client/api";
import { LLink, useLang } from "@/lib/client/lang";
import { pick } from "@/lib/lang";

const REFRESH_MS = 30_000;
const SCOPE_STORE = "pm.tasks.scope";
type Scope = "nearby" | "anywhere";

interface Task {
  verification_id: string;
  type: string;
  question: string;
  distance_m: number | null;
  reward: { amount: string };
  deadline: string;
  open_slots: number;
}

export default function TasksPage() {
  const lang = useLang();
  const types = taskTypeText(lang);
  const api = useApi();
  const now = useNow(1000);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  // null until the first load, so the initial list is not reported as new.
  const seen = useRef<Set<string> | null>(null);
  // null until the saved choice is read, so the page never asks for location before knowing it has to.
  const [scope, setScope] = useState<Scope | null>(null);
  const [noLocation, setNoLocation] = useState(false);
  const SCOPES: [Scope, string][] = [
    ["nearby", pick(lang, "近くで", "Nearby")],
    ["anywhere", pick(lang, "家でできる", "From home")],
  ];

  useEffect(() => {
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(SCOPE_STORE);
    } catch {}
    setScope(saved === "anywhere" ? "anywhere" : "nearby");
  }, []);

  function choose(next: Scope) {
    if (next === scope) return;
    try {
      localStorage.setItem(SCOPE_STORE, next);
    } catch {}
    seen.current = null;
    setFresh(new Set());
    setTasks(null);
    setErr(null);
    setNoLocation(false);
    setScope(next);
  }

  // quiet: background refresh — keeps the current list and error on screen until new data arrives.
  const load = useCallback(
    (quiet = false) => {
      if (!scope) return;
      if (!quiet) setErr(null);
      const show = async (query: string) => {
        try {
          const r = await api<{ tasks: Task[] }>(`/v1/worker/tasks?${query}`);
          const ids = r.tasks.map((t) => t.verification_id);
          const added = seen.current ? ids.filter((id) => !seen.current?.has(id)) : [];
          seen.current = new Set(ids);
          if (added.length > 0) {
            setFresh((prev) => new Set([...prev, ...added]));
            navigator.vibrate?.(200);
          }
          setTasks(r.tasks);
          setErr(null);
        } catch (e) {
          if (!quiet) setErr(errorText(e, lang));
        }
      };
      // Work that needs no place: no location is read or sent.
      if (scope === "anywhere") {
        void show("scope=anywhere");
        return;
      }
      if (!navigator.geolocation) {
        setNoLocation(true);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setNoLocation(false);
          // Rounded before sending: the URL ends up in access logs (05 §3.2).
          const lat = pos.coords.latitude.toFixed(3);
          const lng = pos.coords.longitude.toFixed(3);
          void show(`lat=${lat}&lng=${lng}&radius_km=5`);
        },
        () => {
          if (!quiet) setNoLocation(true);
        },
        { enableHighAccuracy: false, maximumAge: 60_000, timeout: 15_000 },
      );
    },
    [api, scope, lang],
  );

  useEffect(() => {
    load();
    const tick = () => {
      if (document.visibilityState === "visible") load(true);
    };
    const timer = setInterval(tick, REFRESH_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [load]);

  const freshCount = tasks?.filter((t) => fresh.has(t.verification_id)).length ?? 0;

  return (
    <Shell
      title={
        scope === "anywhere"
          ? pick(lang, "家でできるタスク", "Tasks from home")
          : pick(lang, "近くのタスク", "Tasks nearby")
      }
    >
      <div
        className="grid grid-cols-2 gap-1 rounded-full bg-slate-100 p-1"
        role="tablist"
        aria-label={pick(lang, "タスクの探し方", "How to look for tasks")}
      >
        {SCOPES.map(([s, label]) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={scope === s}
            onClick={() => choose(s)}
            className={`rounded-full px-3 py-2 text-sm font-semibold ${scope === s ? "bg-white text-teal-700 shadow" : "text-slate-500"}`}
          >
            {label}
          </button>
        ))}
      </div>
      {scope === "anywhere" ? (
        <p className="text-sm leading-relaxed text-slate-500">
          {pick(
            lang,
            "書き写し・電話・採寸など、外に出なくてもできる依頼です。位置情報は使いません。",
            "Transcribing, phone calls, measuring and other requests you can do without going out. Location is not used.",
          )}
        </p>
      ) : null}
      {noLocation && scope === "nearby" ? (
        <Card>
          <p className="text-sm leading-relaxed text-slate-700">
            {pick(
              lang,
              "位置情報が使えないため、近くの依頼を探せません。近くの依頼を見るときは、位置情報の利用を許可してください（保存はしません）。",
              "Location is unavailable, so nearby requests cannot be found. Allow location access to see requests nearby (it is not stored).",
            )}
          </p>
          <div className="mt-3">
            <Button onClick={() => choose("anywhere")}>
              {pick(lang, "家でできる依頼を見る", "See requests from home")}
            </Button>
          </div>
        </Card>
      ) : null}
      {err ? <Notice tone="error">{err}</Notice> : null}
      {freshCount > 0 ? (
        <Notice tone="ok">
          {pick(
            lang,
            `新しいタスクが ${freshCount} 件届きました。`,
            `${freshCount} new ${freshCount === 1 ? "task" : "tasks"} arrived.`,
          )}
        </Notice>
      ) : null}
      <PushOptIn />
      {tasks === null && !err && !noLocation ? (
        <p className="text-center text-slate-400">{pick(lang, "探しています…", "Looking…")}</p>
      ) : null}
      {tasks?.length === 0 ? (
        <Notice>
          {scope === "anywhere"
            ? pick(
                lang,
                "いまは家でできるタスクがありません。通知を受け取るようにしておくと、出たときに分かります。",
                "No tasks from home right now. Turn on notifications to hear when one appears.",
              )
            : pick(
                lang,
                "いまは近くにタスクがありません。少し時間をおいて更新してください。",
                "No tasks nearby right now. Check back in a little while.",
              )}
        </Notice>
      ) : null}
      {tasks?.map((t) => (
        <LLink
          key={t.verification_id}
          href={`/tasks/${t.verification_id}`}
          className="card-link block rounded-2xl"
          aria-label={pick(lang, `${t.question}（内容を見る）`, `${t.question} (see details)`)}
        >
          <Card>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold text-teal-700">
                {yen(t.reward.amount)}
                {fresh.has(t.verification_id) ? (
                  <span className="ml-2 rounded-full bg-amber-400 px-2 py-0.5 align-middle text-xs font-bold text-white">
                    {pick(lang, "新着", "NEW")}
                  </span>
                ) : null}
              </span>
              <span className="flex items-center gap-1 text-sm text-slate-500">
                {t.distance_m === null
                  ? pick(lang, "どこでも", "anywhere")
                  : t.distance_m < 1000
                    ? `${t.distance_m} m`
                    : `${(t.distance_m / 1000).toFixed(1)} km`}
                <span className="arrow text-lg leading-none text-teal-700" aria-hidden="true">
                  ›
                </span>
              </span>
            </div>
            <p className="mt-1 text-xs font-medium text-slate-500">
              {types[t.type as TaskType]?.name ?? t.type}
            </p>
            <p className="mt-1 line-clamp-3 font-medium">{t.question}</p>
            <p className="mt-2 text-sm text-slate-500">
              {pick(lang, "締切まで ", "Deadline in ")}
              {remaining(t.deadline, now, lang)}
              {pick(lang, "・", " · ")}
              {t.distance_m === null
                ? pick(lang, "写真が必要", "photo required")
                : pick(lang, "写真と位置が必要", "photo and location required")}
            </p>
          </Card>
        </LLink>
      ))}
      <div className="fixed inset-x-0 bottom-0 mx-auto max-w-md bg-gradient-to-t from-white p-4">
        <Button variant="secondary" onClick={() => load()}>
          {pick(lang, "更新", "Refresh")}
        </Button>
        <p className="mt-2 text-center text-xs text-slate-400">
          {pick(lang, "開いている間は30秒ごとに自動で更新します", "Refreshes every 30 seconds while open")}
        </p>
      </div>
    </Shell>
  );
}
