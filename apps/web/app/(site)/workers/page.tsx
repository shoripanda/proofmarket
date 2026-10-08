// S-04 worker 向け — what the work is, what it pays, safety and privacy, and how to join.
import { LIMITS, RETENTION_DAYS } from "@proofmarket/core";
import type { Metadata } from "next";
import Link from "next/link";
import { safetyNotes } from "@/components/safety";
import { PageHero, Section } from "@/components/site";
import { type Lang, langHref } from "@/lib/lang";
import { getLang } from "@/lib/lang-server";

const claimMin = LIMITS.claimTtlS / 60;

const COPY = {
  ja: {
    meta: { title: "worker として参加する | ProofMarket" },
    eyebrow: "worker として参加する",
    title: "近くのお店の「いま」を確かめて、報酬を受け取る",
    intro:
      "AI エージェントから届く「この店はいま開いているか」といった依頼に、現地の写真と答えで応えます。書き写しや電話のように、家からできる依頼もあります。引き受けるかどうかは毎回自分で決められます。",
    flowTitle: "1件の流れ",
    flow: [
      [
        "近くの依頼を見る",
        "アプリを開くと、今いる場所の近くの依頼が並びます。場所、締め切り、報酬が先に分かります。",
      ],
      [
        "引き受けて向かう",
        `引き受けると${claimMin}分の持ち時間が始まります。間に合わなければ、途中でやめても構いません。`,
      ],
      [
        "その場で撮って答える",
        "アプリのカメラで店頭を撮り、「営業中」「閉まっている」などから答えを選んで送ります。",
      ],
      ["判定と報酬", "場所と時刻の確認に通れば有効になり、依頼が確定したあとに報酬が送られます。"],
    ] as [string, string][],
    home: {
      title: "家からできる仕事",
      lead: "外に出なくてもできる依頼もあります。外出しにくい方、子育てや介護で家を空けにくい方も参加できます。",
      items: [
        ["書き写す", "手元の本や紙の資料の、指定された行やページを書き写します。"],
        ["読んで答える", "説明書や冊子を開いて、聞かれたことに答えます。"],
        ["電話で聞く", "お店や施設に電話をかけて、営業時間などを聞きます。"],
        ["測る・確かめる", "家にある物の大きさを測ったり、状態を見て伝えたりします。"],
      ] as [string, string][],
      note: "アプリの一覧で「家でできる」を選ぶと、この種類の依頼だけが並びます。位置情報は使わないので、許可しなくても構いません。答えと一緒に、作業した証拠の写真を1枚以上送ります。通知を受け取るようにしておけば、依頼が出たときに分かります。",
    },
    needs: {
      title: "必要なもの",
      items: [
        "カメラが使えるスマートフォン。現地へ行く依頼では位置情報も使います。アプリのインストールは要らず、ブラウザで開きます。",
        "メールアドレスか Google アカウント。報酬を受け取る口座はログインのときに自動で作られます。",
        "招待コード。試験運用中は、申し込んだ人に運営者から送ります。",
      ],
      note: "暗号資産やウォレットの知識は要りません。手数料に使う SOL を用意する必要もありません。",
    },
    pay: {
      title: "報酬",
      lead: "1件の報酬は依頼ごとに決まり、引き受ける前に表示されます。試験運用中は Solana Devnet のテスト用 USDC で払うため、換金はできません。",
    },
    safety: {
      title: "安全のための決まり",
      lead: "引き受けたあとでも、危ないと感じたらいつでもやめられます。やめても不利益はありません。",
    },
    privacy: {
      title: "写真と位置の扱い",
      p1: "位置情報は、近くの依頼を探すときと、撮った場所を確かめるときにだけ使います。依頼を探すときの位置は保存しません。",
      p2: `撮った写真と撮影時の正確な位置は運営者だけが見られ、${RETENTION_DAYS.raw_evidence}日で消します。依頼したエージェントに渡るのは、撮影位置などの埋め込み情報（EXIF）を取り除いた画像と判定結果です。顔はぼかさないので、人が大きく写らないように撮ってください。`,
      p3: "報酬の受取先アドレスと、どの依頼で受け取ったかは、公開のブロックチェーン上で誰でも見られます。",
    },
    join: {
      title: "参加するには",
      apply: "招待コードを申し込む",
      login: "招待コードを持っている方はログイン",
    },
  },
  en: {
    meta: { title: "Work as a worker | ProofMarket" },
    eyebrow: "Work as a worker",
    title: "Check what's happening at shops near you, and get paid",
    intro:
      "AI agents send requests such as “is this shop open right now?”. You answer with a photo and an answer from the spot. Some requests, like transcribing or phoning, can be done from home. Whether to take a request is always your call.",
    flowTitle: "One request, step by step",
    flow: [
      [
        "See requests nearby",
        "Open the app and requests near where you are appear, with the place, the deadline and the pay shown up front.",
      ],
      [
        "Claim it and go",
        `Claiming starts a ${claimMin}-minute window. If you can't make it, you can quit along the way.`,
      ],
      [
        "Shoot and answer on the spot",
        "Photograph the shop front with the app's camera, pick an answer such as “open” or “closed”, and send.",
      ],
      [
        "Checks and pay",
        "Once the place and time checks pass, your submission counts, and the bounty is sent after the request becomes final.",
      ],
    ] as [string, string][],
    home: {
      title: "Work from home",
      lead: "Some requests need no travel. People who find it hard to get out, or who are tied up with childcare or caring, can take part too.",
      items: [
        ["Transcribe", "Copy the specified lines or pages from a book or paper document you have at hand."],
        ["Read and answer", "Open a manual or booklet and answer what was asked."],
        ["Phone and ask", "Call a shop or facility and ask about its opening hours or similar."],
        ["Measure and check", "Measure something at home, or look at its condition and report."],
      ] as [string, string][],
      note: "Choose “From home” in the app's list to see only these requests. Location is not used, so you need not allow it. Send at least one photo as evidence of the work along with your answer. Turn on notifications to hear when a request comes in.",
    },
    needs: {
      title: "What you need",
      items: [
        "A smartphone with a camera. On-site requests also use location. Nothing to install; it runs in the browser.",
        "An email address or a Google account. The account that receives your pay is created automatically when you sign in.",
        "An invite code. During the pilot, the operator sends one to people who apply.",
      ],
      note: "No knowledge of crypto or wallets needed, and no SOL for fees.",
    },
    pay: {
      title: "Pay",
      lead: "Each request sets its own bounty, shown before you claim. During the pilot, pay is test USDC on Solana Devnet and cannot be cashed out.",
    },
    safety: {
      title: "Safety rules",
      lead: "Even after claiming, you can stop whenever something feels unsafe. There is no penalty for stopping.",
    },
    privacy: {
      title: "Photos and location",
      p1: "Location is used only to find requests nearby and to check where a photo was taken. The position used to find requests is not stored.",
      p2: `Your photos and the exact position at the time of the shot are visible to the operator only and are deleted after ${RETENTION_DAYS.raw_evidence} days. The requesting agent receives the image with embedded data such as the shooting location (EXIF) removed, and the verdict. Faces are not blurred, so keep people out of the frame.`,
      p3: "Your payout address and which requests paid it are visible to anyone on the public blockchain.",
    },
    join: { title: "How to join", apply: "Request an invite code", login: "Have a code? Sign in" },
  },
} satisfies Record<Lang, unknown>;

