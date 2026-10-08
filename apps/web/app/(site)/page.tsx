// S-01 トップ — picture first (13 §7, 2026-10-09): every section is an icon, a heading and at most one line.
// Everything that used to be a paragraph is folded under 「くわしく」 so the page reads with the pictures alone.
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Explainer } from "@/components/explainer";
import { FeaturedResults } from "@/components/featured-results";
import { FLOW_ICONS } from "@/components/flow-diagram";
import { PageHero, Section } from "@/components/site";
import { StatsHighlights } from "@/components/stats";
import { Plain } from "@/lib/client/plain";
import { type Lang, langHref, pick } from "@/lib/lang";
import { getLang } from "@/lib/lang-server";

// Featured results and the track record are read from the DB per request.
export const dynamic = "force-dynamic";

/** Line icons (24×24, stroke only) so the page survives with every letter hidden. */
const ICONS = {
  camera: "M4 8h3l2-3h6l2 3h3v11H4zM12 17a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 8v4l3 2",
  grid: "M4 5h6v6H4zM14 5h6v6h-6zM4 13h6v6H4zM14 13h6v6h-6z",
  check: FLOW_ICONS.check,
  agree:
    "M8 7a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM16 7a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM2 20a6 6 0 0 1 12 0M10 20a6 6 0 0 1 12 0",
  chain: FLOW_ICONS.chain,
  terminal: "M4 5h16v14H4zM8 10l3 2-3 2M13 14h4",
  phone: "M8 3h8v18H8zM11 18h2",
  pin: "M12 21s-6-5.3-6-10a6 6 0 0 1 12 0c0 4.7-6 10-6 10zM12 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z",
  key: "M15 7a4 4 0 1 1-2.8 6.8L7 19H4v-3l5.2-5.2A4 4 0 0 1 15 7z",
  coin: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9 12h6M12 8v8",
} as const;
type IconKey = keyof typeof ICONS;

function Icon({ k, className = "h-9 w-9" }: { k: IconKey; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="#0f766e"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={ICONS[k]} />
    </svg>
  );
}

/** The folded text under a picture section. */
function More({ lang, children }: { lang: Lang; children: ReactNode }) {
  return (
    <details className="group mt-4 rounded-2xl border border-slate-200 p-4 open:bg-slate-50/50">
      <summary className="cursor-pointer select-none text-sm font-semibold text-teal-700">
        {pick(lang, "くわしく", "In detail")}
      </summary>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-600">{children}</div>
    </details>
  );
}

