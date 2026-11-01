// S-23 One open task (docs/architecture 14 §6). Closed, preferred-only or unknown tasks are not found.
import { ApiError } from "@proofmarket/core";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHero, Section } from "@/components/site";
import { appContext } from "@/lib/context";
import { langHref, pick } from "@/lib/lang";
import { getLang } from "@/lib/lang-server";
import { flagEnabled } from "@/lib/services/flags";
import { getPublicMarketTask } from "@/lib/services/market-task-service";
import { closes, marketFacts } from "../task-card";

export const dynamic = "force-dynamic";

type P = { params: Promise<{ id: string }> };

async function load(id: string) {
  const app = appContext();
  if (!(await flagEnabled(app.db, "tasks_enabled"))) return null;
  try {
    return await getPublicMarketTask(app, id);
  } catch (e) {
    if (e instanceof ApiError) return null;
    throw e;
  }
}

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const t = await load((await params).id);
  if (!t) return { robots: { index: false } };
  return { title: `${t.title} | ProofMarket`, description: t.description.slice(0, 160) };
}

export default async function MarketTaskPage({ params }: P) {
  const t = await load((await params).id);
  if (!t) notFound();
  const lang = await getLang();
  const rate = t.requester.rejected_ratio;
  return (
    <>
      <PageHero eyebrow={pick(lang, "募集中の仕事", "Open task")} title={t.title}>
        <p className="text-2xl font-bold text-teal-700">
          {t.price.amount} {t.price.asset}
          <span className="ml-2 text-sm font-normal text-slate-500">
            {pick(lang, "（1 人あたり）", "per person")}
          </span>
        </p>
      </PageHero>
      <Section title={pick(lang, "内容", "What to do")}>
        <p className="whitespace-pre-wrap leading-relaxed">{t.description}</p>
        <h3 className="mt-6 font-bold">{pick(lang, "完了の条件", "Definition of done")}</h3>
        <p className="mt-1 whitespace-pre-wrap leading-relaxed">{t.completion_criteria}</p>
        <ul className="mt-6 space-y-1 text-sm text-slate-600">
          {marketFacts(t, lang).map((f) => (
            <li key={f}>・{f}</li>
          ))}
          <li>
            ・{pick(lang, "締切 ", "Closes ")}
            {closes(t.deadline, lang)}
          </li>
          <li>
            ・
            {rate === null
              ? pick(
                  lang,
                  "依頼者のこの 30 日の判断はまだありません",
                  "No decisions by this requester in the last 30 days",
                )
              : pick(
                  lang,
                  `依頼者がこの 30 日に断った割合 ${Math.round(rate * 100)}%（${t.requester.decided} 件中）`,
                  `This requester rejected ${Math.round(rate * 100)}% of ${t.requester.decided} deliveries in the last 30 days`,
                )}
          </li>
        </ul>
        <p className="mt-8">
          <Link
            href={langHref(lang, `/jobs/${t.task_id}`)}
            className="tap inline-block rounded-2xl bg-teal-700 px-5 py-3 font-bold text-white"
          >
            {pick(lang, "worker として引き受ける", "Take it as a worker")}
          </Link>
        </p>
        <p className="mt-3 text-xs text-slate-500">
          {pick(
            lang,
            "引き受けるにはログインが要ります。内容は依頼者が書いたものです。連絡と支払いは ProofMarket の中で行います。",
            "Taking it needs a login. The requester wrote this text. Contact and payment stay on ProofMarket.",
          )}
        </p>
      </Section>
    </>
  );
}