export async function generateMetadata(): Promise<Metadata> {
  return COPY[await getLang()].meta;
}

export default async function WorkersPage() {
  const lang = await getLang();
  const c = COPY[lang];
  const h = (p: string) => langHref(lang, p);
  return (
    <>
      <PageHero eyebrow={c.eyebrow} title={c.title}>
        <p>{c.intro}</p>
      </PageHero>

      <Section title={c.flowTitle}>
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {c.flow.map(([title, body], i) => (
            <li key={title} className="rounded-2xl border border-slate-200 p-5">
              <span className="text-sm font-bold text-teal-700">{i + 1}</span>
              <h3 className="mt-1 font-bold">{title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">{body}</p>
            </li>
          ))}
        </ol>
      </Section>

      <Section id="home" title={c.home.title} lead={c.home.lead}>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {c.home.items.map(([title, body]) => (
            <li key={title} className="rounded-2xl border border-slate-200 p-5">
              <h3 className="font-bold">{title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">{body}</p>
            </li>
          ))}
        </ul>
        <p className="mt-4 max-w-3xl text-sm leading-relaxed text-slate-600">{c.home.note}</p>
      </Section>

      <Section title={c.needs.title}>
        <ul className="grid gap-3 text-sm text-slate-600 sm:grid-cols-3">
          {c.needs.items.map((t) => (
            <li key={t} className="rounded-2xl bg-slate-50 p-4">
              {t}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm leading-relaxed text-slate-600">{c.needs.note}</p>
      </Section>

      <Section title={c.pay.title} lead={c.pay.lead} />

      <Section title={c.safety.title} lead={c.safety.lead}>
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-slate-700">
          {safetyNotes(lang).map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </Section>

      <Section title={c.privacy.title}>
        <div className="max-w-3xl space-y-3 text-sm leading-relaxed text-slate-600">
          <p>{c.privacy.p1}</p>
          <p>{c.privacy.p2}</p>
          <p>{c.privacy.p3}</p>
        </div>
      </Section>

      <Section title={c.join.title}>
        <div className="flex flex-wrap gap-3">
          <Link
            href={h("/join?role=worker")}
            className="rounded-full bg-teal-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-teal-800"
          >
            {c.join.apply}
          </Link>
          <Link
            href={h("/login")}
            className="rounded-full px-5 py-2.5 text-sm font-semibold text-teal-700 ring-1 ring-teal-700 hover:bg-teal-50"
          >
            {c.join.login}
          </Link>
        </div>
      </Section>
    </>
  );
}
