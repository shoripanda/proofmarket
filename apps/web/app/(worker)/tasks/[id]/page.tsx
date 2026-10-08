"use client";
import type { TaskType } from "@proofmarket/core";
// W-04 タスク詳細 — 質問、地図リンク、半径、報酬、締切、撮影の注意、「引き受ける」。
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Card, Notice, remaining, Shell, safetyNotes, useNow, yen } from "@/components/ui";
import { type AnswerSchemaView, answerFormat, taskTypeText } from "@/lib/answers";
import { errorText, useApi } from "@/lib/client/api";
import { useLang } from "@/lib/client/lang";
import { langHref, pick } from "@/lib/lang";

interface Task {
  verification_id: string;
  type: string;
  question: string;
  acceptance_criteria: string | null;
  answer_values: string[];
  answer_schema: AnswerSchemaView;
  location: { lat: number; lng: number; radius_m: number } | null;
  reward: { amount: string };
  deadline: string;
  freshness_max_age_seconds: number;
  open_slots: number;
}

export default function TaskDetailPage() {
  const lang = useLang();
  const types = taskTypeText(lang);
  const { id } = useParams<{ id: string }>();
  const api = useApi();
  const router = useRouter();
  const now = useNow(1000);
  const [t, setT] = useState<Task | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Task>(`/v1/worker/tasks/${id}`).then(setT, (e) => setErr(errorText(e, lang)));
  }, [api, id, lang]);

  async function claim() {
    setBusy(true);
    setErr(null);
    try {
      const c = await api<{ claim_id: string }>(`/v1/worker/tasks/${id}/claim`, { method: "POST" });
      router.push(langHref(lang, `/claims/${c.claim_id}`));
    } catch (e) {
      setErr(errorText(e, lang));
      setBusy(false);
    }
  }

  return (
    <Shell title={pick(lang, "タスクの内容", "Task details")} back="/tasks">
      {err ? <Notice tone="error">{err}</Notice> : null}
      {t ? (
        <>
          <Card>
            <p className="text-sm text-slate-500">
              {pick(lang, "確かめること・", "What to check · ")}
              {types[t.type as TaskType]?.name ?? t.type}
            </p>
            <p className="mt-1 text-xl font-bold leading-snug">{t.question}</p>
            {t.acceptance_criteria ? (
              <p className="mt-3 whitespace-pre-wrap rounded-xl bg-amber-50 p-3 text-sm leading-relaxed text-amber-900">
                <span className="font-bold">{pick(lang, "受け取りの条件: ", "Accepted when: ")}</span>
                {t.acceptance_criteria}
              </p>
            ) : null}
            <p className="mt-3 text-sm text-slate-600">{answerFormat(lang, t.answer_schema)}</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">{types[t.type as TaskType]?.howTo}</p>
          </Card>
          <Card>
            <dl className="grid grid-cols-2 gap-y-3 text-sm">
              <dt className="text-slate-500">{pick(lang, "報酬", "Bounty")}</dt>
              <dd className="text-right text-lg font-bold text-teal-700">{yen(t.reward.amount)}</dd>
              <dt className="text-slate-500">{pick(lang, "締切まで", "Deadline in")}</dt>
              <dd className="text-right font-medium">{remaining(t.deadline, now, lang)}</dd>
              <dt className="text-slate-500">{pick(lang, "場所", "Place")}</dt>
              <dd className="text-right font-medium">
                {t.location
                  ? pick(
                      lang,
                      `指定地点から ${t.location.radius_m} m 以内`,
                      `within ${t.location.radius_m} m of the pin`,
                    )
                  : pick(lang, "どこでも", "anywhere")}
              </dd>
              <dt className="text-slate-500">{pick(lang, "撮影の受付時間", "Capture window")}</dt>
              <dd className="text-right font-medium">
                {pick(
                  lang,
                  `「撮影を始める」から ${Math.round(t.freshness_max_age_seconds / 60)} 分`,
                  `${Math.round(t.freshness_max_age_seconds / 60)} min from “Start capture”`,
                )}
              </dd>
            </dl>
            {t.location ? (
              <a
                className="mt-4 block rounded-xl bg-slate-100 py-3 text-center text-sm font-medium text-slate-700"
                href={`https://www.google.com/maps/search/?api=1&query=${t.location.lat},${t.location.lng}`}
                target="_blank"
                rel="noreferrer"
              >
                {pick(lang, "地図アプリで場所を開く", "Open the place in a map app")}
              </a>
            ) : null}
          </Card>
          <Card>
            <h2 className="mb-2 font-bold">{pick(lang, "撮影の注意", "Before you shoot")}</h2>
            <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
              {safetyNotes(lang).map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </Card>
          <Button onClick={claim} disabled={busy || t.open_slots <= 0}>
            {busy
              ? pick(lang, "引き受けています…", "Claiming…")
              : pick(lang, "引き受ける", "Claim this task")}
          </Button>
          <p className="text-center text-xs text-slate-500">
            {pick(
              lang,
              "引き受けた後でも、いつでもやめられます。",
              "You can quit at any time, even after claiming.",
            )}
          </p>
        </>
      ) : !err ? (
        <p className="text-center text-slate-400">{pick(lang, "読み込み中…", "Loading…")}</p>
      ) : null}
    </Shell>
  );
}