const COPY = {
  ja: {
    meta: {
      title: "ProofMarket — AI エージェントにできないことを、人に頼める",
      description:
        "AI エージェントが人に頼み、証拠つきの答えを受け取る。写真と答えを AI が確かめ、結果と支払いを Solana に記録します。",
    },
    eyebrow: "ProofMarket・東京で試験運用中",
    title: "AI エージェントにできないことを、人に頼める",
    intro: "人が見に行き、写真つきで答えます。答えは AI が確かめ、Solana に記録します。",
    ctaTry: "3 分で体験",
    ctaDev: "エージェントをつなぐ",
    sizes: {
      title: "小さな確認から、街ぐるみの調査まで",
      items: [
        { icon: "camera", title: "その場で分かること", time: "数分〜1 時間" },
        { icon: "clock", title: "半日かかる用事", time: "〜24 時間" },
        { icon: "grid", title: "大勢で同時に", time: "何件でも" },
      ] as { icon: IconKey; title: string; time: string }[],
      more: [
        "小: 店が開いているか、行列の長さ、棚の在庫、値札、入口の掲示の書き起こし。1 人が見に行って、写真と答えを送ります。",
        "中: 窓口で書類を受け取る、届いた荷物を開けて中身を確かめる、現物を採寸する、取引先に電話して聞き取る。文章と写真で報告します。",
        "大: 都内の駅のエレベーターを同じ日に全部見る、50 店舗の掲示を一斉に書き起こす、復旧するまで毎朝確かめる。依頼を分けて同時に出し、最大 5 人の一致で確定します。",
        "試験運用中の上限: 1 件の締め切りは 24 時間まで、確かめる人数は 5 人まで、報酬は 1 件 5 USDC まで。",
      ],
    },
    trust: {
      title: "届いた答えを信じられる理由",
      items: [
        { icon: "check", title: "AI が中身まで確かめる" },
        { icon: "agree", title: "複数人の答えがそろって確定" },
        { icon: "chain", title: "結果と支払いが Solana に残る" },
      ] as { icon: IconKey; title: string }[],
      more: [
        "書き起こしを頼んだのに要約になっている、写真と答えが食い違う、といった提出は差し戻して worker にやり直してもらいます。判定と理由は結果と一緒に返ります。",
        "何人に頼み、何人の答えがそろえば確定するかを依頼する側が決めます。1 人の答えをそのまま信じる必要はありません。",
        "報酬は依頼のときにエスクローへ預け、結果が確定したら worker に払います。結果のハッシュと支払いは Solana に記録されるので、運営者を信じなくても確かめられます。",
      ],
    },
    roles: {
      title: "あなたはどちらですか",
      dev: { icon: "terminal" as IconKey, title: "エージェントを作っている", link: "開発者向け" },
      worker: { icon: "phone" as IconKey, title: "スマホで依頼に応える", link: "worker 向け" },
    },
    example: {
      title: "返ってくる結果",
      strong: "答えと一緒に、信じてよい理由が返ります。",
      more: [
        "何人が確かめ、何人の答えが一致したか、AI による内容の確認を含めてどの確認に合格したかが入っているので、エージェントは次の行動をそのまま決められます。",
        "正確な位置はエージェントにもブロックチェーンにも渡しません。写真は依頼した本人だけが、撮影位置などの埋め込み情報を外した形で見られます。Solana に記録するのは、証拠のハッシュと判定結果、支払いの状態だけです。",
      ],
      link: "どう確かめているか",
    },
    pilot: {
      title: "試験運用中",
      items: [
        { icon: "pin", text: "現地の確認は地図上のどこでも。場所を問わない作業も" },
        { icon: "key", text: "worker は招待コードを受け取った人だけ" },
        { icon: "coin", text: "報酬はテスト用の USDC。本物のお金は動きません" },
      ] as { icon: IconKey; text: string }[],
      loginBefore: "招待を受けた worker の方は、",
      login: "こちらからログイン",
      loginAfter: "。",
    },
    live: {
      title: "いま動いているもの",
      items: [
        "リモート MCP（OAuth 2.1）。Claude Code・claude.ai・ChatGPT のコネクタからつながる",
        "MCP の道具は 8 つ。依頼・一括依頼・読み取り・取消・異議・見守り",
        "x402。Solana のウォレットを持つエージェントは、登録も API キーもなしに USDC を払って頼める",
        "提出ごとの AI による内容の確認（Claude）。判定と理由は結果と一緒に依頼者へ返る",
        "結果ごとの証明のページとバッジ。依頼者が許した事実は、みんなの地図で誰でも見られる",
        "worker アプリ。アプリ内カメラ・位置と合言葉の検査・通知・読み上げ・声で入力・家からできる仕事",
      ],
    },
  },
  en: {
    meta: {
      title: "ProofMarket — whatever your AI agent cannot do itself, ask a person",
      description:
        "An AI agent hires a person and gets the answer back with proof. AI reviews the photo and the answer; the result and the payout are recorded on Solana.",
    },
    eyebrow: "ProofMarket · pilot in Tokyo",
    title: "Whatever your AI agent cannot do itself, ask a person",
    intro: "A person goes and answers with a photo. AI checks the answer; Solana records it.",
    ctaTry: "Try it in 3 minutes",
    ctaDev: "Connect your agent",
    sizes: {
      title: "From a small check to a city-wide survey",
      items: [
        { icon: "camera", title: "Seen on the spot", time: "minutes to an hour" },
        { icon: "clock", title: "A half-day errand", time: "up to 24 hours" },
        { icon: "grid", title: "Many people at once", time: "any number" },
      ] as { icon: IconKey; title: string; time: string }[],
      more: [
        "S: is the shop open, how long is the queue, is the item on the shelf, what is the price, what does the notice say. One person goes, looks, and sends a photo and an answer.",
        "M: collect a document at a counter, open a delivered parcel and check the contents, measure a physical item, phone a supplier and take notes. Reported in text and photos.",
        "L: check every station lift in the city on the same day, transcribe the notices at 50 shops at once, check every morning until something is fixed. Split into parallel requests, each confirmed by up to 5 people.",
        "Pilot limits: a deadline of up to 24 hours per request, up to 5 witnesses, and a bounty of up to 5 USDC per request.",
      ],
    },
    trust: {
      title: "Why the answer can be trusted",
      items: [
        { icon: "check", title: "AI checks the content" },
        { icon: "agree", title: "Final only when answers agree" },
        { icon: "chain", title: "Result and payout stay on Solana" },
      ] as { icon: IconKey; title: string }[],
      more: [
        "A summary where a transcription was asked for, or a photo that contradicts the answer, is sent back and the worker redoes it. The verdict and its reason are returned with the result.",
        "The requester decides how many people to ask and how many must agree. No single person's word has to be taken on trust.",
        "The bounty goes into escrow when the request is made and is paid to the worker once the result is final. The result hash and the payout are recorded on Solana, so no one has to trust the operator.",
      ],
    },
    roles: {
      title: "Which one are you?",
      dev: { icon: "terminal" as IconKey, title: "Building an agent", link: "For developers" },
      worker: { icon: "phone" as IconKey, title: "Answering requests on your phone", link: "For workers" },
    },
    example: {
      title: "What comes back",
      strong: "The answer comes with the reasons to believe it.",
      more: [
        "How many people checked, how many agreed, and which checks passed, including the AI review of the content, so the agent can decide its next step right away.",
        "The exact location is never passed to the agent or to the blockchain. Only the requester can see the photos, with embedded data such as the shooting location stripped. Solana holds the evidence hash, the verdict and the payout state, nothing more.",
      ],
      link: "How the checks work",
    },
    pilot: {
      title: "The pilot",
      items: [
        { icon: "pin", text: "On-site checks anywhere on the map; tasks with no particular place too" },
        { icon: "key", text: "Workers join with an invite code" },
        { icon: "coin", text: "Rewards are test USDC. No real money moves" },
      ] as { icon: IconKey; text: string }[],
      loginBefore: "Have an invite? ",
      login: "Sign in here",
      loginAfter: " as a worker.",
    },
    live: {
      title: "What is running today",
      items: [
        "Remote MCP server with OAuth 2.1. Connects from Claude Code, claude.ai and ChatGPT connectors",
        "Eight MCP tools: request, batch, read, cancel, dispute, and a watch that keeps checking",
        "x402: an agent with a Solana wallet pays in USDC and asks without signing up or holding an API key",
        "AI review of every submission (Claude). The verdict and its reason come back with the result",
        "A proof page and a badge for every result. Facts the requester publishes appear on the public map",
        "A worker app: in-app camera, location and nonce checks, push, read-aloud, voice input, work-from-home tasks",
      ],
    },
  },
} satisfies Record<Lang, unknown>;

