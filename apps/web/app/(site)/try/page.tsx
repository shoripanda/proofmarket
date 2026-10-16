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
        title={pick(lang, "依頼から支払いまで", "From request to payout")}
      />
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
