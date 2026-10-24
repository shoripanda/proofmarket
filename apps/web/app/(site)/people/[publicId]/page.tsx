// S-21 One public worker profile (docs/architecture 14 §3). Indexed only when the worker allowed it (§3.3).
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHero, Section } from "@/components/site";
import { appContext } from "@/lib/context";
import { langHref, pick } from "@/lib/lang";
import { getLang } from "@/lib/lang-server";
import { flagEnabled } from "@/lib/services/flags";
import { findPublicProfile } from "@/lib/services/profile-service";
import { ProfileCard } from "../profile-card";

export const dynamic = "force-dynamic";

type P = { params: Promise<{ publicId: string }> };

async function load(publicId: string) {
  const app = appContext();
  if (!(await flagEnabled(app.db, "tasks_enabled"))) return null;
  return findPublicProfile(app.db, publicId);
}

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const lang = await getLang();
  const found = await load((await params).publicId);
  if (!found) return { robots: { index: false } };
  return {
    title: `${found.view.display_name} | ProofMarket`,
    description: pick(
      lang,
      `${found.view.display_name} さんの公開プロフィール。${found.view.skills.join("・")}`,
      `${found.view.display_name}'s public profile. ${found.view.skills.join(", ")}`,
    ),
    robots: found.indexable ? undefined : { index: false, follow: false },
  };
}

export default async function PersonPage({ params }: P) {
  const found = await load((await params).publicId);
  if (!found) notFound();
  const lang = await getLang();
  const p = found.view;
  return (
    <>
      <PageHero eyebrow={pick(lang, "公開プロフィール", "Public profile")} title={p.display_name}>
        <p>
          {pick(
            lang,
            `${p.member_since.replace("-", " 年 ")} 月から ProofMarket で仕事を受けています。`,
            `Taking work on ProofMarket since ${p.member_since}.`,
          )}
        </p>
      </PageHero>
      <Section title={pick(lang, "できること", "What they do")}>
        <ProfileCard p={p} lang={lang} link={false} />
        {p.skills.length ? (
          <p className="mt-4 text-sm">
            {p.skills.map((s, i) => (
              <span key={s}>
                {i ? " · " : ""}
                <Link
                  href={langHref(lang, `/people?${new URLSearchParams({ skill: s })}`)}
                  className="text-teal-700 underline"
                >
                  {pick(lang, `「${s}」ができるほかの人`, `Others who list "${s}"`)}
                </Link>
              </span>
            ))}
          </p>
        ) : null}
        <p className="mt-6 text-xs leading-relaxed text-slate-500">
          {pick(
            lang,
            "内容は本人が書いたものです。完了件数と評価は ProofMarket が数えています（評価は 3 件から表示）。連絡と支払いは ProofMarket の中で行います。",
            "The worker wrote this profile. ProofMarket counts the completed work and the rating (shown from 3 ratings). Contact and payment stay on ProofMarket.",
          )}
        </p>
      </Section>
    </>
  );
}