export async function generateMetadata(): Promise<Metadata> {
  return COPY[await getLang()].meta;
}

export default async function Home() {
  const lang = await getLang();
  const c = COPY[lang];
  const h = (p: string) => langHref(lang, p);
  return (
    <>
      <PageHero eyebrow={c.eyebrow} title={c.title}>
        <p className="text-lg">
          <Plain>{c.intro}</Plain>
        </p>
        <div className="mt-6 grid gap-3 sm:flex sm:flex-wrap">
          <Link
            href={h("/try")}
            className="flex items-center justify-center gap-2 rounded-2xl bg-teal-700 px-6 py-4 text-base font-bold text-white hover:bg-teal-800"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden="true">
              <path d="M8 5l11 7-11 7z" />
            </svg>
            {c.ctaTry}
          </Link>
          <Link
            href={h("/developers")}
            className="flex items-center justify-center gap-2 rounded-2xl px-6 py-4 text-base font-bold text-teal-700 ring-1 ring-teal-700 hover:bg-teal-50"
          >
            <Icon k="terminal" className="h-5 w-5" />
            {c.ctaDev}
          </Link>
        </div>
      </PageHero>

      <Explainer />

      <Section title={c.sizes.title}>
        <div className="grid grid-cols-3 gap-3">
          {c.sizes.items.map((t) => (
            <div key={t.title} className="rounded-2xl border border-slate-200 p-3 text-center sm:p-5">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-teal-50">
                <Icon k={t.icon} />
              </div>
              <h3 className="mt-3 text-sm font-bold leading-snug sm:text-base">{t.title}</h3>
              <p className="mt-1 text-xs text-slate-500">{t.time}</p>
            </div>
          ))}
        </div>
        <More lang={lang}>
          {c.sizes.more.map((t) => (
            <p key={t}>
              <Plain>{t}</Plain>
            </p>
          ))}
        </More>
      </Section>

      <StatsHighlights lang={lang} />

      <Section title={c.trust.title}>
        <ul className="grid gap-3 sm:grid-cols-3">
          {c.trust.items.map((p) => (
            <li
              key={p.title}
              className="flex items-center gap-4 rounded-2xl bg-teal-50 p-4 sm:flex-col sm:text-center"
            >
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-white">
                <Icon k={p.icon} />
              </div>
              <h3 className="font-bold text-teal-900">
                <Plain>{p.title}</Plain>
              </h3>
            </li>
          ))}
        </ul>
        <More lang={lang}>
          {c.trust.more.map((t) => (
            <p key={t}>
              <Plain>{t}</Plain>
            </p>
          ))}
        </More>
      </Section>

      <Section title={c.roles.title}>
        <div className="grid gap-4 sm:grid-cols-2">
          {[
            { ...c.roles.dev, href: "/developers" },
            { ...c.roles.worker, href: "/workers" },
          ].map((r) => (
            <Link
              key={r.href}
              href={h(r.href)}
              className="card-link flex items-center gap-4 rounded-2xl border border-slate-200 p-5"
            >
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-teal-50">
                <Icon k={r.icon} className="h-10 w-10" />
              </div>
              <div className="min-w-0">
                <h3 className="text-lg font-bold leading-snug">{r.title}</h3>
                <p className="mt-1 text-sm font-semibold text-teal-700">
                  {r.link} <span className="arrow">→</span>
                </p>
              </div>
            </Link>
          ))}
        </div>
      </Section>

      <FeaturedResults lang={lang} />

      <Section title={c.example.title} lead={<strong className="text-slate-900">{c.example.strong}</strong>}>
        <pre className="overflow-x-auto rounded-2xl bg-slate-900 p-5 text-sm leading-relaxed text-slate-100">
          {`{
  "status": "VERIFIED",
  "answer": "OPEN",
  "witnesses": { "valid": 2, "required": 2, "quorum": 2 },
  "checks": {
    "geofence": "pass",
    "freshness": "pass",
    "replay": "pass",
    "vision_consistency": "pass"
  },
  "settlement": { "status": "SETTLED" }
}`}
        </pre>
        <More lang={lang}>
          {c.example.more.map((t) => (
            <p key={t}>
              <Plain>{t}</Plain>
            </p>
          ))}
          <p>
            <Link href={h("/how-it-works")} className="font-semibold text-teal-700 underline">
              {c.example.link}
            </Link>
          </p>
        </More>
      </Section>

      <Section title={c.pilot.title}>
        <ul className="grid gap-3 sm:grid-cols-3">
          {c.pilot.items.map((t) => (
            <li
              key={t.text}
              className="flex items-center gap-3 rounded-2xl bg-slate-50 p-4 text-sm text-slate-700"
            >
              <Icon k={t.icon} className="h-8 w-8 shrink-0" />
              <Plain>{t.text}</Plain>
            </li>
          ))}
        </ul>
        <p className="mt-5 text-sm text-slate-600">
          {c.pilot.loginBefore}
          <Link href={h("/login")} className="font-semibold text-teal-700 underline">
            {c.pilot.login}
          </Link>
          {c.pilot.loginAfter}
        </p>
        <details className="group mt-4 rounded-2xl border border-slate-200 p-4 open:bg-slate-50/50">
          <summary className="cursor-pointer select-none text-sm font-semibold text-teal-700">
            {c.live.title}
          </summary>
          <ul className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
            {c.live.items.map((t) => (
              <li key={t} className="rounded-xl bg-white p-3 ring-1 ring-slate-100">
                <Plain>{t}</Plain>
              </li>
            ))}
          </ul>
        </details>
      </Section>
    </>
  );
}
