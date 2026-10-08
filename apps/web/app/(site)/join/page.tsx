// S-04 /join — sign up as a worker or ask for an API key.
import type { Metadata } from "next";
import { JoinForm } from "@/components/join-form";
import { PageHero, Section } from "@/components/site";
import { pick } from "@/lib/lang";
import { getLang } from "@/lib/lang-server";

export async function generateMetadata(): Promise<Metadata> {
  return { title: pick(await getLang(), "参加の申し込み | ProofMarket", "Sign up | ProofMarket") };
}

export default async function JoinPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const lang = await getLang();
  const { role } = await searchParams;
  return (
    <>
      <PageHero
        eyebrow={pick(lang, "参加の申し込み", "Sign up")}
        title={pick(lang, "試験運用に参加する", "Join the pilot")}
      >
        <p>
          {pick(
            lang,
            "試験運用中は、申し込んだ方に運営者から招待コードか API キーを送ります。人数を絞って進めているため、順番にご案内します。",
            "During the pilot, the operator sends an invite code or an API key to people who apply. Numbers are kept small, so applications are handled in turn.",
          )}
        </p>
      </PageHero>
      <Section title={pick(lang, "申し込みフォーム", "Application form")}>
        <JoinForm initialRole={role === "requester" ? "requester" : "worker"} />
      </Section>
    </>
  );
}
