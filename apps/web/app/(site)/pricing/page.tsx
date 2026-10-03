// S-06 料金と確かめる人数 — how the cost is computed, how many witnesses to ask, and refunds (01 §4.1-4.4).
import { LIMITS } from "@proofmarket/core";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHero, Section } from "@/components/site";

export const metadata: Metadata = { title: "料金 | ProofMarket" };

const EXAMPLE_BOUNTY = 0.5;

const LEVELS: { name: string; level: string; n: number; q: number; when: string }[] = [
  { name: "1人で確かめる", level: "fast", n: 1, q: 1, when: "早く、安く知りたいとき。答えを1人の目に頼る" },
  {
    name: "2人の答えが一致",
    level: "standard",
    n: 2,
    q: 2,
    when: "2人が同じ答えのときだけ確定。答えが割れたら REJECTED",
  },
  {
    name: "3人中2人の多数決",
    level: "high",
    n: 3,
    q: 2,
    when: "1人が違う答えでも確定できる。迷いやすい場所に向く",
  },
];

const CASES: [string, string][] = [
  ["確定した（VERIFIED）", "有効な答えを出した人全員に報酬を払う。人数に満たなかった分は残高に戻る"],
  [
    "答えが割れた（REJECTED）",
    "有効な答えを出した人全員に報酬を払う。多数派かどうかは関係ない。残りは残高に戻る",
  ],
  [
    "締め切りまでに足りなかった（EXPIRED）",
    "有効な答えを出した人がいればその人に払い、残りは残高に戻る。誰もいなければ全額戻る",
  ],
  ["誰も向かう前に取り消した", "全額が残高に戻る。worker が向かっている間は取り消せない"],
];

export default function PricingPage() {
  return (
    <>
      <PageHero eyebrow="料金" title="払うのは、確かめてくれた人への報酬だけです">
        <p>
          1件の費用は「1人あたりの報酬 × 確かめてもらう人数」です。試験運用中は ProofMarket
          の手数料をいただきません。手数料の料率は、試験運用で worker の手間と待ち時間を測ってから決めます。
        </p>
      </PageHero>

      <Section
        title="確かめてもらう人数を選べます"
        lead={`人数を増やすほど答えは確かになり、費用と待ち時間が増えます。API では assurance に level を書くだけで選べ、人数を直接書くこともできます。最大 ${LIMITS.witnesses.max} 人まで頼めます。下の金額は、1人あたり ${EXAMPLE_BOUNTY} USDC にした場合の例です。`}
      >
        <div className="grid gap-4 sm:grid-cols-3">
          {LEVELS.map((l) => (
            <div key={l.name} className="rounded-2xl border border-slate-200 p-5">
              <h3 className="font-bold">{l.name}</h3>
              <p className="mt-2 text-3xl font-bold">
                {(EXAMPLE_BOUNTY * l.n).toFixed(1)}
                <span className="ml-1 text-sm font-medium text-slate-500">USDC</span>
              </p>
              <p className="mt-1 font-mono text-xs text-slate-500">
                assurance: {"{"} "level": "{l.level}" {"}"}
              </p>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">{l.when}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-sm leading-relaxed text-slate-600">
          結果が出るまでの時間は、近くに worker
          がいるかどうかで大きく変わります。目安の数字は試験運用で測ってから載せます。
        </p>
      </Section>

      <Section
        title="お金の流れ"
        lead="依頼を出した時点で、費用の全額を前払いの残高から確保し、Solana 上の依頼ごとの預かり口座に入れます。結果に応じて、次のように払うか戻します。"
      >
        <dl className="divide-y divide-slate-200 rounded-2xl border border-slate-200">
          {CASES.map(([k, v]) => (
            <div key={k} className="grid gap-1 p-4 sm:grid-cols-[16rem_1fr]">
              <dt className="text-sm font-semibold">{k}</dt>
              <dd className="text-sm leading-relaxed text-slate-600">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-slate-600">
          少数派の答えや「わからない（UNCLEAR）」にも報酬を払うのは、多数派に合わせようとする動機をなくすためです。確認に落ちた写真には払いません。
        </p>
      </Section>

      <Section title="試験運用中の支払い">
        <p className="max-w-3xl text-sm leading-relaxed text-slate-600">
          残高と報酬は Solana Devnet のテスト用 USDC
          です。実際のお金は動かず、請求も発生しません。本番のお金で動かすのは、資金の預かりや送金にかかわる法律の確認を終えてからにします。
        </p>
        <p className="mt-4 text-sm">
          <Link href="/join?role=requester" className="font-semibold text-teal-700 underline">
            API キーを申し込む
          </Link>
        </p>
      </Section>
    </>
  );
}
