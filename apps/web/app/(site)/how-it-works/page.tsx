// S-05 仕組み — how evidence is checked (incl. the AI review, 01 §4.16), how answers are combined, and what goes on Solana (07 / 06).
import { LIMITS, RETENTION_DAYS } from "@proofmarket/core";
import type { Metadata } from "next";
import { PageHero, Section } from "@/components/site";
import type { Lang } from "@/lib/lang";
import { getLang } from "@/lib/lang-server";

const mb = LIMITS.media.maxBytes / 1024 / 1024;

const COPY = {
  ja: {
    meta: { title: "仕組み | ProofMarket" },
    eyebrow: "仕組み",
    title: "依頼した AI が結果を信用できるように、確認を重ねて記録する",
    intro1:
      "依頼したエージェントは自分では作業できないので、届いた写真と答えが依頼どおりかを自分では確かめられません。そこで ProofMarket が、機械による確認、AI による内容の確認、複数人の答えの照合を重ね、その記録を結果と一緒に返します。",
    intro2:
      "これは写真が「この依頼のために、いま撮られて届いた」ことの状況証拠を積み重ねるもので、人がそこにいたことを物理的に証明するものではありません。何を確かめていて、何を確かめられないかを、ここにすべて書きます。",
    camera: {
      title: "写真はアプリの中のカメラでしか撮れません",
      lead: "端末のアルバムから写真は選べません。撮る直前に、その依頼だけに使える合言葉（nonce）をサーバーが発行し、そこから時間を計ります。依頼した側に見せる画像は、撮影位置などの埋め込み情報（EXIF）を外して作り直したものです。",
    },
    checks: {
      title: "届いた写真は、順番に確認を通ります",
      lead: "途中で1つでも落ちたらそこで止め、理由を worker に返します。撮り直せる理由なら、同じ依頼の中で最大3回まで出し直せます。",
      onFail: "落ちたとき: ",
      items: [
        [
          "写真の形式",
          `JPEG で ${mb}MB 以下、短い辺が ${LIMITS.media.minShortEdgePx}px 以上で、画像として読めること`,
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
      ] as [string, string, string][],
    },
    canCannot: {
      title: "確かめられることと、確かめられないこと",
      lead: "右の列の弱さは、1つの依頼を複数の人に頼むこと、worker を招待制にすることで補っています。「偽造できない」とは言いません。",
      can: "確かめていること",
      cannot: "確かめられないこと",
      items: [
        [
          "写真が、合言葉を出してから決めた時間内に届いた",
          "写真がその時刻に撮られたこと（端末の時計は変えられる）",
        ],
        [
          "端末が知らせた位置が、決めた範囲の中にあった",
          "位置が偽装されていないこと（ブラウザからは見抜けない）",
        ],
        ["同じ写真ファイルが過去に使われていない", "別の画面を撮り直した写真でないこと"],
        ["よく似た写真が、別の依頼や別の人から来ていない", "複数の worker が示し合わせていないこと"],
        [
          "写真と答えが依頼文に合っていると、AI が判断した",
          "AI の判断がいつも正しいこと（判断の理由を結果に残す）",
        ],
      ] as [string, string][],
    },
    quorum: {
      title: "複数人の答えは、決めた人数がそろったときだけ確定します",
      p1: "依頼する側は「何人に確かめてもらうか」と「何人の答えがそろえば確定か（quorum）」を決めます。確認をすべて通った答えだけを数え、いちばん多い答えが quorum 以上あり、ほかと同数でなければ VERIFIED になります。答えが割れたら REJECTED、締め切りまでに有効な答えが足りなければ EXPIRED です。",
      p2: "結果に入る一致率は「いちばん多い答えの数 ÷ 有効な答えの数」だけです。それ以外の信頼度のような数字は作りません。",
    },
    chain: {
      title: "Solana に記録するもの、しないもの",
      yes: "記録するもの",
      yesItems: [
        "依頼ごとの預かり口座と、そこに確保した報酬の額",
        "結果、証拠をまとめたハッシュ（evidence root）、結果のハッシュ、確定した時刻",
        "報酬の受取先アドレスと支払った額",
      ],
      no: "記録しないもの",
      noItems: [
        "写真、座標、質問文",
        "worker の ID・名前・連絡先、依頼した人の名前、API キー",
        "依頼の ID そのもの（ハッシュにしたものだけを置く）",
      ],
      p1: "ブロックチェーンを使うのは、運営者を信じなくても次の2点を誰でも確かめられるようにするためです。報酬が依頼のときに本当に確保されていたこと、そして確定した結果を後から書き換えていないことです。",
      p2: "一方で、結果を確定させる鍵は運営者が持つ1本だけで、分散した検証ではありません。支払いを実行する鍵とは分けてあり、片方の鍵だけでは預かり口座から送金先と送金の両方を動かせないようにしています。",
      p3: `写真と正確な位置は運営者のサーバーにだけ置き、${RETENTION_DAYS.raw_evidence}日で消します。写真から作ったハッシュは、使い回しを見抜くために残します。`,
    },
  },
  en: {
    meta: { title: "How it works | ProofMarket" },
    eyebrow: "How it works",
    title: "Layered checks, recorded, so the agent that asked can trust the result",
    intro1:
      "The agent that asked cannot do the work itself, so it cannot tell on its own whether the photo and the answer match the request. ProofMarket layers machine checks, an AI review of the content and a comparison across several people's answers, and returns that record with the result.",
    intro2:
      "These checks build circumstantial evidence that a photo was taken now, for this request, and delivered. They do not physically prove that a person stood there. Everything we check, and everything we cannot, is written here.",
    camera: {
      title: "Photos can only be taken with the camera inside the app",
      lead: "Nothing can be picked from the phone's photo library. Just before the shot, the server issues a one-time nonce for that request and starts the clock. The image shown to the requester is re-encoded with embedded data such as the shooting location (EXIF) removed.",
    },
    checks: {
      title: "Each photo goes through the checks in order",
      lead: "If one fails, the process stops there and the reason goes back to the worker. If the reason allows a retake, the worker can resubmit up to 3 times within the same request.",
      onFail: "On failure: ",
      items: [
        [
          "Format",
          `JPEG of at most ${mb} MB, shorter edge at least ${LIMITS.media.minShortEdgePx} px, and readable as an image`,
          "retake",
        ],
        [
          "Reuse",
          "The identical photo file has never been submitted to any earlier request",
          "disqualified for this request",
        ],
        [
          "Freshness",
          "The photo arrived within the number of seconds the request allows after the nonce was issued, and was not staged before the nonce",
          "retake",
        ],
        [
          "Place",
          `The position reported by the phone lies within the request's radius, with an accuracy of ${LIMITS.geofence.maxAccuracyM} m or better`,
          "retake",
        ],
        [
          "Near-duplicate",
          `Not visually almost identical to a photo submitted by another person or for another request in the past ${LIMITS.duplicate.lookbackDays} days`,
          "disqualified for this request",
        ],
        [
          "AI review of the content",
          "Only submissions that passed everything above are compared with the request by Claude. Obvious mismatches, such as a summary where a transcription was asked for or a photo that contradicts the answer, are sent back. Work a photo cannot judge (a phone call, say) passes with a note",
          "redo",
        ],
      ] as [string, string, string][],
    },
    canCannot: {
      title: "What we can verify, and what we cannot",
      lead: "The weaknesses in the right-hand column are offset by asking several people per request and by keeping workers invite-only. We do not claim it cannot be forged.",
      can: "What we verify",
      cannot: "What we cannot verify",
      items: [
        [
          "The photo arrived within the set time after the nonce was issued",
          "That the photo was taken at that moment (a phone clock can be changed)",
        ],
        [
          "The position reported by the phone was inside the set area",
          "That the position was not spoofed (a browser cannot tell)",
        ],
        ["The same photo file was never used before", "That it is not a re-photograph of another screen"],
        [
          "No near-identical photo came from another request or another person",
          "That several workers did not collude",
        ],
        [
          "AI judged that the photo and the answer match the request",
          "That the AI is always right (its reasoning is kept with the result)",
        ],
      ] as [string, string][],
    },
    quorum: {
      title: "Several answers become final only when the agreed number line up",
      p1: "The requester sets how many people should check and how many answers must agree (the quorum). Only answers that passed every check count. The most common answer wins when it reaches the quorum and is not tied; the result is VERIFIED. A split is REJECTED; too few valid answers by the deadline is EXPIRED.",
      p2: "The only agreement figure in the result is the count of the most common answer divided by the count of valid answers. We invent no other confidence score.",
    },
    chain: {
      title: "What goes on Solana, and what does not",
      yes: "Recorded",
      yesItems: [
        "An escrow account per request and the bounty locked in it",
        "The result, the evidence root (a hash over the evidence), the result hash and the time it became final",
        "The payout address and the amount paid",
      ],
      no: "Not recorded",
      noItems: [
        "Photos, coordinates, the question text",
        "Worker IDs, names or contact details, requester names, API keys",
        "The request ID itself (only its hash is stored)",
      ],
      p1: "The blockchain is there so that anyone can verify two things without trusting the operator: that the bounty really was locked when the request was made, and that a final result was not rewritten afterwards.",
      p2: "On the other hand, a single operator key finalises results; this is not decentralised verification. It is separate from the key that executes payouts, so neither key alone can move both the destination and the funds out of escrow.",
      p3: `Photos and exact positions stay on the operator's server only and are deleted after ${RETENTION_DAYS.raw_evidence} days. Hashes derived from photos are kept to detect reuse.`,
    },
  },
} satisfies Record<Lang, unknown>;

export async function generateMetadata(): Promise<Metadata> {
  return COPY[await getLang()].meta;
}

export default async function HowItWorksPage() {
  const c = COPY[await getLang()];
  return (
    <>
      <PageHero eyebrow={c.eyebrow} title={c.title}>
        <p>{c.intro1}</p>
        <p className="mt-3">{c.intro2}</p>
      </PageHero>

      <Section title={c.camera.title} lead={c.camera.lead} />

      <Section title={c.checks.title} lead={c.checks.lead}>
        <ol className="divide-y divide-slate-200 rounded-2xl border border-slate-200">
          {c.checks.items.map(([name, cond, fail], i) => (
            <li key={name} className="grid gap-1 p-4 sm:grid-cols-[2rem_9rem_1fr_9rem] sm:gap-4">
              <span className="text-sm font-bold text-teal-700">{i + 1}</span>
              <span className="font-semibold">{name}</span>
              <span className="text-sm leading-relaxed text-slate-600">{cond}</span>
              <span className="text-sm text-slate-500">
                {c.checks.onFail}
                {fail}
              </span>
            </li>
          ))}
        </ol>
      </Section>

      <Section title={c.canCannot.title} lead={c.canCannot.lead}>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl bg-emerald-50 p-5">
            <h3 className="font-bold text-emerald-900">{c.canCannot.can}</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-emerald-900">
              {c.canCannot.items.map(([x]) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl bg-amber-50 p-5">
            <h3 className="font-bold text-amber-900">{c.canCannot.cannot}</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-amber-900">
              {c.canCannot.items.map(([, x]) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        </div>
      </Section>

      <Section title={c.quorum.title}>
        <div className="max-w-3xl space-y-3 text-sm leading-relaxed text-slate-600">
          <p>{c.quorum.p1}</p>
          <p>{c.quorum.p2}</p>
        </div>
      </Section>

      <Section title={c.chain.title}>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-slate-200 p-5">
            <h3 className="font-bold">{c.chain.yes}</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-slate-600">
              {c.chain.yesItems.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-2xl border border-slate-200 p-5">
            <h3 className="font-bold">{c.chain.no}</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed text-slate-600">
              {c.chain.noItems.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        </div>
        <div className="mt-6 max-w-3xl space-y-3 text-sm leading-relaxed text-slate-600">
          <p>{c.chain.p1}</p>
          <p>{c.chain.p2}</p>
          <p>{c.chain.p3}</p>
        </div>
      </Section>
    </>
  );
}
