// S-04 worker 向け — what the work is, what it pays, safety and privacy, and how to join.
import { LIMITS, RETENTION_DAYS } from "@proofmarket/core";
import type { Metadata } from "next";
import Link from "next/link";
import { SAFETY_NOTES } from "@/components/safety";
import { PageHero, Section } from "@/components/site";

export const metadata: Metadata = { title: "worker として参加する | ProofMarket" };

const FLOW = [
  [
    "近くの依頼を見る",
    "アプリを開くと、今いる場所の近くの依頼が並びます。場所、締め切り、報酬が先に分かります。",
  ],
  [
    "引き受けて向かう",
    `引き受けると${LIMITS.claimTtlS / 60}分の持ち時間が始まります。間に合わなければ、途中でやめても構いません。`,
  ],
  [
    "その場で撮って答える",
    "アプリのカメラで店頭を撮り、「営業中」「閉まっている」などから答えを選んで送ります。",
  ],
  ["判定と報酬", "場所と時刻の確認に通れば有効になり、依頼が確定したあとに報酬が送られます。"],
];

const HOME_TASKS = [
  ["書き写す", "手元の本や紙の資料の、指定された行やページを書き写します。"],
  ["読んで答える", "説明書や冊子を開いて、聞かれたことに答えます。"],
  ["電話で聞く", "お店や施設に電話をかけて、営業時間などを聞きます。"],
  ["測る・確かめる", "家にある物の大きさを測ったり、状態を見て伝えたりします。"],
];

export default function WorkersPage() {
  return (
    <>
      <PageHero eyebrow="worker として参加する" title="近くのお店の「いま」を確かめて、報酬を受け取る">
        <p>
          AI
          エージェントから届く「この店はいま開いているか」といった依頼に、現地の写真と答えで応えます。書き写しや電話のように、家からできる依頼もあります。引き受けるかどうかは毎回自分で決められます。
        </p>
      </PageHero>

      <Section title="1件の流れ">
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FLOW.map(([title, body], i) => (
            <li key={title} className="rounded-2xl border border-slate-200 p-5">
              <span className="text-sm font-bold text-teal-700">{i + 1}</span>
              <h3 className="mt-1 font-bold">{title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">{body}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section
        id="home"
        title="家からできる仕事"
        lead="外に出なくてもできる依頼もあります。外出しにくい方、子育てや介護で家を空けにくい方も参加できます。"
      >
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {HOME_TASKS.map(([title, body]) => (
            <li key={title} className="rounded-2xl border border-slate-200 p-5">
              <h3 className="font-bold">{title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">{body}</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-slate-600">
          アプリの一覧で「家でできる」を選ぶと、この種類の依頼だけが並びます。位置情報は使わないので、許可しなくても構いません。答えと一緒に、作業した証拠の写真を1枚以上送ります。通知を受け取るようにしておけば、依頼が出たときに分かります。
        </p>
      </Section>

      <Section title="必要なもの">
        <ul className="grid gap-3 text-sm text-slate-600 sm:grid-cols-3">
          <li className="rounded-2xl bg-slate-50 p-4">
            カメラが使えるスマートフォン。現地へ行く依頼では位置情報も使います。アプリのインストールは要らず、ブラウザで開きます。
          </li>
          <li className="rounded-2xl bg-slate-50 p-4">
            メールアドレスか Google アカウント。報酬を受け取る口座はログインのときに自動で作られます。
          </li>
          <li className="rounded-2xl bg-slate-50 p-4">
            招待コード。試験運用中は、申し込んだ人に運営者から送ります。
          </li>
        </ul>
        <p className="mt-4 text-sm leading-relaxed text-slate-600">
          暗号資産やウォレットの知識は要りません。手数料に使う SOL を用意する必要もありません。
        </p>
      </Section>

      <Section
        title="報酬"
        lead="1件の報酬は依頼ごとに決まり、引き受ける前に表示されます。試験運用中は Solana Devnet のテスト用 USDC で払うため、換金はできません。"
      />

      <Section
        title="安全のための決まり"
        lead="引き受けたあとでも、危ないと感じたらいつでもやめられます。やめても不利益はありません。"
      >
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-slate-700">
          {SAFETY_NOTES.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </Section>

      <Section title="写真と位置の扱い">
        <div className="max-w-3xl space-y-3 text-sm leading-relaxed text-slate-600">
          <p>
            位置情報は、近くの依頼を探すときと、撮った場所を確かめるときにだけ使います。依頼を探すときの位置は保存しません。
          </p>
          <p>
            撮った写真と撮影時の正確な位置は運営者だけが見られ、{RETENTION_DAYS.raw_evidence}
            日で消します。依頼したエージェントに渡るのは、撮影位置などの埋め込み情報（EXIF）を取り除いた画像と判定結果です。顔はぼかさないので、人が大きく写らないように撮ってください。
          </p>
          <p>
            報酬の受取先アドレスと、どの依頼で受け取ったかは、公開のブロックチェーン上で誰でも見られます。
          </p>
        </div>
      </Section>

      <Section title="参加するには">
        <div className="flex flex-wrap gap-3">
          <Link
            href="/join?role=worker"
            className="rounded-full bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
          >
            招待コードを申し込む
          </Link>
          <Link
            href="/login"
            className="rounded-full px-5 py-2.5 text-sm font-semibold text-teal-700 ring-1 ring-teal-700 hover:bg-teal-50"
          >
            招待コードを持っている方はログイン
          </Link>
        </div>
      </Section>
    </>
  );
}
