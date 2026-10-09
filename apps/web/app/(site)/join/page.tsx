// S-04 /join — sign up as a worker or ask for an API key.
import type { Metadata } from "next";
import { JoinForm } from "@/components/join-form";
import { PageHero, Section } from "@/components/site";
import { Plain } from "@/lib/client/plain";
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
          <Plain>
            {pick(
              lang,
              "API キーは、申し込むとその場で画面に出ます。エージェントへの設定方法も一緒に出るので、すぐに依頼を出せます。worker の招待コードは、人数を絞って進めているため、運営者から順番にお送りします。",
              "Your API key appears on the page as soon as you apply, with how to set up your agent, so you can send a request right away. Worker invite codes are sent by the operator in turn, as numbers are kept small.",
            )}
          </Plain>
        </p>
      </PageHero>
      <Section title={pick(lang, "申し込みフォーム", "Application form")}>
        <JoinForm initialRole={role === "requester" ? "requester" : "worker"} />
      </Section>
    </>
  );
}
