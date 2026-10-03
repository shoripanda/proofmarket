// S-10 運営者情報. Name and contact come from OPERATOR_NAME / OPERATOR_CONTACT_EMAIL so nothing personal is in git.
import type { Metadata } from "next";
import Link from "next/link";
import { PageHero, Section } from "@/components/site";

export const metadata: Metadata = { title: "運営者情報 | ProofMarket" };
export const dynamic = "force-dynamic";

export default function OperatorPage() {
  const name = process.env.OPERATOR_NAME;
  const email = process.env.OPERATOR_CONTACT_EMAIL;
  return (
    <>
      <PageHero eyebrow="運営者情報" title="ProofMarket を運営している者" />
      <Section title="運営者">
        <dl className="max-w-3xl divide-y divide-slate-200 rounded-2xl border border-slate-200 text-sm">
          <div className="grid gap-1 p-4 sm:grid-cols-[10rem_1fr]">
            <dt className="font-semibold">名前</dt>
            <dd>{name ?? "公開前に記載します"}</dd>
          </div>
          <div className="grid gap-1 p-4 sm:grid-cols-[10rem_1fr]">
            <dt className="font-semibold">連絡先</dt>
            <dd>
              {email ? (
                <a href={`mailto:${email}`} className="text-teal-700 underline">
                  {email}
                </a>
              ) : (
                "公開前に記載します"
              )}
            </dd>
          </div>
          <div className="grid gap-1 p-4 sm:grid-cols-[10rem_1fr]">
            <dt className="font-semibold">運営の形</dt>
            <dd>
              試験運用中です。法人は設立していません。報酬と残高は Solana Devnet
              のテスト用資産で、実際のお金は動きません。
            </dd>
          </div>
        </dl>
      </Section>
      <Section title="規約とポリシー">
        <ul className="space-y-2 text-sm">
          <li>
            <Link href="/legal/worker-terms" className="text-teal-700 underline">
              worker 参加規約
            </Link>
          </li>
          <li>
            <Link href="/legal/requester-terms" className="text-teal-700 underline">
              依頼者（API 利用）規約
            </Link>
          </li>
          <li>
            <Link href="/legal/privacy" className="text-teal-700 underline">
              プライバシーポリシー
            </Link>
          </li>
        </ul>
      </Section>
    </>
  );
}
