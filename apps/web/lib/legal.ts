// S-10 legal documents (drafts before legal review). Plain data so both the server and the worker app can read
// the versions. Bump a document's version whenever its text changes; onboarding then asks for consent again.
// The English text is a reference translation of the Japanese, which is the version people consent to.
import { LIMITS, RETENTION_DAYS } from "@proofmarket/core";
import type { Lang } from "./lang";

export const LEGAL_VERSIONS = {
  worker_terms: "2026-10-04",
  safety_rules: "2026-10-03",
  privacy_notice: "2026-10-04",
  requester_terms: "2026-10-04",
} as const;

export type LegalSlug = "worker-terms" | "requester-terms" | "privacy" | "operator";

export interface LegalDoc {
  title: string;
  version?: string;
  lead: string;
  sections: { h: string; ps: string[] }[];
}

const claimMin = LIMITS.claimTtlS / 60;
const evidenceMin = LIMITS.evidenceUrlTtlS / 60;

export const LEGAL_DOCS: Record<Exclude<LegalSlug, "operator">, LegalDoc> = {
  "worker-terms": {
    title: "worker 参加規約",
    version: LEGAL_VERSIONS.worker_terms,
    lead: "ProofMarket の試験運用に worker として参加する方と、運営者との約束です。登録のときに同意をいただきます。",
    sections: [
      {
        h: "1. 参加の条件",
        ps: [
          "参加できるのは、運営者から招待コードを受け取った18歳以上の方です。",
          "1人が持てるアカウントは1つです。アカウントを人に貸したり譲ったりしないでください。",
        ],
      },
      {
        h: "2. 依頼を引き受けるかどうか",
        ps: [
          "依頼を引き受けるかどうかは、毎回あなたが決めます。断っても、長く使わなくても、不利益はありません。決まった時間に待機する義務も、ほかのサービスで働くことの制限もありません。",
          `引き受けたあとでも、いつでもやめられます。引き受けてから${claimMin}分（締め切りが先ならその時刻）を過ぎると、自動で手放したことになります。`,
        ],
      },
      {
        h: "3. 撮影と安全",
        ps: [
          "撮影の決まり（店頭だけを写す、人の顔が大きく写らないようにする、店内や立入禁止の場所に入らない）と、法令、施設の決まりを守ってください。",
          "危ないと感じたら、すぐにやめてください。やめたことで不利益はありません。",
        ],
      },
      {
        h: "4. 報酬",
        ps: [
          "報酬の額は依頼ごとに決まり、引き受ける前に表示します。",
          "確認をすべて通った写真と答えを出した方には、答えが多数派かどうかに関係なく報酬を払います。確認に落ちた提出には払いません。",
          "報酬は、依頼が確定して Solana 上の支払いが終わったときに、ログインで作られた受取口座に送ります。試験運用中はテスト用の資産で払うため、換金はできません。",
        ],
      },
      {
        h: "5. 判定に納得できないとき",
        ps: [
          "判定に落ちた理由はアプリに表示します。理由に納得できないときは、運営者情報のページにある連絡先へお知らせください。",
        ],
      },
      {
        h: "6. 写真の扱い",
        ps: [
          "撮った写真の著作権はあなたに残ります。そのうえで、判定、依頼した人への証拠の提示、不正の調査、障害の調査に使うことを、運営者に許してください。",
          `写真と撮影時の正確な位置は${RETENTION_DAYS.raw_evidence}日で消します。使い回しを見抜くために、写真から計算したハッシュは残します。`,
        ],
      },
      {
        h: "7. してはいけないこと",
        ps: [
          "位置や時刻の偽装、過去の写真や他人の写真の使い回し、画面の撮り直し、ほかの worker と示し合わせて答えをそろえることを禁じます。見つけたときは、その提出を無効にし、アカウントを止めることがあります。",
        ],
      },
      {
        h: "8. 公開される情報",
        ps: [
          "報酬の受取口座のアドレスと、どの依頼で受け取ったかは、公開のブロックチェーン上で誰でも見られます。同じアドレスが続けて使われるため、同じ人が関わった依頼を結び付けられます。",
        ],
      },
      {
        h: "9. 規約の変更",
        ps: [
          "この規約を変えるときは、変更点をこのサイトで知らせます。大事な変更のときは、改めて同意をいただきます。同意しない場合は、いつでも参加をやめられます。",
        ],
      },
      { h: "10. 準拠法", ps: ["この規約は日本の法律に従って解釈します。"] },
    ],
  },
  "requester-terms": {
    title: "依頼者（API 利用）規約",
    version: LEGAL_VERSIONS.requester_terms,
    lead: "API キーを受け取り、エージェントから ProofMarket に依頼を出す方と、運営者との約束です。",
    sections: [
      {
        h: "1. 責任を持つ人",
        ps: [
          "API キーは、それを使って出された依頼に責任を持つ個人か組織（principal）に結び付けて発行します。キーを使うエージェントが出した依頼は、その principal が出したものとして扱います。",
          "キーを人に渡さず、漏れたと思ったらすぐに運営者へ知らせてください。運営者はキーを止めます。",
        ],
      },
      {
        h: "2. 依頼してよいこと",
        ps: [
          "依頼できるのは、運営者が登録した公開の店舗についての、店の前で誰にでも分かる事実だけです。決まりのページにある「受けない依頼」に当たる依頼は断ります。すり抜けたものを見つけたときは、依頼を止め、キーを止めることがあります。",
        ],
      },
      {
        h: "3. 結果の性質",
        ps: [
          "返す結果は、何人が確かめ、どの確認に通り、何人の答えが一致したかを示すもので、答えが正しいことを保証するものではありません。結果をもとにした判断は、依頼した側の責任で行ってください。",
        ],
      },
      {
        h: "4. 費用と上限",
        ps: [
          "1件の費用は「1人あたりの報酬 × 確かめてもらう人数」です。試験運用中は手数料をいただかず、残高と報酬にはテスト用の資産を使います。",
          "キーごとに、1件あたりと1日あたりの上限額を決めます。上限や残高を超える依頼は受け付けません。",
        ],
      },
      {
        h: "5. 写真と結果の使い方",
        ps: [
          `自分の依頼の写真は、撮影位置などの埋め込み情報を外した画像を${evidenceMin}分間だけ有効な URL で取れます。写真をこのサービスの目的の外で公開したり、写った人を調べたりしないでください。`,
          "結果のうち、答え・人数・確認の結果・ハッシュは、運営者が選んで公開ページに載せることがあります。質問文と場所は載せません。",
        ],
      },
      {
        h: "6. 止めること",
        ps: [
          "規約に反する使い方、不正の疑い、システムを守るために必要なときは、予告なくキーや依頼の受付を止めることがあります。",
        ],
      },
      { h: "7. 準拠法", ps: ["この規約は日本の法律に従って解釈します。"] },
    ],
  },
  privacy: {
    title: "プライバシーポリシー",
    version: LEGAL_VERSIONS.privacy_notice,
    lead: "ProofMarket が集める情報、使う目的、見られる人、残す期間をまとめます。",
    sections: [
      {
        h: "1. worker について集める情報",
        ps: [
          "ログインに使うメールアドレス（または Google のアカウント情報）と報酬の受取口座のアドレスは、ログインと支払いのために、参加している間持ちます。",
          "近くの依頼を探すときの位置は、端末の中でおおよそ100mに丸めてから送り、並べ替えに使うだけで保存しません。",
          `写真と、撮影時の正確な位置、写真に埋め込まれていた情報（EXIF）は、判定と不正・障害の調査のために暗号化して保存し、運営者だけが見られます。${RETENTION_DAYS.raw_evidence}日で消します。`,
        ],
      },
      {
        h: "2. 依頼する方について集める情報",
        ps: [
          "API キーのハッシュ、依頼の内容、残高の記録を、サービスの提供と監査のために持ちます。キーそのものは保存しません。",
        ],
      },
      {
        h: "3. 申し込みと削除依頼",
        ps: [
          "参加の申し込みでいただくメールアドレスとおおまかな地域は、連絡のためだけに使い、暗号化して保存し、90日で消します。",
          "写真の削除依頼でいただくメールアドレスと内容は、対応のためだけに使い、対応の記録として1年間残します。",
        ],
      },
      {
        h: "4. 公開されるもの",
        ps: [
          "Solana には、依頼の ID をハッシュにした値、預かった報酬の額、結果、証拠と結果のハッシュ、報酬の受取口座のアドレスと支払額を記録します。ブロックチェーンの記録は誰でも見られ、消せません。写真、位置、質問文、名前、連絡先は記録しません。",
        ],
      },
      {
        h: "5. 情報を預ける事業者",
        ps: [
          "ログインと受取口座の作成に Privy、データベースと写真の保存に Supabase（東京リージョン）、アプリの配信に Vercel を使います。これらには国外の事業者が含まれ、情報が国外のサーバーで扱われることがあります。",
        ],
      },
      {
        h: "6. 問い合わせ",
        ps: [
          "自分の情報の確認、訂正、削除を求めるときは、運営者情報のページにある連絡先へお知らせください。ブロックチェーンに記録したものは、仕組みのうえで消せません。",
        ],
      },
    ],
  },
};

