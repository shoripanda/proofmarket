"use client";
import type { TaskType } from "@proofmarket/core";
// W-04 タスク詳細 — 質問、地図リンク、半径、報酬、締切、撮影の注意、「引き受ける」。
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Card, Notice, remaining, SAFETY_NOTES, Shell, useNow, yen } from "@/components/ui";
import { type AnswerSchemaView, answerFormatJa, TASK_TYPE_JA } from "@/lib/answers";
import { errorText, useApi } from "@/lib/client/api";

interface Task {
  verification_id: string;
  type: string;
  question: string;
  answer_values: string[];
  answer_schema: AnswerSchemaView;
  location: { lat: number; lng: number; radius_m: number } | null;
  reward: { amount: string };
  deadline: string;
  freshness_max_age_seconds: number;
  open_slots: number;
}

export default function TaskDetailPage() {
  const { id } = useParams<{ id: string }>();
  const api = useApi();
  const router = useRouter();
  const now = useNow(1000);
  const [t, setT] = useState<Task | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Task>(`/v1/worker/tasks/${id}`).then(setT, (e) => setErr(errorText(e)));
  }, [api, id]);

  async function claim() {
    setBusy(true);
    setErr(null);
    try {
      const c = await api<{ claim_id: string }>(`/v1/worker/tasks/${id}/claim`, { method: "POST" });
      router.push(`/claims/${c.claim_id}`);
    } catch (e) {
      setErr(errorText(e));
      setBusy(false);
    }
  }

  return (
    <Shell title="タスクの内容" back="/tasks">
      {err ? <Notice tone="error">{err}</Notice> : null}
      {t ? (
        <>
          <Card>
            <p className="text-sm text-slate-500">
              確かめること・{TASK_TYPE_JA[t.type as TaskType]?.name ?? t.type}
            </p>
            <p className="mt-1 text-xl font-bold leading-snug">{t.question}</p>
            <p className="mt-3 text-sm text-slate-600">{answerFormatJa(t.answer_schema)}</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              {TASK_TYPE_JA[t.type as TaskType]?.howTo}
            </p>
          </Card>
          <Card>
            <dl className="grid grid-cols-2 gap-y-3 text-sm">
              <dt className="text-slate-500">報酬</dt>
              <dd className="text-right text-lg font-bold text-teal-700">{yen(t.reward.amount)}</dd>
              <dt className="text-slate-500">締切まで</dt>
              <dd className="text-right font-medium">{remaining(t.deadline, now)}</dd>
              <dt className="text-slate-500">場所</dt>
              <dd className="text-right font-medium">
                {t.location ? `指定地点から ${t.location.radius_m} m 以内` : "どこでも"}
              </dd>
              <dt className="text-slate-500">撮影の受付時間</dt>
              <dd className="text-right font-medium">
                「撮影を始める」から {Math.round(t.freshness_max_age_seconds / 60)} 分
              </dd>
            </dl>
            {t.location ? (
              <a
                className="mt-4 block rounded-xl bg-slate-100 py-3 text-center text-sm font-medium text-slate-700"
                href={`https://www.google.com/maps/search/?api=1&query=${t.location.lat},${t.location.lng}`}
                target="_blank"
                rel="noreferrer"
              >
                地図アプリで場所を開く
              </a>
            ) : null}
          </Card>
          <Card>
            <h2 className="mb-2 font-bold">撮影の注意</h2>
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
              {SAFETY_NOTES.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </Card>
          <Button onClick={claim} disabled={busy || t.open_slots <= 0}>
            {busy ? "引き受けています…" : "引き受ける"}
          </Button>
          <p className="text-center text-xs text-slate-500">引き受けた後でも、いつでもやめられます。</p>
        </>
      ) : !err ? (
        <p className="text-center text-slate-400">読み込み中…</p>
      ) : null}
    </Shell>
  );
}
