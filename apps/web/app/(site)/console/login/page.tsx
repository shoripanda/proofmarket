// S-B10 requester console sign-in (01 §4.14).
import type { Metadata } from "next";
import Link from "next/link";
import { ConsoleLoginForm } from "@/components/console-actions";
import { PageHero, Section } from "@/components/site";

export const metadata: Metadata = { title: "依頼者の画面 | ProofMarket", robots: { index: false } };

export default function ConsoleLoginPage() {
  return (
    <>
      <PageHero eyebrow="依頼者の画面" title="自分の API キーの様子を見る">
        <p>依頼の履歴、残高、Webhook の配信、定期確認をまとめて見られます。</p>
      </PageHero>
      <Section title="ログイン">
        <ConsoleLoginForm />
        <p className="mt-6 text-sm text-slate-600">
          API キーを持っていない方は
          <Link href="/join?role=requester" className="font-semibold text-teal-700 underline">
            こちらから申し込み
          </Link>
          てください。
        </p>
      </Section>
    </>
  );
}
