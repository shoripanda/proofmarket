"use client";
// W-04 Task detail — question, what the photo must show, reward, deadline, place, "Take this".
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Card, ListenButton, Loading, Notice, remaining, Shell, useNow, yen } from "@/components/ui";
import type { AnswerSchemaView } from "@/lib/answers";
import { errorText, useApi } from "@/lib/client/api";
import { useLang } from "@/lib/client/lang";
import { langHref, pick } from "@/lib/lang";
import { AttestationBand, type AttestationView } from "../../attestation-band";

interface Task {
  verification_id: string;
  type: string;
  question: string;
  acceptance_criteria: string | null;
  attestation: AttestationView | null;
  answer_values: string[];
  answer_schema: AnswerSchemaView;
  location: { lat: number; lng: number; radius_m: number } | null;
  /** 13 §1: `max` and `rises_until` are set while the reward is still rising. */
  reward: { asset: string; amount: string; max: string | null; rises_until: string | null };
  deadline: string;
  freshness_max_age_seconds: number;
  open_slots: number;
}

export default function TaskDetailPage() {
  const lang = useLang();
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
    <Shell title={pick(lang, "依頼", "Task")} back="/tasks">
      {err ? <Notice tone="error">{err}</Notice> : null}
      {!t && !err ? <Loading /> : null}
      {t ? (
        <>
          <Card>
            <AttestationBand lang={lang} attestation={t.attestation} className="mb-2" />
            <div className="flex items-start gap-2">
              <p className="flex-1 text-xl font-bold leading-snug">{t.question}</p>
              <ListenButton text={t.question} />
            </div>
            {t.acceptance_criteria ? (
              <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-500">
                {t.acceptance_criteria}
              </p>
            ) : null}
          </Card>
          <Card>
            <dl className="grid grid-cols-2 gap-y-3 text-sm">
              <dt className="text-slate-500">{pick(lang, "報酬", "Bounty")}</dt>
              {t.reward.max && t.reward.rises_until ? (
                <dd className="text-right">
                  <span className="text-lg font-bold text-teal-700">
                    {pick(lang, "今 ", "Now ")}
                    {t.reward.amount}
                  </span>
                  <span className="font-semibold text-amber-600">
                    {" → "}
                    {pick(lang, "最大 ", "up to ")}
                    {yen(t.reward.max, lang, t.reward.asset)}
                  </span>
                  <span className="block text-xs text-slate-500">
                    {pick(
                      lang,
                      `あと ${remaining(t.reward.rises_until, now, lang)} で最大。引き受けた時の額に決まります`,
                      `Max in ${remaining(t.reward.rises_until, now, lang)}. Fixed at the amount when someone takes it`,
                    )}
                  </span>
                </dd>
              ) : (
                <dd className="text-right text-lg font-bold text-teal-700">
                  {yen(t.reward.amount, lang, t.reward.asset)}
                </dd>
              )}
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
          <Button onClick={claim} disabled={busy || t.open_slots <= 0}>
            {busy
              ? pick(lang, "引き受けています…", "Claiming…")
              : pick(lang, "引き受ける", "Claim this task")}
          </Button>
        </>
      ) : !err ? (
        <p className="text-center text-slate-400">{pick(lang, "読み込み中…", "Loading…")}</p>
      ) : null}
    </Shell>
  );
}
