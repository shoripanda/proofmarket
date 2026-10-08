// S-10 worker terms, requester terms and privacy policy. Drafts until legal review; the banner says so.
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PageHero, Section } from "@/components/site";
import { langHref, pick } from "@/lib/lang";
import { getLang } from "@/lib/lang-server";
import { LEGAL_DOCS, legalDocs } from "@/lib/legal";

type Slug = keyof typeof LEGAL_DOCS;
const isSlug = (s: string): s is Slug => s in LEGAL_DOCS;

export function generateStaticParams() {
  return Object.keys(LEGAL_DOCS).map((doc) => ({ doc }));
}

export async function generateMetadata({ params }: { params: Promise<{ doc: string }> }): Promise<Metadata> {
  const { doc } = await params;
  const docs = legalDocs(await getLang());
  return { title: isSlug(doc) ? `${docs[doc].title} | ProofMarket` : "ProofMarket" };
}

export default async function LegalDocPage({ params }: { params: Promise<{ doc: string }> }) {
  const { doc } = await params;
  if (!isSlug(doc)) notFound();
  const lang = await getLang();
  const d = legalDocs(lang)[doc];
  return (
    <>
      <PageHero eyebrow={pick(lang, `版: ${d.version}`, `Version ${d.version}`)} title={d.title}>
        <p>{d.lead}</p>
      </PageHero>
      <div className="mx-auto max-w-5xl px-4 pt-8">
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900 ring-1 ring-amber-200">
          {pick(
            lang,
            "これは試験運用のための下書きで、弁護士による確認をまだ受けていません。本番のお金を扱う前に見直します。",
            "This is a draft for the pilot and has not yet been reviewed by a lawyer. It will be revised before real money is handled.",
          )}
        </p>
      </div>
      {d.sections.map((s) => (
        <Section key={s.h} title={s.h}>
          <div className="max-w-3xl space-y-3 text-sm leading-relaxed text-slate-700">
            {s.ps.map((p) => (
              <p key={p}>{p}</p>
            ))}
          </div>
        </Section>
      ))}
      <Section title={pick(lang, "連絡先", "Contact")}>
        <p className="text-sm">
          <Link href={langHref(lang, "/legal/operator")} className="font-semibold text-teal-700 underline">
            {pick(lang, "運営者情報", "Operator")}
          </Link>
        </p>
      </Section>
    </>
  );
}
