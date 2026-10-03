"use client";
// W-03 タスク一覧 — 現在地（小数3桁に丸める）から近い順。開いている間は30秒ごとに取り直し、新着に印を付ける。
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button, Card, Notice, remaining, Shell, useNow, yen } from "@/components/ui";
import { errorText, useApi } from "@/lib/client/api";

const REFRESH_MS = 30_000;

interface Task {
  verification_id: string;
  question: string;
  distance_m: number;
  reward: { amount: string };
  deadline: string;
  open_slots: number;
}

export default function TasksPage() {
  const api = useApi();
  const now = useNow(1000);
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  // null until the first load, so the initial list is not reported as new.
  const seen = useRef<Set<string> | null>(null);

  // quiet: background refresh — keeps the current list and error on screen until new data arrives.
  const load = useCallback(
    (quiet = false) => {
      if (!quiet) setErr(null);
      if (!navigator.geolocation) {
        setErr("この端末では位置情報が使えません。");
        return;
      }
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          // Rounded before sending: the URL ends up in access logs (05 §3.2).
          const lat = pos.coords.latitude.toFixed(3);
          const lng = pos.coords.longitude.toFixed(3);
          try {
            const r = await api<{ tasks: Task[] }>(`/v1/worker/tasks?lat=${lat}&lng=${lng}&radius_km=5`);
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
            if (!quiet) setErr(errorText(e));
          }
        },
        () => {
          if (!quiet)
            setErr("位置情報の利用を許可してください。近くのタスクを探すのに使います（保存はしません）。");
        },
        { enableHighAccuracy: false, maximumAge: 60_000, timeout: 15_000 },
      );
    },
    [api],
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
    <Shell title="近くのタスク">
      {err ? <Notice tone="error">{err}</Notice> : null}
      {freshCount > 0 ? <Notice tone="ok">新しいタスクが {freshCount} 件届きました。</Notice> : null}
      {tasks === null && !err ? <p className="text-center text-slate-400">探しています…</p> : null}
      {tasks?.length === 0 ? (
        <Notice>いまは近くにタスクがありません。少し時間をおいて更新してください。</Notice>
      ) : null}
      {tasks?.map((t) => (
        <Link key={t.verification_id} href={`/tasks/${t.verification_id}`} className="block">
          <Card>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold text-teal-700">
                {yen(t.reward.amount)}
                {fresh.has(t.verification_id) ? (
                  <span className="ml-2 rounded-full bg-amber-400 px-2 py-0.5 align-middle text-xs font-bold text-white">
                    新着
                  </span>
                ) : null}
              </span>
              <span className="text-sm text-slate-500">
                {t.distance_m < 1000 ? `${t.distance_m} m` : `${(t.distance_m / 1000).toFixed(1)} km`}
              </span>
            </div>
            <p className="mt-2 font-medium">{t.question}</p>
            <p className="mt-2 text-sm text-slate-500">
              締切まで {remaining(t.deadline, now)}・写真と位置が必要
            </p>
          </Card>
        </Link>
      ))}
      <div className="fixed inset-x-0 bottom-0 mx-auto max-w-md bg-gradient-to-t from-white p-4">
        <Button variant="secondary" onClick={() => load()}>
          更新
        </Button>
        <p className="mt-2 text-center text-xs text-slate-400">開いている間は30秒ごとに自動で更新します</p>
      </div>
    </Shell>
  );
}
