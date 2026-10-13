// S-04 /join — sign up as a worker. Agent builders are sent to /connect (13 §7), where the key is issued.
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { JoinForm } from "@/components/join-form";
import { PageHero, Section } from "@/components/site";
import { Plain } from "@/lib/client/plain";
import { langHref, pick } from "@/lib/lang";
import { getLang } from "@/lib/lang-server";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: pick(await getLang(), "worker の申し込み | ProofMarket", "Sign up as a worker | ProofMarket"),
  };
}

export default async function JoinPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const lang = await getLang();
  const { role } = await searchParams;
  // Old links (README, llms.txt, the consent page) point here for a key.
  if (role === "requester") redirect(langHref(lang, "/connect"));
  return (
    <>
      <PageHero
        eyebrow={pick(lang, "worker の申し込み", "Sign up as a worker")}
        title={pick(lang, "スマホで依頼に応える人になる", "Answer requests on your phone")}
      >
        <p>
          <Plain>
            {pick(
              lang,
              "招待コードは、運営者から順番にお送りします。",
              "Invite codes are sent by the operator in turn.",
            )}
          </Plain>
        </p>
        <p className="mt-3 text-sm">
          {pick(lang, "AI エージェントをつなぎたい方は、", "Want to connect an AI agent instead? ")}
          <Link href={langHref(lang, "/connect")} className="font-semibold text-teal-700 underline">
            {pick(lang, "エージェントをつなぐ", "Connect your agent")}
          </Link>
          {pick(lang, "へ。キーはその場で出ます。", ": the key is issued on the spot.")}
        </p>
      </PageHero>
      <Section title={pick(lang, "申し込みフォーム", "Application form")}>
        <JoinForm />
      </Section>
    </>
  );
}
