"use client";
// W-05 移動中 — 残り時間、「現地に着いた」、「やめる」。
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button, Card, Notice, remaining, Shell, useNow } from "@/components/ui";
import { errorText, useApi } from "@/lib/client/api";
import { LLink, useLang } from "@/lib/client/lang";
import { langHref, pick } from "@/lib/lang";
import { type ClaimDetail, useClaimCues } from "../../lib-claim";

export default function ClaimPage() {
  const lang = useLang();
  const { id } = useParams<{ id: string }>();
  const api = useApi();
  const router = useRouter();
  const now = useNow(1000);
  const [c, setC] = useState<ClaimDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useClaimCues(c);

  useEffect(() => {
    api<ClaimDetail>(`/v1/worker/claims/${id}`).then(setC, (e) => setErr(errorText(e, lang)));
  }, [api, id, lang]);

  async function abandon() {
    if (
      !confirm(
        pick(
          lang,
          "このタスクをやめますか？ やめても不利益はありません。",
          "Quit this task? There is no penalty for quitting.",
        ),
      )
    )
      return;
    try {
      await api(`/v1/worker/claims/${id}/abandon`, { method: "POST" });
      router.replace(langHref(lang, "/tasks"));
    } catch (e) {
      setErr(errorText(e, lang));
    }
  }

  const active = c?.state === "ACTIVE";
  return (
    <Shell title={pick(lang, "現地へ向かう", "Heading there")} back="/tasks">
      {err ? <Notice tone="error">{err}</Notice> : null}
      {c ? (
        <>
          <Card>
            <p className="text-sm text-slate-500">
              {pick(lang, "引き受けの残り時間", "Time left on your claim")}
            </p>
            <p className="mt-1 text-4xl font-bold tabular-nums">{remaining(c.expires_at, now, lang)}</p>
            <LLink
              href={`/tasks/${c.verification_id}`}
              className="mt-3 inline-block text-sm text-teal-700 underline"
            >
              {pick(lang, "タスクの内容と地図を見る", "See the task and the map")}
            </LLink>
          </Card>
          {active ? (
            <>
              <Notice>
                {pick(
                  lang,
                  "お店の前に着いたら「現地に着いた」を押してください。そこから撮影の受付時間が始まります。",
                  "When you reach the shop, tap “I'm here”. The capture window starts from that moment.",
                )}
              </Notice>
              <Button onClick={() => router.push(langHref(lang, `/claims/${id}/capture`))}>
                {pick(lang, "現地に着いた（撮影を始める）", "I'm here (start capture)")}
              </Button>
              <Button variant="danger" onClick={abandon}>
                {pick(lang, "やめる", "Quit")}
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={() => router.push(langHref(lang, `/claims/${id}/result`))}>
              {pick(lang, "結果を見る", "See the result")}
            </Button>
          )}
        </>
      ) : null}
    </Shell>
  );
}
