// S-06 料金と確かめる人数 — how the cost is computed, how many witnesses to ask, and refunds (01 §4.1-4.4).
import { LIMITS } from "@proofmarket/core";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHero, Section } from "@/components/site";
import { type Lang, langHref } from "@/lib/lang";
import { getLang } from "@/lib/lang-server";

const EXAMPLE_BOUNTY = 0.5;

type Level = { name: string; level: string; n: number; q: number; when: string };

const COPY = {
  ja: {
    meta: { title: "料金 | ProofMarket" },
    eyebrow: "料金",
    title: "払うのは、確かめてくれた人への報酬だけです",
    intro:
      "1件の費用は「1人あたりの報酬 × 確かめてもらう人数」です。試験運用中は ProofMarket の手数料をいただきません。手数料の料率は、試験運用で worker の手間と待ち時間を測ってから決めます。",
    levels: {
      title: "確かめてもらう人数を選べます",
      lead: `人数を増やすほど答えは確かになり、費用と待ち時間が増えます。API では assurance に level を書くだけで選べ、人数を直接書くこともできます。最大 ${LIMITS.witnesses.max} 人まで頼めます。下の金額は、1人あたり ${EXAMPLE_BOUNTY} USDC にした場合の例です。`,
      items: [
        {
          name: "1人で確かめる",
          level: "fast",
          n: 1,
          q: 1,
          when: "早く、安く知りたいとき。答えを1人の目に頼る",
        },
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
      ] as Level[],
      note: "結果が出るまでの時間は、近くに worker がいるかどうかで大きく変わります。目安の数字は試験運用で測ってから載せます。",
    },
    money: {
      title: "お金の流れ",
      lead: "依頼を出した時点で、費用の全額を前払いの残高から確保し、Solana 上の依頼ごとの預かり口座に入れます。結果に応じて、次のように払うか戻します。",
      cases: [
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
      ] as [string, string][],
      note: "少数派の答えや「わからない（UNCLEAR）」にも報酬を払うのは、多数派に合わせようとする動機をなくすためです。確認に落ちた写真には払いません。",
    },
    pilot: {
      title: "試験運用中の支払い",
      body: "残高と報酬は Solana Devnet のテスト用 USDC です。実際のお金は動かず、請求も発生しません。本番のお金で動かすのは、資金の預かりや送金にかかわる法律の確認を終えてからにします。",
      cta: "API キーを申し込む",
    },
  },
  en: {
    meta: { title: "Pricing | ProofMarket" },
    eyebrow: "Pricing",
    title: "You pay only the people who checked",
    intro:
      "A request costs the bounty per person times the number of people asked. During the pilot, ProofMarket takes no fee. The fee rate will be set once the pilot has measured workers' effort and waiting times.",
    levels: {
      title: "Choose how many people check",
      lead: `More people make the answer more certain, and cost more and take longer. In the API, set a level under assurance, or give the numbers directly. Up to ${LIMITS.witnesses.max} people per request. The amounts below assume ${EXAMPLE_BOUNTY} USDC per person.`,
      items: [
        {
          name: "One person",
          level: "fast",
          n: 1,
          q: 1,
          when: "Fast and cheap. The answer rests on one pair of eyes",
        },
        {
          name: "Two must agree",
          level: "standard",
          n: 2,
          q: 2,
          when: "Final only when both give the same answer. A split is REJECTED",
        },
        {
          name: "Two of three",
          level: "high",
          n: 3,
          q: 2,
          when: "Final even if one person disagrees. Suits places that are easy to misjudge",
        },
      ] as Level[],
      note: "Time to result depends mostly on whether a worker is nearby. Typical figures will be published once the pilot has measured them.",
    },
    money: {
      title: "Where the money goes",
      lead: "When a request is made, the full cost is reserved from the prepaid balance and locked in a per-request escrow account on Solana. Depending on the outcome, it is paid out or returned as follows.",
      cases: [
        [
          "Final (VERIFIED)",
          "Everyone with a valid answer is paid. Slots that were not filled go back to the balance",
        ],
        [
          "Split (REJECTED)",
          "Everyone with a valid answer is paid, majority or not. The rest goes back to the balance",
        ],
        [
          "Deadline passed (EXPIRED)",
          "Anyone with a valid answer is paid; the rest goes back. If nobody answered, everything goes back",
        ],
        [
          "Cancelled before anyone set off",
          "Everything goes back to the balance. A request cannot be cancelled while a worker is on the way",
        ],
      ] as [string, string][],
      note: "Minority answers and “can't tell” (UNCLEAR) are paid too, so nobody has a reason to guess what the majority will say. Photos that fail the checks are not paid.",
    },
    pilot: {
      title: "Payments during the pilot",
      body: "Balances and bounties are test USDC on Solana Devnet. No real money moves and nothing is invoiced. Real money will follow once the legal review of holding and transferring funds is complete.",
      cta: "Request an API key",
    },
  },
} satisfies Record<Lang, unknown>;

export async function generateMetadata(): Promise<Metadata> {
  return COPY[await getLang()].meta;
}

export default async function PricingPage() {
  const lang = await getLang();
  const c = COPY[lang];
  return (
    <>
      <PageHero eyebrow={c.eyebrow} title={c.title}>
        <p>{c.intro}</p>
      </PageHero>

      <Section title={c.levels.title} lead={c.levels.lead}>
        <div className="grid gap-4 sm:grid-cols-3">
          {c.levels.items.map((l) => (
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
        <p className="mt-4 text-sm leading-relaxed text-slate-600">{c.levels.note}</p>
      </Section>

      <Section title={c.money.title} lead={c.money.lead}>
        <dl className="divide-y divide-slate-200 rounded-2xl border border-slate-200">
          {c.money.cases.map(([k, v]) => (
            <div key={k} className="grid gap-1 p-4 sm:grid-cols-[16rem_1fr]">
              <dt className="text-sm font-semibold">{k}</dt>
              <dd className="text-sm leading-relaxed text-slate-600">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-slate-600">{c.money.note}</p>
      </Section>

      <Section title={c.pilot.title}>
        <p className="max-w-3xl text-sm leading-relaxed text-slate-600">{c.pilot.body}</p>
        <p className="mt-4 text-sm">
          <Link
            href={langHref(lang, "/join?role=requester")}
            className="font-semibold text-teal-700 underline"
          >
            {c.pilot.cta}
          </Link>
        </p>
      </Section>
    </>
  );
}
