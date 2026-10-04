// S-05 仕組み — how evidence is checked (incl. the AI review, 01 §4.16), how answers are combined, and what goes on Solana (07 / 06).
import { LIMITS, RETENTION_DAYS } from "@proofmarket/core";
import type { Metadata } from "next";
import { PageHero, Section } from "@/components/site";

export const metadata: Metadata = { title: "仕組み | ProofMarket" };

const CHECKS: [string, string, string][] = [
  [
    "写真の形式",
    `JPEG で ${LIMITS.media.maxBytes / 1024 / 1024}MB 以下、短い辺が ${LIMITS.media.minShortEdgePx}px 以上で、画像として読めること`,
    "撮り直せる",
  ],
  ["使い回し", "まったく同じ写真ファイルが、過去のどの依頼にも出されていないこと", "その依頼では失格"],
  [
    "鮮度",
    "合言葉を受け取ってから、依頼が決めた秒数以内に写真が届いたこと。届いた写真が合言葉より前に置かれたものでもないこと",
    "撮り直せる",
  ],
  [
    "場所",
    `端末が知らせた位置が依頼の半径の中にあり、位置の誤差が ${LIMITS.geofence.maxAccuracyM}m 以内であること`,
    "撮り直せる",
  ],
  [
    "よく似た写真",
    `過去 ${LIMITS.duplicate.lookbackDays} 日に別の依頼や別の人から出された写真と、見た目がほぼ同じでないこと`,
    "その依頼では失格",
  ],
  [
    "AI による内容の確認",
    "ここまでをすべて通った提出だけを、Claude が依頼文と突き合わせる。書き起こしを頼んだのに要約になっている、写真と答えが食い違う、といった明らかな違いは差し戻す。写真では判断できない作業（電話など）は、注記を付けて合格にする",
    "やり直せる",
  ],
];

const CAN_CANNOT: [string, string][] = [
  [
    "写真が、合言葉を出してから決めた時間内に届いた",
    "写真がその時刻に撮られたこと（端末の時計は変えられる）",
  ],
  ["端末が知らせた位置が、決めた範囲の中にあった", "位置が偽装されていないこと（ブラウザからは見抜けない）"],
  ["同じ写真ファイルが過去に使われていない", "別の画面を撮り直した写真でないこと"],
  ["よく似た写真が、別の依頼や別の人から来ていない", "複数の worker が示し合わせていないこと"],
  [
    "写真と答えが依頼文に合っていると、AI が判断した",
    "AI の判断がいつも正しいこと（判断の理由を結果に残す）",
  ],
];

export default function HowItWorksPage() {
  return (
    <>
      <PageHero eyebrow="仕組み" title="依頼した AI が結果を信用できるように、確認を重ねて記録する">
        <p>
          依頼したエージェントは自分では作業できないので、届いた写真と答えが依頼どおりかを自分では確かめられません。そこで
          ProofMarket が、機械による確認、AI
          による内容の確認、複数人の答えの照合を重ね、その記録を結果と一緒に返します。
        </p>
        <p className="mt-3">
          これは写真が「この依頼のために、いま撮られて届いた」ことの状況証拠を積み重ねるもので、人がそこにいたことを物理的に証明するものではありません。何を確かめていて、何を確かめられないかを、ここにすべて書きます。
        </p>
      </PageHero>

      <Section
        title="写真はアプリの中のカメラでしか撮れません"
        lead="端末のアルバムから写真は選べません。撮る直前に、その依頼だけに使える合言葉（nonce）をサーバーが発行し、そこから時間を計ります。依頼した側に見せる画像は、撮影位置などの埋め込み情報（EXIF）を外して作り直したものです。"
      />

      <Section
        title="届いた写真は、順番に確認を通ります"
        lead="途中で1つでも落ちたらそこで止め、理由を worker に返します。撮り直せる理由なら、同じ依頼の中で最大3回まで出し直せます。"
      >
        <ol className="divide-y divide-slate-200 rounded-2xl border border-slate-200">
          {CHECKS.map(([name, cond, fail], i) => (
            <li key={name} className="grid gap-1 p-4 sm:grid-cols-[2rem_9rem_1fr_9rem] sm:gap-4">
              <span className="text-sm font-bold text-teal-700">{i + 1}</span>
              <span className="font-semibold">{name}</span>
              <span className="text-sm leading-relaxed text-slate-600">{cond}</span>
              <span className="text-sm text-slate-500">落ちたとき: {fail}</span>
            </li>
          ))}
        </ol>
      </Section>

      <Section
        title="確かめられることと、確かめられないこと"
        lead="右の列の弱さは、1つの依頼を複数の人に頼むこと、worker を招待制にすることで補っています。「偽造できない」とは言いません。"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl bg-emerald-50 p-5">
            <h3 className="font-bold text-emerald-900">確かめていること</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-emerald-900">
              {CAN_CANNOT.map(([c]) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl bg-amber-50 p-5">
            <h3 className="font-bold text-amber-900">確かめられないこと</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-amber-900">
              {CAN_CANNOT.map(([, c]) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <Section title="複数人の答えは、決めた人数がそろったときだけ確定します">
        <div className="max-w-3xl space-y-3 text-sm leading-relaxed text-slate-600">
          <p>
            依頼する側は「何人に確かめてもらうか」と「何人の答えがそろえば確定か（quorum）」を決めます。確認をすべて通った答えだけを数え、いちばん多い答えが
            quorum 以上あり、ほかと同数でなければ VERIFIED になります。答えが割れたら
            REJECTED、締め切りまでに有効な答えが足りなければ EXPIRED です。
          </p>
          <p>
            結果に入る一致率は「いちばん多い答えの数 ÷
            有効な答えの数」だけです。それ以外の信頼度のような数字は作りません。
          </p>
        </div>
      </Section>

      <Section title="Solana に記録するもの、しないもの">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 p-5">
            <h3 className="font-bold">記録するもの</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-slate-600">
              <li>依頼ごとの預かり口座と、そこに確保した報酬の額</li>
              <li>結果、証拠をまとめたハッシュ（evidence root）、結果のハッシュ、確定した時刻</li>
              <li>報酬の受取先アドレスと支払った額</li>
            </ul>
          </div>
          <div className="rounded-2xl border border-slate-200 p-5">
            <h3 className="font-bold">記録しないもの</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-slate-600">
              <li>写真、座標、質問文</li>
              <li>worker の ID・名前・連絡先、依頼した人の名前、API キー</li>
              <li>依頼の ID そのもの（ハッシュにしたものだけを置く）</li>
            </ul>
          </div>
        </div>
        <div className="mt-6 max-w-3xl space-y-3 text-sm leading-relaxed text-slate-600">
          <p>
            ブロックチェーンを使うのは、運営者を信じなくても次の2点を誰でも確かめられるようにするためです。報酬が依頼のときに本当に確保されていたこと、そして確定した結果を後から書き換えていないことです。
          </p>
          <p>
            一方で、結果を確定させる鍵は運営者が持つ1本だけで、分散した検証ではありません。支払いを実行する鍵とは分けてあり、片方の鍵だけでは預かり口座から送金先と送金の両方を動かせないようにしています。
          </p>
          <p>
            写真と正確な位置は運営者のサーバーにだけ置き、{RETENTION_DAYS.raw_evidence}
            日で消します。写真から作ったハッシュは、使い回しを見抜くために残します。
          </p>
        </div>
      </Section>
    </>
  );
}
