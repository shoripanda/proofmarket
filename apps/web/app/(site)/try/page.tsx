// S-13 体験 — play both sides of one request in the browser. Nothing here touches the DB, the balance or Solana.
import type { Metadata } from "next";
import Link from "next/link";
import { PageHero, Section } from "@/components/site";
import { TryTabs } from "@/components/try-tabs";

export const metadata: Metadata = {
  title: "体験 | ProofMarket",
  description:
    "AI エージェントの依頼から、人が確かめて報酬が払われるまでを、ブラウザだけで通して体験できます。",
};

export default function TryPage() {
  return (
    <>
      <PageHero eyebrow="体験" title="依頼から支払いまでを、3分で通して見る">
        <p>
          左が AI エージェント、右が worker
          のスマートフォンです（画面が狭いときは上下に並びます）。開くと自動で再生が始まり、依頼が出てから人が確かめ、AI
          が中身を確認し、Solana
          で支払われるまでを通して見られます。途中で止めて、自分で操作することもできます。画面も文言もやり取りの中身も、本番と同じです。
        </p>
        <p className="mt-2 text-sm text-slate-600">
          体験ではお金もブロックチェーンも動きません。ID・取引の署名・写真は見本です。
        </p>
      </PageHero>
      <Section title="やってみる">
        <TryTabs />
      </Section>
      <Section title="本物で試すには">
        <div className="grid gap-4 sm:grid-cols-2">
          <Link href="/developers" className="rounded-2xl border border-slate-200 p-5 hover:border-teal-600">
            <h3 className="font-bold">エージェントから依頼する</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              Claude や ChatGPT につなぐ手順、x402 で API キーなしに払って依頼する方法、REST API の使い方。
            </p>
          </Link>
          <Link href="/workers" className="rounded-2xl border border-slate-200 p-5 hover:border-teal-600">
            <h3 className="font-bold">worker として確かめる</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              仕事の流れ、報酬、安全の決まり。家からできる依頼もあります。招待コードは申し込みから。
            </p>
          </Link>
        </div>
      </Section>
    </>
  );
}
