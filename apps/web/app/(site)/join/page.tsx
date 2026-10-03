// S-04 /join — sign up as a worker or ask for an API key.
import type { Metadata } from "next";
import { JoinForm } from "@/components/join-form";
import { PageHero, Section } from "@/components/site";

export const metadata: Metadata = { title: "参加の申し込み | ProofMarket" };

export default async function JoinPage({ searchParams }: { searchParams: Promise<{ role?: string }> }) {
  const { role } = await searchParams;
  return (
    <>
      <PageHero eyebrow="参加の申し込み" title="試験運用に参加する">
        <p>
          試験運用中は、申し込んだ方に運営者から招待コードか API
          キーを送ります。人数を絞って進めているため、順番にご案内します。
        </p>
      </PageHero>
      <Section title="申し込みフォーム">
        <JoinForm initialRole={role === "requester" ? "requester" : "worker"} />
      </Section>
    </>
  );
}