const LEGAL_DOCS_EN: Record<Exclude<LegalSlug, "operator">, LegalDoc> = {
  "worker-terms": {
    title: "Worker terms",
    version: LEGAL_VERSIONS.worker_terms,
    lead: "The agreement between the operator and people who take part in the ProofMarket pilot as workers. Consent is given at registration. Reference translation; the Japanese text governs.",
    sections: [
      {
        h: "1. Who can take part",
        ps: [
          "Anyone aged 18 or over who has received an invite code from the operator.",
          "One account per person. Do not lend or transfer your account to anyone.",
        ],
      },
      {
        h: "2. Taking a request is always your choice",
        ps: [
          "You decide each time whether to take a request. Declining, or not using the service for a long time, carries no penalty. There is no duty to be on standby at set times and no restriction on working for other services.",
          `You can quit at any time after claiming. ${claimMin} minutes after claiming (or at the deadline, if that comes first) the claim is released automatically.`,
        ],
      },
      {
        h: "3. Photos and safety",
        ps: [
          "Follow the photo rules (shoot only the shop front, keep people's faces out of the frame, do not enter the premises or restricted areas), the law, and the rules of the place you are at.",
          "If anything feels unsafe, stop immediately. Stopping carries no penalty.",
        ],
      },
      {
        h: "4. Pay",
        ps: [
          "Each request sets its own bounty, shown before you claim.",
          "Anyone whose photo and answer pass every check is paid, whether or not their answer is in the majority. Submissions that fail a check are not paid.",
          "The bounty is sent to the account created at sign-in once the request is final and the payout on Solana has gone through. During the pilot, pay is in test assets and cannot be cashed out.",
        ],
      },
      {
        h: "5. If you disagree with a verdict",
        ps: [
          "The reason a submission failed is shown in the app. If you disagree with it, write to the contact on the operator page.",
        ],
      },
      {
        h: "6. Your photos",
        ps: [
          "You keep the copyright in the photos you take. You allow the operator to use them for verdicts, for showing evidence to the requester, and for investigating fraud and faults.",
          `Photos and the exact position at the time of the shot are deleted after ${RETENTION_DAYS.raw_evidence} days. Hashes derived from photos are kept to detect reuse.`,
        ],
      },
      {
        h: "7. What is not allowed",
        ps: [
          "Faking location or time, reusing old photos or someone else's photos, re-photographing a screen, and coordinating answers with other workers are prohibited. When found, the submission is voided and the account may be suspended.",
        ],
      },
      {
        h: "8. What is public",
        ps: [
          "Your payout address and which requests paid it are visible to anyone on the public blockchain. Because the same address is used repeatedly, requests involving the same person can be linked.",
        ],
      },
      {
        h: "9. Changes to these terms",
        ps: [
          "Changes are announced on this site. For important changes, consent is asked again. If you do not agree, you can stop taking part at any time.",
        ],
      },
      { h: "10. Governing law", ps: ["These terms are interpreted under the laws of Japan."] },
    ],
  },
  "requester-terms": {
    title: "Requester (API) terms",
    version: LEGAL_VERSIONS.requester_terms,
    lead: "The agreement between the operator and anyone who receives an API key and sends requests to ProofMarket from an agent. Reference translation; the Japanese text governs.",
    sections: [
      {
        h: "1. Who is responsible",
        ps: [
          "API keys are issued to the individual or organisation (the principal) responsible for the requests made with them. Requests made by an agent using the key are treated as made by that principal.",
          "Do not share the key. If you think it has leaked, tell the operator at once; the operator will suspend it.",
        ],
      },
      {
        h: "2. What may be asked",
        ps: [
          "Only facts about public places registered by the operator that anyone could learn by standing in front of them. Requests matching the refused categories on the rules page are rejected. Any that slip through may be stopped, and the key suspended.",
        ],
      },
      {
        h: "3. What a result is",
        ps: [
          "A result states how many people checked, which checks passed and how many answers agreed. It does not guarantee that the answer is correct. Decisions based on a result are the requester's responsibility.",
        ],
      },
      {
        h: "4. Cost and limits",
        ps: [
          "A request costs the bounty per person times the number of people asked. During the pilot there is no fee, and balances and bounties use test assets.",
          "Each key has a per-request and a per-day limit. Requests beyond the limits or the balance are refused.",
        ],
      },
      {
        h: "5. Using photos and results",
        ps: [
          `For your own requests, images with embedded data such as the shooting location removed can be fetched through a URL valid for ${evidenceMin} minutes. Do not publish the photos outside the purpose of this service or try to identify people in them.`,
          "The operator may feature the answer, the number of people, the check results and the hashes of a result on a public page. The question and the place are not shown.",
        ],
      },
      {
        h: "6. Suspension",
        ps: [
          "Use that breaches these terms, suspected fraud, or the need to protect the system may lead to a key or request intake being stopped without notice.",
        ],
      },
      { h: "7. Governing law", ps: ["These terms are interpreted under the laws of Japan."] },
    ],
  },
  privacy: {
    title: "Privacy policy",
    version: LEGAL_VERSIONS.privacy_notice,
    lead: "What ProofMarket collects, why, who can see it and how long it is kept. Reference translation; the Japanese text governs.",
    sections: [
      {
        h: "1. Information about workers",
        ps: [
          "The email address (or Google account details) used to sign in and the payout address are kept for sign-in and payments for as long as you take part.",
          "The position used to find requests nearby is rounded to about 100 m on the device before it is sent, used only for sorting, and not stored.",
          `Photos, the exact position at the time of the shot and the data embedded in the photo (EXIF) are stored encrypted for verdicts and for investigating fraud and faults, visible to the operator only, and deleted after ${RETENTION_DAYS.raw_evidence} days.`,
        ],
      },
      {
        h: "2. Information about requesters",
        ps: [
          "A hash of the API key, the contents of requests and balance records are kept to provide the service and for audit. The key itself is not stored.",
        ],
      },
      {
        h: "3. Applications and removal requests",
        ps: [
          "The email address and rough area given in an application are used only to reply, stored encrypted, and deleted after 90 days.",
          "The email address and details given in a photo removal request are used only to handle it and kept for one year as a record of the action taken.",
        ],
      },
      {
        h: "4. What is public",
        ps: [
          "Solana records a hash of the request ID, the escrowed bounty, the result, the evidence and result hashes, the payout address and the amount paid. Blockchain records are visible to anyone and cannot be deleted. Photos, locations, question text, names and contact details are never recorded.",
        ],
      },
      {
        h: "5. Service providers",
        ps: [
          "Privy for sign-in and payout accounts, Supabase (Tokyo region) for the database and photo storage, and Vercel for serving the app. Some of these are based outside Japan, and data may be processed on servers abroad.",
        ],
      },
      {
        h: "6. Contact",
        ps: [
          "To see, correct or delete your information, write to the contact on the operator page. What has been recorded on the blockchain cannot be deleted by design.",
        ],
      },
    ],
  },
};

export const legalDocs = (lang: Lang) => (lang === "en" ? LEGAL_DOCS_EN : LEGAL_DOCS);
