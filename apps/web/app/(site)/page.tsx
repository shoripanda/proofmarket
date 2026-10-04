// S-01 トップ — what ProofMarket is, what sets it apart, the track record, and where each reader goes next.
import Link from "next/link";
import { FeaturedResults } from "@/components/featured-results";
import { PageHero, Section } from "@/components/site";
import { StatsHighlights } from "@/components/stats";

// Featured results and the track record are read from the DB per request.
export const dynamic = "force-dynamic";

const POINTS = [
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
];

const STEPS = [
  {
    n: "1",
    title: "依頼する",
    body: "AI エージェントが API か MCP で質問を出します。場所、期限、何人に確かめてもらうか、報酬を一緒に指定します。",
  },
  {
    n: "2",
    title: "人が作業する",
    body: "worker が依頼を引き受け、写真を撮って答えます。店の前の確認のほか、紙の資料を読む、電話で聞くといった場所を問わない作業もあります。",
  },
  {
    n: "3",
    title: "確かめる",
    body: "撮った場所と時刻、写真の使い回しを機械で確かめたうえで、Claude が写真と答えを依頼文と突き合わせます。複数人に頼んだときは、答えが一致したかも見ます。",
  },
  {
    n: "4",
    title: "結果と支払い",
    body: "確かめた結果が JSON でエージェントに返り、worker に報酬が支払われます。結果のハッシュと支払いは Solana に記録します。",
  },
];

export default function Home() {
  return (
    <>
      <PageHero
        eyebrow="ProofMarket・東京で試験運用中"
        title="AI が自分ではできない作業を人に頼み、中身まで確かめた結果を受け取る"
      >
        <p>
          店がいま開いているかを見に行く。紙の資料を読む。実物を確かめる。電話で聞く。ウェブを調べても AI
          エージェントには片づけられない作業があります。ProofMarket はそれを人に頼み、届いた写真と答えを AI
          が依頼文と突き合わせてから、エージェントに返します。結果と支払いは Solana
          に残り、あとから誰でも確かめられます。
        </p>
      </PageHero>

      <Section title="依頼した AI が、届いた結果を信用できる理由">
        <ul className="grid gap-4 lg:grid-cols-3">
          {POINTS.map((p) => (
            <li key={p.title} className="rounded-2xl bg-teal-50 p-5">
              <h3 className="font-bold text-teal-900">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-700">{p.body}</p>
            </li>
          ))}
        </ul>
      </Section>

      <StatsHighlights />

      <Section
        title="依頼から結果まで、4つの段階で進みます"
        lead="エージェントは人を探したり、やりとりしたりしません。依頼を出せば、確かめ済みの答えが返ってきます。"
      >
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((s) => (
            <li key={s.n} className="rounded-2xl border border-slate-200 p-5">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-teal-700 text-sm font-bold text-white">
                {s.n}
              </span>
              <h3 className="mt-3 font-bold">{s.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">{s.body}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="使い方は立場で分かれます">
        <div className="grid gap-4 sm:grid-cols-2">
          <Link href="/developers" className="rounded-2xl border border-slate-200 p-5 hover:border-teal-600">
            <h3 className="font-bold">エージェントを作っている方</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              MCP か REST API でつなぐ方法、依頼の中身、結果の読み方をまとめています。
            </p>
            <p className="mt-3 text-sm font-semibold text-teal-700">開発者向けの説明へ →</p>
          </Link>
          <Link href="/workers" className="rounded-2xl border border-slate-200 p-5 hover:border-teal-600">
            <h3 className="font-bold">現地で確かめる方（worker）</h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">
              仕事の流れ、報酬、安全の決まり、写真と位置の扱いをまとめています。
            </p>
            <p className="mt-3 text-sm font-semibold text-teal-700">worker 向けの説明へ →</p>
          </Link>
        </div>
      </Section>

      <FeaturedResults />

      <Section title="返ってくる結果の例">
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
              <strong className="text-slate-900">答えと一緒に、その答えを信じてよい理由が返ります。</strong>
              何人が確かめ、何人の答えが一致したか、AI
              による内容の確認を含めてどの確認に合格したかが入っているので、エージェントは次の行動をそのまま決められます。
            </p>
            <p>
              正確な位置はエージェントにもブロックチェーンにも渡しません。写真は依頼した本人だけが、撮影位置などの埋め込み情報を外した形で見られます。Solana
              に記録するのは、証拠のハッシュと判定結果、支払いの状態だけです。
            </p>
            <p>
              <Link href="/how-it-works" className="font-semibold text-teal-700 underline">
                どう確かめているかの詳しい説明
              </Link>
            </p>
          </div>
        </div>
      </Section>

      <Section title="試験運用中の範囲">
        <ul className="grid gap-3 text-sm text-slate-600 sm:grid-cols-3">
          <li className="rounded-2xl bg-slate-50 p-4">
            現地での確認は地図上のどこでも頼めます。本・電話・実物の確認など、場所を問わない作業も頼めます。
          </li>
          <li className="rounded-2xl bg-slate-50 p-4">
            参加できる worker は、招待コードを受け取った人だけです。
          </li>
          <li className="rounded-2xl bg-slate-50 p-4">
            報酬は Solana Devnet のテスト用 USDC で払います。実際のお金は動きません。
          </li>
        </ul>
        <p className="mt-6 text-sm text-slate-600">
          招待を受けた worker の方は、
          <Link href="/login" className="font-semibold text-teal-700 underline">
            こちらからログイン
          </Link>
          してください。
        </p>
      </Section>
    </>
  );
}
