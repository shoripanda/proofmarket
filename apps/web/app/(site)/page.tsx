// S-01 トップ — what ProofMarket is, in four steps, and where each reader goes next.
import Link from "next/link";
import { PageHero, Section } from "@/components/site";

const STEPS = [
  {
    n: "1",
    title: "依頼する",
    body: "AI エージェントが API か MCP で質問を出します。場所、期限、何人に確かめてもらうか、報酬を一緒に指定します。",
  },
  {
    n: "2",
    title: "現地で確かめる",
    body: "近くにいる worker が依頼を引き受け、その場で写真を撮って答えます。1件は数分で終わります。",
  },
  {
    n: "3",
    title: "判定する",
    body: "撮った場所と時刻、写真の使い回しがないかを機械で確かめます。複数人に頼んだときは、答えが一致したかも見ます。",
  },
  {
    n: "4",
    title: "結果と支払い",
    body: "判定結果が JSON でエージェントに返り、worker に報酬が支払われます。証拠のハッシュと結果は Solana に記録します。",
  },
];

export default function Home() {
  return (
    <>
      <PageHero
        eyebrow="ProofMarket・東京で試験運用中"
        title="AI エージェントが、現地の人に「いま」を確かめてもらう"
      >
        <p>
          「この店はいま開いているか」のように、ウェブを調べても確かめきれない現地の事実があります。ProofMarket
          はその質問を近くにいる人に届け、撮ったばかりの写真と回答から判定して、結果を機械が読める形でエージェントに返します。
        </p>
      </PageHero>

      <Section
        title="依頼から結果まで、4つの段階で進みます"
        lead="エージェントは人を探したり、やりとりしたりしません。質問を出せば、判定済みの答えが返ってきます。"
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
    "replay": "pass"
  },
  "settlement": { "status": "SETTLED" }
}`}
          </pre>
          <div className="space-y-3 leading-relaxed text-slate-600">
            <p>
              <strong className="text-slate-900">答えと一緒に、その答えを信じてよい理由が返ります。</strong>
              何人が確かめ、何人の答えが一致したか、どの確認に合格したかが含まれるので、エージェントは次の行動をそのまま決められます。
            </p>
            <p>
              写真や正確な位置はエージェントにもブロックチェーンにも渡しません。Solana
              に記録するのは、証拠のハッシュと判定結果、支払いの状態だけです。
            </p>
          </div>
        </div>
      </Section>

      <Section title="試験運用中の範囲">
        <ul className="grid gap-3 text-sm text-slate-600 sm:grid-cols-3">
          <li className="rounded-2xl bg-slate-50 p-4">
            場所は渋谷・新宿を含む東京都心の、登録済みの店舗だけです。
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
