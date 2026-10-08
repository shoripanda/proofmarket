// S-13 体験 — play both sides of one request in the browser. Nothing here touches the DB, the balance or Solana.
import type { Metadata } from "next";
import Link from "next/link";
import { PageHero, Section } from "@/components/site";
import { TryTabs } from "@/components/try-tabs";
import { langHref, pick } from "@/lib/lang";
import { getLang } from "@/lib/lang-server";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  return {
    title: pick(lang, "体験 | ProofMarket", "Try it | ProofMarket"),
    description: pick(
      lang,
      "AI エージェントの依頼から、人が確かめて報酬が払われるまでを、ブラウザだけで通して体験できます。",
      "Play through a request from the AI agent's question to a person checking and getting paid, entirely in the browser.",
    ),
  };
}

export default async function TryPage() {
  const lang = await getLang();
  return (
    <>
      <PageHero
        eyebrow={pick(lang, "体験", "Try it")}
        title={pick(lang, "依頼から支払いまでを、3分で通して見る", "From request to payout in 3 minutes")}
      >
        <p>
          {pick(
            lang,
            "左が AI エージェント、右が worker のスマートフォンです（画面が狭いときは上下に並びます）。開くと自動で再生が始まり、依頼が出てから人が確かめ、AI が中身を確認し、Solana で支払われるまでを通して見られます。途中で止めて、自分で操作することもできます。画面も文言もやり取りの中身も、本番と同じです。",
            "The AI agent is on the left, the worker's phone on the right (stacked on a narrow screen). Playback starts by itself: the request goes out, a person checks, AI reviews the content, and Solana pays. Stop at any point and take over. The screens, the wording and the exchanged data are the same as in production.",
          )}
        </p>
        <p className="mt-2 text-sm text-slate-600">
          {pick(
            lang,
            "体験ではお金もブロックチェーンも動きません。ID・取引の署名・写真は見本です。",
            "No money and no blockchain move here. The IDs, transaction signatures and photo are samples.",
          )}
        </p>
      </PageHero>
      <Section title={pick(lang, "やってみる", "Play")}>
        <TryTabs />
      </Section>
      <Section title={pick(lang, "本物で試すには", "To try it for real")}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Link
            href={langHref(lang, "/developers")}
            className="card-link rounded-2xl border border-slate-200 p-5"
          >
            <h3 className="font-bold">{pick(lang, "エージェントから依頼する", "Ask from your agent")}</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              {pick(
                lang,
                "Claude や ChatGPT につなぐ手順、x402 で API キーなしに払って依頼する方法、REST API の使い方。",
                "How to connect Claude or ChatGPT, how to pay per request with x402 and no API key, and the REST API.",
              )}
            </p>
            <p className="mt-3 text-sm font-semibold text-teal-700">
              {pick(lang, "開発者向けの説明へ", "Developer guide")} <span className="arrow">→</span>
            </p>
          </Link>
          <Link
            href={langHref(lang, "/workers")}
            className="card-link rounded-2xl border border-slate-200 p-5"
          >
            <h3 className="font-bold">{pick(lang, "worker として確かめる", "Check things as a worker")}</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              {pick(
                lang,
                "仕事の流れ、報酬、安全の決まり。家からできる依頼もあります。招待コードは申し込みから。",
                "How the work goes, the pay and the safety rules. Some requests can be done from home. Invite codes come from the sign-up page.",
              )}
            </p>
            <p className="mt-3 text-sm font-semibold text-teal-700">
              {pick(lang, "worker 向けの説明へ", "Worker guide")} <span className="arrow">→</span>
            </p>
          </Link>
        </div>
      </Section>
    </>
  );
}
