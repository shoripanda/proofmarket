// S-20 People — public worker profiles, only of workers who chose to publish (docs/architecture 14 §3).
// 404 while tasks_enabled is off.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHero, Section } from "@/components/site";
import { appContext } from "@/lib/context";
import { langHref, pick } from "@/lib/lang";
import { getLang } from "@/lib/lang-server";
import { flagEnabled } from "@/lib/services/flags";
import { listPublicProfiles } from "@/lib/services/profile-service";
import { ProfileCard } from "./profile-card";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  return {
    title: pick(lang, "仕事を受ける人たち | ProofMarket", "People | ProofMarket"),
    description: pick(
      lang,
      "プロフィールの公開を選んだ worker の一覧です。できること・使える言語・完了した件数が分かります。",
      "Workers who chose to publish a profile: what they do, their languages and how much they have completed.",
    ),
  };
}

type SP = Promise<{ skill?: string; cursor?: string }>;

export default async function PeoplePage({ searchParams }: { searchParams: SP }) {
  const app = appContext();
  if (!(await flagEnabled(app.db, "tasks_enabled"))) notFound();
  const lang = await getLang();
  const sp = await searchParams;
  const skill = typeof sp.skill === "string" ? sp.skill.slice(0, 30) : undefined;
  const cursor = typeof sp.cursor === "string" ? sp.cursor.slice(0, 200) : undefined;
  const page = await listPublicProfiles(app, { skill, cursor }).catch(() => null);
  if (!page) notFound();
  const next = page.next_cursor
    ? `/people?${new URLSearchParams({ ...(skill ? { skill } : {}), cursor: page.next_cursor })}`
    : null;
  return (
    <>
      <PageHero
        eyebrow={pick(lang, "仕事を受ける人たち", "People")}
        title={pick(lang, "公開プロフィール", "Public profiles")}
      >
        <p>
          {pick(
            lang,
            "プロフィールの公開を自分で選んだ worker だけを載せています。地域は市区町村までで、住所や駅、位置は載せません。公開していない worker も、これまでどおり仕事を受けられます。",
            "Only workers who chose to publish a profile are listed. The area is a city or ward at most; no address, station or location. Workers without a public profile can take work as before.",
          )}
        </p>
      </PageHero>
      <Section
        title={
          skill
            ? pick(lang, `「${skill}」ができる人`, `People who list "${skill}"`)
            : pick(lang, "新しく更新された順", "Recently updated")
        }
      >
        {skill ? (
          <p className="mb-4 text-sm">
            <Link href={langHref(lang, "/people")} className="text-teal-700 underline">
              {pick(lang, "絞り込みを外す", "Show everyone")}
            </Link>
          </p>
        ) : null}
        {page.workers.length === 0 ? (
          <p className="rounded-2xl bg-slate-50 p-5 text-sm text-slate-600">
            {pick(lang, "まだ公開されたプロフィールはありません。", "No public profiles yet.")}
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {page.workers.map((p) => (
              <ProfileCard key={p.public_id} p={p} lang={lang} />
            ))}
          </div>
        )}
        {next ? (
          <p className="mt-6">
            <Link href={langHref(lang, next)} className="text-teal-700 underline">
              {pick(lang, "続きを見る", "More")}
            </Link>
          </p>
        ) : null}
      </Section>
    </>
  );
}
