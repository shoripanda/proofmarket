// S-B10 requester console sign-in (01 §4.14).
import type { Metadata } from "next";
import Link from "next/link";
import { ConsoleLoginForm } from "@/components/console-actions";
import { PageHero, Section } from "@/components/site";
import { langHref, pick } from "@/lib/lang";
import { getLang } from "@/lib/lang-server";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: pick(await getLang(), "依頼者の画面 | ProofMarket", "Requester console | ProofMarket"),
    robots: { index: false },
  };
}

export default async function ConsoleLoginPage() {
  const lang = await getLang();
  return (
    <>
      <PageHero
        eyebrow={pick(lang, "依頼者の画面", "Requester console")}
        title={pick(lang, "自分の API キーの様子を見る", "See what your API key has been doing")}
      >
        <p>
          {pick(
            lang,
            "依頼の履歴、残高、Webhook の配信、定期確認をまとめて見られます。",
            "Request history, balance, webhook deliveries and schedules in one place.",
          )}
        </p>
      </PageHero>
      <Section title={pick(lang, "ログイン", "Sign in")}>
        <ConsoleLoginForm />
        <p className="mt-6 text-sm text-slate-600">
          {pick(lang, "API キーを持っていない方は", "No API key yet? ")}
          <Link
            href={langHref(lang, "/join?role=requester")}
            className="font-semibold text-teal-700 underline"
          >
            {pick(lang, "こちらから申し込み", "Apply here")}
          </Link>
          {pick(lang, "てください。", ".")}
        </p>
      </Section>
    </>
  );
}
