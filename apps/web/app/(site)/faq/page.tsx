// S-09 よくある質問 — short answers, each pointing to the page with the details.
import { LIMITS, RETENTION_DAYS } from "@proofmarket/core";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHero, Section } from "@/components/site";

export const metadata: Metadata = { title: "よくある質問 | ProofMarket" };

type QA = { q: string; a: string; more?: [string, string] };

const WORKER: QA[] = [
  {
    q: "ウォレットや暗号資産の知識は要りますか",
    a: "要りません。メールか Google でログインすると、報酬の受取口座が自動で作られます。手数料に使う SOL を用意する必要もありません。",
  },
  {
    q: "引き受けたあとで、やめてもいいですか",
    a: `いつでもやめられます。やめても不利益はありません。引き受けてから ${LIMITS.claimTtlS / 60} 分（締め切りが先に来ればその時刻）を過ぎると、自動で手放したことになります。`,
  },
  {
    q: "写真が判定に落ちたら、どうなりますか",
    a: `理由が画面に出ます。位置の誤差が大きかったなど撮り直せる理由なら、同じ依頼で ${LIMITS.attemptsPerClaim} 回まで出し直せます。同じ写真の使い回しと判定されたときは、その依頼では出し直せません。`,
  },
  {
    q: "位置情報は保存されますか",
    a: `近くの依頼を探すときの位置は保存しません。撮影したときの正確な位置は、暗号化して運営者だけが見られる形で保存し、${RETENTION_DAYS.precise_location} 日で消します。`,
    more: ["/workers", "worker 向けの説明"],
  },
  {
    q: "報酬はいつ、どこに届きますか",
    a: "依頼が確定し、Solana 上での支払いが終わったときに、ログインで作られた口座に届きます。アプリの「報酬」画面で状態と取引の記録を見られます。試験運用中はテスト用 USDC なので換金はできません。",
  },
  {
    q: "少数派の答えや「わからない」と答えたら、報酬はもらえませんか",
    a: "もらえます。確認をすべて通った写真と答えなら、多数派かどうかに関係なく報酬を払います。",
    more: ["/pricing", "お金の流れ"],
  },
];

const REQUESTER: QA[] = [
  {
    q: "結果が出るまで、どれくらいかかりますか",
    a: "人が現地まで行くので、ふつう 10〜60 分です。近くに worker がいないと締め切りまでに確定せず、EXPIRED として返り、費用は残高に戻ります。",
  },
  {
    q: "どの場所でも頼めますか",
    a: "試験運用中は、渋谷・新宿を含む東京都心で、運営者が登録した公開の店舗だけです。",
    more: ["/rules", "依頼と撮影の決まり"],
  },
  {
    q: "写真は見られますか",
    a: `自分の依頼に限って、撮影位置などの埋め込み情報を外した画像を、${LIMITS.evidenceUrlTtlS / 60} 分間だけ有効な URL で取れます。正確な位置は渡しません。`,
    more: ["/developers", "開発者向けの説明"],
  },
  {
    q: "答えが本当に正しいと保証されますか",
    a: "保証はしません。返すのは「何人が確かめ、どの確認に通り、何人の答えが一致したか」です。確からしさを上げたいときは、確かめてもらう人数を増やしてください。",
    more: ["/how-it-works", "仕組み"],
  },
];

const GENERAL: QA[] = [
  {
    q: "なぜブロックチェーンを使うのですか",
    a: "報酬が依頼のときに本当に確保されていたことと、確定した結果を後から書き換えていないことを、運営者を信じなくても誰でも確かめられるようにするためです。写真や位置は載せません。",
    more: ["/demo", "結果を Solana と照らし合わせる"],
  },
  {
    q: "店の写真を消してほしいときは",
    a: "決まりのページにあるフォームから依頼してください。1 営業日を目安に対応します。",
    more: ["/rules#removal", "削除の依頼"],
  },
];

function List({ items }: { items: QA[] }) {
  return (
    <div className="divide-y divide-slate-200 rounded-2xl border border-slate-200">
      {items.map((x) => (
        <details key={x.q} className="group p-4">
          <summary className="cursor-pointer list-none font-semibold">
            <span className="mr-2 text-teal-700 group-open:rotate-90">›</span>
            {x.q}
          </summary>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">{x.a}</p>
          {x.more ? (
            <Link
              href={x.more[0]}
              className="mt-2 inline-block text-sm font-semibold text-teal-700 underline"
            >
              {x.more[1]}
            </Link>
          ) : null}
        </details>
      ))}
    </div>
  );
}

export default function FaqPage() {
  return (
    <>
      <PageHero eyebrow="よくある質問" title="参加する前に気になりやすいことに答えます" />
      <Section title="worker の方から">
        <List items={WORKER} />
      </Section>
      <Section title="依頼する方から">
        <List items={REQUESTER} />
      </Section>
      <Section title="そのほか">
        <List items={GENERAL} />
      </Section>
    </>
  );
}
