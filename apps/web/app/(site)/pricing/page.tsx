// S-06 Pricing and number of witnesses — how the cost is computed, how many witnesses to ask, and refunds (01 §4.1-4.4).
import { LIMITS, PLATFORM_FEE_BPS } from "@proofmarket/core";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHero, Section } from "@/components/site";
import { Plain, Term } from "@/lib/client/plain";
import { clusterText } from "@/lib/cluster-public";
import { type Lang, langHref } from "@/lib/lang";
import { getLang } from "@/lib/lang-server";

const EXAMPLE_BOUNTY = 0.5;
/** 15% on top (docs/architecture 13 §6.1). */
const FEE_PCT = PLATFORM_FEE_BPS / 100;
const withFee = (v: number) => Math.round(v * (1 + PLATFORM_FEE_BPS / 10_000) * 1e6) / 1e6;
const feeOf = (v: number) => Math.round((withFee(v) - v) * 1e6) / 1e6;

type Level = { name: string; level: string; n: number; q: number; when: string };

const ct = clusterText();

const COPY = {
  ja: {
    meta: { title: "料金 | ProofMarket" },
    eyebrow: "料金",
    title: `報酬に ${FEE_PCT}% の手数料を足した額です`,
    intro: `1件の費用は「1人あたりの報酬 × 確かめてもらう人数」に、その ${FEE_PCT}% の手数料を足した額です。worker は報酬を全額受け取ります。手数料は報酬を払った人の分だけいただき、払わなかった分は手数料ごと残高に戻します。`,
    levels: {
      title: "確かめてもらう人数を選べます",
      lead: `人数を増やすほど答えは確かになり、費用と待ち時間が増えます。API では assurance に level を書くだけで選べ、人数を直接書くこともできます。最大 ${LIMITS.witnesses.max} 人まで頼めます。下の金額は、1人あたり ${EXAMPLE_BOUNTY} USDC にした場合の手数料込みの例です。`,
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
      note: "結果が出るまでの時間は、近くに worker がいるかどうかで大きく変わります。目安の数字は、実績がたまりしだい載せます。",
    },
    money: {
      title: "お金の流れ",
      lead: "依頼を出した時点で、報酬と手数料の全額を前払いの残高から確保し、報酬の分を Solana 上の依頼ごとの預かり口座に入れます。結果に応じて、次のように払うか戻します。戻す分には、その手数料も含みます。",
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
      title: "支払いについて",
      body:
        ct.cluster === "devnet"
          ? "残高と報酬は Solana Devnet の USDC です。メインネットへの切り替えを進めています。"
          : "残高と報酬は Solana の USDC で、請求は発生しません。入金は依頼者の画面から行います。",
      cta: "API キーを申し込む",
    },
  },
  en: {
    meta: { title: "Pricing | ProofMarket" },
    eyebrow: "Pricing",
    title: `The bounty, plus a ${FEE_PCT}% fee`,
    intro: `A request costs the bounty per person times the number of people asked, plus a ${FEE_PCT}% fee on top. Workers receive the whole bounty. The fee is kept only for the people who are paid; whatever is not paid goes back to the balance, fee included.`,
    levels: {
      title: "Choose how many people check",
      lead: `More people make the answer more certain, and cost more and take longer. In the API, set a level under assurance, or give the numbers directly. Up to ${LIMITS.witnesses.max} people per request. The amounts below assume ${EXAMPLE_BOUNTY} USDC per person and include the fee.`,
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
      note: "Time to result depends mostly on whether a worker is nearby. Typical figures will be published as results accumulate.",
    },
    money: {
      title: "Where the money goes",
      lead: "When a request is made, the bounty and the fee are reserved from the prepaid balance, and the bounty is locked in a per-request escrow account on Solana. Depending on the outcome, it is paid out or returned as follows; anything returned comes back with its fee.",
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
      title: "About payments",
      body:
        ct.cluster === "devnet"
          ? "Balances and bounties are USDC on Solana Devnet. The move to mainnet is under way."
          : "Balances and bounties are USDC on Solana, and nothing is invoiced. Top up from the requester console.",
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
        <p>
          <Plain>{c.intro}</Plain>
        </p>
      </PageHero>

      <Section title={c.levels.title} lead={<Plain>{c.levels.lead}</Plain>}>
        <div className="grid gap-4 sm:grid-cols-3">
          {c.levels.items.map((l) => (
            <div key={l.name} className="rounded-2xl border border-slate-200 p-5">
              <h3 className="font-bold">{l.name}</h3>
              <p className="mt-2 text-3xl font-bold">
                {withFee(EXAMPLE_BOUNTY * l.n)}
                <span className="ml-1 text-sm font-medium text-slate-500">
                  <Term k="usdc" />
                </span>
              </p>
              <p className="mt-1 text-xs text-slate-500">
                {lang === "ja" ? "報酬" : "bounty"} {EXAMPLE_BOUNTY * l.n} +{" "}
                {lang === "ja" ? "手数料" : "fee"} {feeOf(EXAMPLE_BOUNTY * l.n)}
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

      <Section title={c.money.title} lead={<Plain>{c.money.lead}</Plain>}>
        <dl className="divide-y divide-slate-200 rounded-2xl border border-slate-200">
          {c.money.cases.map(([k, v]) => (
            <div key={k} className="grid gap-1 p-4 sm:grid-cols-[16rem_1fr]">
              <dt className="text-sm font-semibold">{k}</dt>
              <dd className="text-sm leading-relaxed text-slate-600">
                <Plain>{v}</Plain>
              </dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-slate-600">
          <Plain>{c.money.note}</Plain>
        </p>
      </Section>

      <Section title={c.pilot.title}>
        <p className="max-w-3xl text-sm leading-relaxed text-slate-600">
          <Plain>{c.pilot.body}</Plain>
        </p>
        <p className="mt-4 text-sm">
          <Link
            href={langHref(lang, "/join?role=requester")}
            className="font-semibold text-teal-700 underline"
          >
            <Plain>{c.pilot.cta}</Plain>
          </Link>
        </p>
      </Section>
    </>
  );
}
