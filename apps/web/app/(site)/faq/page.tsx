// S-09 よくある質問 — short answers, each pointing to the page with the details.
import { LIMITS, RETENTION_DAYS } from "@proofmarket/core";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHero, Section } from "@/components/site";
import { type Lang, langHref } from "@/lib/lang";
import { getLang } from "@/lib/lang-server";

type QA = { q: string; a: string; more?: [string, string] };

const claimMin = LIMITS.claimTtlS / 60;
const evidenceMin = LIMITS.evidenceUrlTtlS / 60;

const COPY = {
  ja: {
    meta: { title: "よくある質問 | ProofMarket" },
    eyebrow: "よくある質問",
    title: "参加する前に気になりやすいことに答えます",
    sections: ["worker の方から", "依頼する方から", "そのほか"] as [string, string, string],
    worker: [
      {
        q: "ウォレットや暗号資産の知識は要りますか",
        a: "要りません。メールか Google でログインすると、報酬の受取口座が自動で作られます。手数料に使う SOL を用意する必要もありません。",
      },
      {
        q: "引き受けたあとで、やめてもいいですか",
        a: `いつでもやめられます。やめても不利益はありません。引き受けてから ${claimMin} 分（締め切りが先に来ればその時刻）を過ぎると、自動で手放したことになります。`,
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
        q: "「信頼」や「制限中」とは何ですか",
        a: "直近90日の提出の記録から決まる段階です。有効な提出が増え、複数人の依頼で確定した答えと同じことが多いと「信頼」になり、それを条件にした依頼も受けられます。写真の使い回しで落ちた提出があると「制限中」になり、1人だけで確定する依頼は受けられません。報酬の画面で自分の段階を見られます。",
      },
      {
        q: "少数派の答えや「わからない」と答えたら、報酬はもらえませんか",
        a: "もらえます。確認をすべて通った写真と答えなら、多数派かどうかに関係なく報酬を払います。",
        more: ["/pricing", "お金の流れ"],
      },
    ] as QA[],
    requester: [
      {
        q: "結果が出るまで、どれくらいかかりますか",
        a: "人が現地まで行くので、ふつう 10〜60 分です。近くに worker がいないと締め切りまでに確定せず、EXPIRED として返り、費用は残高に戻ります。",
      },
      {
        q: "どの場所でも頼めますか",
        a: "どこでも頼めます。現地で見て確かめる依頼は緯度・経度で場所を指定し、本や紙の資料・実物・電話などの作業は場所を指定せずに頼めます。試験運用中の worker は東京都心にいるので、それ以外の場所は引き受け手が見つからないことがあります。",
        more: ["/rules", "依頼と撮影の決まり"],
      },
      {
        q: "写真は見られますか",
        a: `自分の依頼に限って、撮影位置などの埋め込み情報を外した画像を、${evidenceMin} 分間だけ有効な URL で取れます。正確な位置は渡しません。`,
        more: ["/developers", "開発者向けの説明"],
      },
      {
        q: "答えが本当に正しいと保証されますか",
        a: "保証はしません。返すのは「何人が確かめ、どの確認に通り、何人の答えが一致したか」です。確からしさを上げたいときは、確かめてもらう人数を増やしてください。",
        more: ["/how-it-works", "仕組み"],
      },
    ] as QA[],
    general: [
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
    ] as QA[],
  },
  en: {
    meta: { title: "FAQ | ProofMarket" },
    eyebrow: "FAQ",
    title: "Answers to the questions people ask before joining",
    sections: ["From workers", "From requesters", "Everything else"] as [string, string, string],
    worker: [
      {
        q: "Do I need to know about wallets or crypto?",
        a: "No. Sign in with email or Google and the account that receives your pay is created for you. You never need SOL for fees either.",
      },
      {
        q: "Can I quit after claiming a request?",
        a: `Yes, at any time, with no penalty. ${claimMin} minutes after claiming (or at the deadline, if that comes first) the claim is released automatically.`,
      },
      {
        q: "What happens if my photo fails a check?",
        a: `The reason appears on screen. If it is something you can fix by retaking, such as a large location error, you can resubmit up to ${LIMITS.attemptsPerClaim} times on the same request. If the photo was judged to be a reused one, you cannot resubmit on that request.`,
      },
      {
        q: "Is my location stored?",
        a: `The position used to find requests nearby is not stored. The exact position at the time of a shot is stored encrypted, visible to the operator only, and deleted after ${RETENTION_DAYS.precise_location} days.`,
        more: ["/workers", "Worker guide"],
      },
      {
        q: "When and where does the pay arrive?",
        a: "Once the request is final and the payout on Solana has gone through, it lands in the account created at sign-in. The app's Earnings screen shows the status and the transaction record. During the pilot it is test USDC and cannot be cashed out.",
      },
      {
        q: "What do “trusted” and “restricted” mean?",
        a: "Tiers based on your submissions over the last 90 days. With more valid submissions and answers that usually match the final result on multi-person requests, you become trusted and can take requests that require it. A submission rejected for reusing a photo makes you restricted, and you cannot take requests that a single person finalises. Your tier is shown on the Earnings screen.",
      },
      {
        q: "If I'm in the minority, or answer “can't tell”, do I still get paid?",
        a: "Yes. Any photo and answer that pass every check are paid, whether or not they match the majority.",
        more: ["/pricing", "Where the money goes"],
      },
    ] as QA[],
    requester: [
      {
        q: "How long until I get a result?",
        a: "A person has to get there, so usually 10 to 60 minutes. If no worker is nearby, the request is not finalised by the deadline, comes back as EXPIRED, and the cost returns to your balance.",
      },
      {
        q: "Can I ask about any place?",
        a: "Yes. On-site requests name a latitude and longitude; tasks involving books, paper documents, physical items or phone calls need no place at all. During the pilot, workers are in central Tokyo, so requests elsewhere may find no taker.",
        more: ["/rules", "Rules for requests and photos"],
      },
      {
        q: "Can I see the photos?",
        a: `For your own requests only, you can fetch the images with embedded data such as the shooting location removed, through a URL valid for ${evidenceMin} minutes. The exact position is never shared.`,
        more: ["/developers", "Developer guide"],
      },
      {
        q: "Is the answer guaranteed to be correct?",
        a: "No. What you get is how many people checked, which checks passed and how many answers agreed. To raise confidence, ask more people.",
        more: ["/how-it-works", "How it works"],
      },
    ] as QA[],
    general: [
      {
        q: "Why a blockchain?",
        a: "So that anyone can verify, without trusting the operator, that the bounty really was locked when the request was made and that a final result was not rewritten later. Photos and locations are never put on it.",
        more: ["/demo", "Compare a result with Solana"],
      },
      {
        q: "I want a photo of my shop removed",
        a: "Use the form on the rules page. We aim to act within one business day.",
        more: ["/rules#removal", "Removal request"],
      },
    ] as QA[],
  },
} satisfies Record<Lang, unknown>;

export async function generateMetadata(): Promise<Metadata> {
  return COPY[await getLang()].meta;
}

function List({ items, lang }: { items: QA[]; lang: Lang }) {
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
              href={langHref(lang, x.more[0])}
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

export default async function FaqPage() {
  const lang = await getLang();
  const c = COPY[lang];
  return (
    <>
      <PageHero eyebrow={c.eyebrow} title={c.title} />
      <Section title={c.sections[0]}>
        <List items={c.worker} lang={lang} />
      </Section>
      <Section title={c.sections[1]}>
        <List items={c.requester} lang={lang} />
      </Section>
      <Section title={c.sections[2]}>
        <List items={c.general} lang={lang} />
      </Section>
    </>
  );
}
