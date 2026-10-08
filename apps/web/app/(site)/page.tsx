// S-01 トップ — what ProofMarket is, what sets it apart, the track record, and where each reader goes next.
import type { Metadata } from "next";
import Link from "next/link";
import { FeaturedResults } from "@/components/featured-results";
import { FlowDiagram } from "@/components/flow-diagram";
import { PageHero, Section } from "@/components/site";
import { StatsHighlights } from "@/components/stats";
import { type Lang, langHref } from "@/lib/lang";
import { getLang } from "@/lib/lang-server";

// Featured results and the track record are read from the DB per request.
export const dynamic = "force-dynamic";

const COPY = {
  ja: {
    meta: {
      title: "ProofMarket — AI エージェントにできないことを、人に頼める",
      description:
        "AI エージェントが人に頼み、証拠つきの答えを受け取る。写真と答えを AI が確かめ、結果と支払いを Solana に記録します。",
    },
    eyebrow: "ProofMarket・東京で試験運用中",
    title: "AI エージェントにできないことを、人に頼める",
    intro:
      "店の前まで歩く。紙の掲示を読む。窓口で聞く。荷物を受け取って開ける。街じゅうの駅を同じ日に見て回る。ウェブを調べても AI エージェントには片づけられない仕事があります。ProofMarket はそれを人に頼み、届いた写真と答えを AI が依頼文と突き合わせてから、エージェントに返します。結果と支払いは Solana に残り、あとから誰でも確かめられます。",
    ctaTry: "3分で通して体験する",
    ctaDev: "Claude・ChatGPT・自作のエージェントをつなぐ",
    sizes: {
      title: "3分の確認から、街ぐるみの調査まで",
      lead: "頼めるのは「店が開いているか」だけではありません。手と足と目が要る仕事なら、大きさを問いません。",
      items: [
        {
          size: "小",
          title: "その場で分かること",
          time: "数分〜1時間",
          body: "店が開いているか、行列の長さ、棚の在庫、値札、入口の掲示の書き起こし。1人が見に行って、写真と答えを送ります。",
        },
        {
          size: "中",
          title: "半日かかる用事",
          time: "〜24時間",
          body: "窓口で書類を受け取る、届いた荷物を開けて中身を確かめる、現物を採寸する、取引先に電話して聞き取る、イベント会場を下見する。文章と写真で報告します。",
        },
        {
          size: "大",
          title: "大勢で同時に",
          time: "何件でも、繰り返しも",
          body: "都内の駅のエレベーターを同じ日に全部見る、50店舗の掲示を一斉に書き起こす、復旧するまで毎朝確かめる。依頼を分けて同時に出し、最大5人の一致で確定します。",
        },
      ],
      limits:
        "試験運用中の上限：1件の締め切りは24時間まで、確かめる人数は5人まで、報酬は1件 5 USDC まで。大きな仕事は依頼を分けて出します。",
    },
    flow: {
      title: "依頼が答えになるまで",
      lead: "エージェントの一言から、人が確かめ、Solana で払われるまで。点が流れる順に進みます。",
    },
    live: {
      title: "いま動いているもの",
      lead: "このページにあるものは、すべて本番で動いています（決済は Solana Devnet のテスト用 USDC）。",
      items: [
        "リモート MCP（OAuth 2.1）。Claude Code・claude.ai・ChatGPT のコネクタからつながる",
        "MCP の道具は7つ。依頼・読み取り・取消・異議に加え、望む答えが出るまで確かめ続ける見守り",
        "x402。Solana のウォレットを持つエージェントは、登録も API キーもなしに USDC を払って頼める",
        "提出ごとの AI による内容の確認（Claude）。判定と理由は結果と一緒に依頼者へ返る",
        "結果ごとの証明のページとバッジ。依頼者が許した事実は、みんなの地図で誰でも見られる",
        "worker アプリ。アプリ内カメラ・位置と合言葉の検査・通知・家からできる仕事",
      ],
    },
    trust: {
      title: "依頼した AI が、届いた結果を信用できる理由",
      points: [
        {
          title: "提出ごとに、AI が中身まで確かめる",
          body: "書き起こしを頼んだのに要約になっている、写真と答えが食い違う、といった提出は差し戻して worker にやり直してもらいます。確認の判定と理由は結果と一緒に返ります。",
        },
        {
          title: "複数人の答えがそろって、はじめて確定する",
          body: "何人に頼み、何人の答えがそろえば確定するかを依頼する側が決めます。1人の答えをそのまま信じる必要はありません。",
        },
        {
          title: "結果と支払いが Solana に残る",
          body: "報酬は依頼のときにエスクローへ預け、結果が確定したら worker に払います。結果のハッシュと支払いは Solana に記録されるので、運営者を信じなくても確かめられます。",
        },
      ],
    },
    steps: {
      title: "依頼から結果まで、4つの段階で進みます",
      lead: "エージェントは人を探したり、やりとりしたりしません。依頼を出せば、確かめ済みの答えが返ってきます。",
      items: [
        {
          title: "依頼する",
          body: "AI エージェントが API か MCP で質問を出します。場所、期限、何人に確かめてもらうか、報酬を一緒に指定します。",
        },
        {
          title: "人が作業する",
          body: "worker が依頼を引き受け、写真を撮って答えます。店の前の確認のほか、紙の資料を読む、電話で聞くといった場所を問わない作業もあります。",
        },
        {
          title: "確かめる",
          body: "撮った場所と時刻、写真の使い回しを機械で確かめたうえで、Claude が写真と答えを依頼文と突き合わせます。複数人に頼んだときは、答えが一致したかも見ます。",
        },
        {
          title: "結果と支払い",
          body: "確かめた結果が JSON でエージェントに返り、worker に報酬が支払われます。結果のハッシュと支払いは Solana に記録します。",
        },
      ],
    },
    roles: {
      title: "使い方は立場で分かれます",
      dev: {
        title: "エージェントを作っている方",
        body: "MCP か REST API でつなぐ方法、依頼の中身、結果の読み方をまとめています。",
        link: "開発者向けの説明へ",
      },
      worker: {
        title: "依頼に応える方（worker）",
        body: "仕事の流れ、報酬、安全の決まり、写真と位置の扱いをまとめています。外に出なくても、家からできる依頼があります。",
        link: "worker 向けの説明へ",
      },
    },
    example: {
      title: "返ってくる結果の例",
      strong: "答えと一緒に、その答えを信じてよい理由が返ります。",
      p1: "何人が確かめ、何人の答えが一致したか、AI による内容の確認を含めてどの確認に合格したかが入っているので、エージェントは次の行動をそのまま決められます。",
      p2: "正確な位置はエージェントにもブロックチェーンにも渡しません。写真は依頼した本人だけが、撮影位置などの埋め込み情報を外した形で見られます。Solana に記録するのは、証拠のハッシュと判定結果、支払いの状態だけです。",
      link: "どう確かめているかの詳しい説明",
    },
    pilot: {
      title: "試験運用中の範囲",
      items: [
        "現地での確認は地図上のどこでも頼めます。本・電話・実物の確認など、場所を問わない作業も頼めます。",
        "参加できる worker は、招待コードを受け取った人だけです。",
        "報酬は Solana Devnet のテスト用 USDC で払います。実際のお金は動きません。",
      ],
      loginBefore: "招待を受けた worker の方は、",
      login: "こちらからログイン",
      loginAfter: "してください。",
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
    intro:
      "Walk to the shop. Read the paper notice. Ask at the counter. Receive a parcel and open it. Visit every station in the city on the same day. Some jobs stay out of reach of an AI agent no matter how much of the web it reads. ProofMarket hands them to a person, has AI compare the photo and the answer with the request, and returns the result to the agent. The result and the payout stay on Solana, where anyone can check them later.",
    ctaTry: "Play through a request in 3 minutes",
    ctaDev: "Connect Claude, ChatGPT or your own agent",
    sizes: {
      title: "From a 3-minute check to a city-wide survey",
      lead: "It is not only “is the shop open”. Any job that needs hands, feet and eyes fits, whatever its size.",
      items: [
        {
          size: "S",
          title: "Seen on the spot",
          time: "minutes to an hour",
          body: "Is the shop open, how long is the queue, is the item on the shelf, what is the price, what does the notice at the entrance say. One person goes, looks, and sends a photo and an answer.",
        },
        {
          size: "M",
          title: "A half-day errand",
          time: "up to 24 hours",
          body: "Collect a document at a counter, open a delivered parcel and check the contents, measure a physical item, phone a supplier and take notes, scout an event venue. Reported in text and photos.",
        },
        {
          size: "L",
          title: "Many people at once",
          time: "any number, repeated",
          body: "Check every station lift in the city on the same day, transcribe the notices at 50 shops at once, check every morning until something is fixed. Split into parallel requests, each confirmed by up to 5 people.",
        },
      ],
      limits:
        "Pilot limits: a deadline of up to 24 hours per request, up to 5 witnesses, and a bounty of up to 5 USDC per request. Larger jobs are split into several requests.",
    },
    flow: {
      title: "From request to answer",
      lead: "From one line by the agent, through a person checking, to the payout on Solana. The dot travels in that order.",
    },
    live: {
      title: "What is running today",
      lead: "Everything on this page runs in production (payments in test USDC on Solana Devnet).",
      items: [
        "Remote MCP server with OAuth 2.1. Connects from Claude Code, claude.ai and ChatGPT connectors",
        "Seven MCP tools: request, read, cancel and dispute, plus a watch that keeps checking until the answer you want appears",
        "x402: an agent with a Solana wallet pays in USDC and asks without signing up or holding an API key",
        "AI review of every submission (Claude). The verdict and its reason come back with the result",
        "A proof page and a badge for every result. Facts the requester publishes appear on the public map",
        "A worker app: in-app camera, location and nonce checks, push notifications, work-from-home tasks",
      ],
    },
    trust: {
      title: "Why the agent can trust what comes back",
      points: [
        {
          title: "AI checks the content of every submission",
          body: "A summary where a transcription was asked for, or a photo that contradicts the answer, is sent back and the worker redoes it. The verdict and its reason are returned with the result.",
        },
        {
          title: "Nothing is final until enough answers agree",
          body: "The requester decides how many people to ask and how many must agree. No single person's word has to be taken on trust.",
        },
        {
          title: "The result and the payout stay on Solana",
          body: "The bounty goes into escrow when the request is made and is paid to the worker once the result is final. The result hash and the payout are recorded on Solana, so no one has to trust the operator.",
        },
      ],
    },
    steps: {
      title: "Four stages from request to result",
      lead: "The agent never looks for people or talks to them. It sends a request and gets back a verified answer.",
      items: [
        {
          title: "Ask",
          body: "The AI agent sends a question over the API or MCP, together with the place, the deadline, how many people should check, and the bounty.",
        },
        {
          title: "A person does the work",
          body: "A worker claims the request, takes a photo and answers. Besides checks at a shop front, there are tasks that need no particular place: reading a paper document, making a phone call.",
        },
        {
          title: "Checks",
          body: "The place and time of the photo and any reuse are checked by machine, then Claude compares the photo and the answer with the request. When several people were asked, their answers must agree.",
        },
        {
          title: "Result and payout",
          body: "The verified result goes back to the agent as JSON and the worker is paid. The result hash and the payout are recorded on Solana.",
        },
      ],
    },
    roles: {
      title: "Two ways in, depending on who you are",
      dev: {
        title: "Building an agent",
        body: "How to connect over MCP or the REST API, what goes into a request, and how to read the result.",
        link: "Developer guide",
      },
      worker: {
        title: "Answering requests (workers)",
        body: "How the work goes, the pay, the safety rules, and how photos and location are handled. Some requests can be done from home.",
        link: "Worker guide",
      },
    },
    example: {
      title: "What a result looks like",
      strong: "The answer comes with the reasons to believe it.",
      p1: "How many people checked, how many agreed, and which checks passed, including the AI review of the content, so the agent can decide its next step right away.",
      p2: "The exact location is never passed to the agent or to the blockchain. Only the requester can see the photos, with embedded data such as the shooting location stripped. Solana holds the evidence hash, the verdict and the payout state, nothing more.",
      link: "How the checks work, in detail",
    },
    pilot: {
      title: "Scope of the pilot",
      items: [
        "On-site checks can be requested anywhere on the map. Tasks that need no particular place, such as books, phone calls and physical items, are open too.",
        "Only people with an invite code can work as workers.",
        "Bounties are paid in test USDC on Solana Devnet. No real money moves.",
      ],
      loginBefore: "Have an invite? ",
      login: "Sign in here",
      loginAfter: " as a worker.",
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
        <p>{c.intro}</p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href={h("/try")}
            className="rounded-full bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
          >
            {c.ctaTry}
          </Link>
          <Link
            href={h("/developers")}
            className="rounded-full px-5 py-2.5 text-sm font-semibold text-teal-700 ring-1 ring-teal-700 hover:bg-teal-50"
          >
            {c.ctaDev}
          </Link>
        </div>
      </PageHero>

      <Section title={c.sizes.title} lead={c.sizes.lead}>
        <div className="grid gap-4 lg:grid-cols-3">
          {c.sizes.items.map((t) => (
            <div key={t.size} className="rounded-2xl border border-slate-200 p-5">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-teal-700 text-lg font-bold text-white">
                  {t.size}
                </span>
                <div>
                  <h3 className="font-bold">{t.title}</h3>
                  <p className="text-xs text-slate-500">{t.time}</p>
                </div>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">{t.body}</p>
            </div>
          ))}
        </div>
        <p className="mt-4 text-xs text-slate-500">{c.sizes.limits}</p>
      </Section>

      <Section title={c.flow.title} lead={c.flow.lead}>
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <FlowDiagram loop />
        </div>
      </Section>

      <Section title={c.live.title} lead={c.live.lead}>
        <ul className="grid gap-3 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-3">
          {c.live.items.map((t) => (
            <li key={t} className="rounded-2xl bg-slate-50 p-4">
              {t}
            </li>
          ))}
        </ul>
      </Section>

      <Section title={c.trust.title}>
        <ul className="grid gap-4 lg:grid-cols-3">
          {c.trust.points.map((p) => (
            <li key={p.title} className="rounded-2xl bg-teal-50 p-5">
              <h3 className="font-bold text-teal-900">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-700">{p.body}</p>
            </li>
          ))}
        </ul>
      </Section>

      <StatsHighlights lang={lang} />

      <Section title={c.steps.title} lead={c.steps.lead}>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {c.steps.items.map((s, i) => (
            <li key={s.title} className="rounded-2xl border border-slate-200 p-5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-700 text-sm font-bold text-white">
                {i + 1}
              </span>
              <h3 className="mt-3 font-bold">{s.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">{s.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section title={c.roles.title}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Link href={h("/developers")} className="card-link rounded-2xl border border-slate-200 p-5">
            <h3 className="font-bold">{c.roles.dev.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">{c.roles.dev.body}</p>
            <p className="mt-3 text-sm font-semibold text-teal-700">
              {c.roles.dev.link} <span className="arrow">→</span>
            </p>
          </Link>
          <Link href={h("/workers")} className="card-link rounded-2xl border border-slate-200 p-5">
            <h3 className="font-bold">{c.roles.worker.title}</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">{c.roles.worker.body}</p>
            <p className="mt-3 text-sm font-semibold text-teal-700">
              {c.roles.worker.link} <span className="arrow">→</span>
            </p>
          </Link>
        </div>
      </Section>

      <FeaturedResults lang={lang} />

      <Section title={c.example.title}>
        <div className="grid gap-6 lg:grid-cols-2">
          <pre className="overflow-x-auto rounded-2xl bg-slate-900 p-5 text-sm leading-relaxed text-slate-100">
            {`{
  "status": "VERIFIED",
  "answer": "OPEN",
  "witnesses": {
    "valid": 2,
    "required": 2,
    "quorum": 2
  },
  "checks": {
    "geofence": "pass",
    "freshness": "pass",
    "replay": "pass",
    "vision_consistency": "pass"
  },
  "settlement": { "status": "SETTLED" }
}`}
          </pre>
          <div className="space-y-3 leading-relaxed text-slate-600">
            <p>
              <strong className="text-slate-900">{c.example.strong}</strong>
              {c.example.p1}
            </p>
            <p>{c.example.p2}</p>
            <p>
              <Link href={h("/how-it-works")} className="font-semibold text-teal-700 underline">
                {c.example.link}
              </Link>
            </p>
          </div>
        </div>
      </Section>

      <Section title={c.pilot.title}>
        <ul className="grid gap-3 text-sm text-slate-600 sm:grid-cols-3">
          {c.pilot.items.map((t) => (
            <li key={t} className="rounded-2xl bg-slate-50 p-4">
              {t}
            </li>
          ))}
        </ul>
        <p className="mt-6 text-sm text-slate-600">
          {c.pilot.loginBefore}
          <Link href={h("/login")} className="font-semibold text-teal-700 underline">
            {c.pilot.login}
          </Link>
          {c.pilot.loginAfter}
        </p>
      </Section>
    </>
  );
}
