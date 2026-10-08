// S-10 運営者情報. Name and contact come from OPERATOR_NAME / OPERATOR_CONTACT_EMAIL so nothing personal is in git.
import type { Metadata } from "next";
import Link from "next/link";
import { PageHero, Section } from "@/components/site";
import { langHref, pick } from "@/lib/lang";
import { getLang } from "@/lib/lang-server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: pick(await getLang(), "運営者情報 | ProofMarket", "Operator | ProofMarket") };
}
export const dynamic = "force-dynamic";

export default async function OperatorPage() {
  const lang = await getLang();
  const name = process.env.OPERATOR_NAME;
  const email = process.env.OPERATOR_CONTACT_EMAIL;
  const tbd = pick(lang, "公開前に記載します", "To be published before launch");
  return (
    <>
      <PageHero
        eyebrow={pick(lang, "運営者情報", "Operator")}
        title={pick(lang, "ProofMarket を運営している者", "Who runs ProofMarket")}
      />
      <Section title={pick(lang, "運営者", "Operator")}>
        <dl className="max-w-3xl divide-y divide-slate-200 rounded-2xl border border-slate-200 text-sm">
          <div className="grid gap-1 p-4 sm:grid-cols-[10rem_1fr]">
            <dt className="font-semibold">{pick(lang, "名前", "Name")}</dt>
            <dd>{name ?? tbd}</dd>
          </div>
          <div className="grid gap-1 p-4 sm:grid-cols-[10rem_1fr]">
            <dt className="font-semibold">{pick(lang, "連絡先", "Contact")}</dt>
            <dd>
              {email ? (
                <a href={`mailto:${email}`} className="text-teal-700 underline">
                  {email}
                </a>
              ) : (
                tbd
              )}
            </dd>
          </div>
          <div className="grid gap-1 p-4 sm:grid-cols-[10rem_1fr]">
            <dt className="font-semibold">{pick(lang, "運営の形", "Status")}</dt>
            <dd>
              {pick(
                lang,
                "試験運用中です。法人は設立していません。報酬と残高は Solana Devnet のテスト用資産で、実際のお金は動きません。",
                "A pilot run by an individual; no company has been incorporated. Bounties and balances are test assets on Solana Devnet, and no real money moves.",
              )}
            </dd>
          </div>
        </dl>
      </Section>
      <Section title={pick(lang, "規約とポリシー", "Terms and policies")}>
        <ul className="space-y-2 text-sm">
          <li>
            <Link href={langHref(lang, "/legal/worker-terms")} className="text-teal-700 underline">
              {pick(lang, "worker 参加規約", "Worker terms")}
            </Link>
          </li>
          <li>
            <Link href={langHref(lang, "/legal/requester-terms")} className="text-teal-700 underline">
              {pick(lang, "依頼者（API 利用）規約", "Requester (API) terms")}
            </Link>
          </li>
          <li>
            <Link href={langHref(lang, "/legal/privacy")} className="text-teal-700 underline">
              {pick(lang, "プライバシーポリシー", "Privacy policy")}
            </Link>
          </li>
        </ul>
      </Section>
    </>
  );
}
