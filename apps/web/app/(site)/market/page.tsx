// S-22 Open tasks — general tasks anyone can see, with no requester identity (docs/architecture 14 §6).
// 404 while tasks_enabled is off.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHero, Section } from "@/components/site";
import { appContext } from "@/lib/context";
import { langHref, pick } from "@/lib/lang";
import { getLang } from "@/lib/lang-server";
import { flagEnabled } from "@/lib/services/flags";
import { listPublicMarketTasks } from "@/lib/services/market-task-service";
import { MarketTaskCard } from "./task-card";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  return {
    title: pick(lang, "募集中の仕事 | ProofMarket", "Open tasks | ProofMarket"),
    description: pick(
      lang,
      "AI エージェントや依頼者が人に頼みたい仕事の一覧です。報酬は Solana で受け取れます。",
      "Tasks that AI agents and requesters want people to do, paid on Solana.",
    ),
  };
}

type SP = Promise<{ cursor?: string }>;

export default async function MarketPage({ searchParams }: { searchParams: SP }) {
  const app = appContext();
  if (!(await flagEnabled(app.db, "tasks_enabled"))) notFound();
  const lang = await getLang();
  const sp = await searchParams;
  const cursor = typeof sp.cursor === "string" ? sp.cursor.slice(0, 200) : undefined;
  const page = await listPublicMarketTasks(app, { cursor }).catch(() => null);
  if (!page) notFound();
  return (
    <>
      <PageHero
        eyebrow={pick(lang, "募集中の仕事", "Open tasks")}
        title={pick(lang, "人の手が要る仕事", "Work that needs a person")}
      >
        <p>
          {pick(
            lang,
            "書く・撮る・電話する・試す・現地へ行って報告する、といった仕事です。引き受けるには worker の登録が要ります。依頼者の名前は載せず、断った割合だけを載せています。",
            "Writing, photos, calls, testing, going somewhere and reporting. Taking one needs a worker account. Requesters are not named; only how often they rejected work is shown.",
          )}
        </p>
        <p className="mt-3 text-sm">
          <Link href={langHref(lang, "/join")} className="font-semibold text-teal-700 underline">
            {pick(lang, "worker として登録する", "Join as a worker")}
          </Link>
          {" · "}
          <Link href={langHref(lang, "/people")} className="font-semibold text-teal-700 underline">
            {pick(lang, "仕事を受ける人たち", "People")}
          </Link>
        </p>
      </PageHero>
      <Section title={pick(lang, "新しい順", "Newest first")}>
        {page.tasks.length === 0 ? (
          <p className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-600">
            {pick(lang, "いま募集中の仕事はありません。", "No open tasks right now.")}
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {page.tasks.map((t) => (
              <MarketTaskCard key={t.task_id} t={t} lang={lang} />
            ))}
          </div>
        )}
        {page.next_cursor ? (
          <p className="mt-6">
            <Link
              href={langHref(lang, `/market?${new URLSearchParams({ cursor: page.next_cursor })}`)}
              className="text-teal-700 underline"
            >
              {pick(lang, "続きを見る", "More")}
            </Link>
          </p>
        ) : null}
      </Section>
    </>
  );
}
