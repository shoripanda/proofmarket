// S-08 依頼と撮影の決まり — what may be asked, what is refused (core policy rules), photo rules, and removal requests.
import type { PolicyRuleId } from "@proofmarket/core";
import type { Metadata } from "next";
import { RemovalForm } from "@/components/removal-form";
import { SAFETY_NOTES } from "@/components/safety";
import { PageHero, Section } from "@/components/site";

export const metadata: Metadata = { title: "依頼と撮影の決まり | ProofMarket" };

/** Japanese labels for POLICY_RULES (packages/core/src/policy/rules.ts). Keep in step when rules change. */
const REFUSED: Record<Exclude<PolicyRuleId, "TYPE_ALLOWLIST">, string> = {
  PERSON_TRACKING: "特定の人を追う、探す、誰かを確かめる",
  PRIVATE_RESIDENCE: "個人の家や部屋を見に行く",
  TRESPASS: "立入禁止の場所や私有地に入る",
  WEAPONS_DRUGS: "武器、薬物、規制されている物にかかわる",
  SEXUAL: "性的なサービスや内容にかかわる",
  PROFESSIONAL_JUDGMENT: "医療・法律・金融の専門的な判断を求める",
  HARASSMENT: "嫌がらせや脅しにつながる",
  DANGER: "危険な行動を求める",
  EVASION: "警察の捜査や入場の制限を逃れる手伝いをする",
  MINORS: "子どもにかかわる",
  COVERT_RECORDING: "隠し撮りをする",
  IMPERSONATION: "誰かのふりをする",
};

export default function RulesPage() {
  return (
    <>
      <PageHero eyebrow="依頼と撮影の決まり" title="確かめてよいのは、誰でも見られる店の様子だけです">
        <p>
          ProofMarket
          が受ける依頼は、公開されている店の前に立てば誰にでも分かることに限ります。人を調べる依頼や、立ち入りが要る依頼は受けません。
        </p>
      </PageHero>

      <Section
        title="受けられる依頼"
        lead="試験運用中は、運営者が登録した店舗について「いま営業しているか」を確かめる依頼だけを受けます。答えは「営業中」「閉まっている」「わからない」のどれかです。"
      />

      <Section
        title="受けない依頼"
        lead="依頼の文に次のような内容が含まれていると、作成の時点で断ります。言葉による自動の判定なので、すり抜けたものは運営者が見つけしだい止めます。"
      >
        <ul className="grid gap-2 sm:grid-cols-2">
          {Object.entries(REFUSED).map(([id, label]) => (
            <li key={id} className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
              {label}
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title="撮影の決まり"
        lead="worker は登録のときと、依頼を引き受ける前の画面でこの決まりを読みます。撮影画面にも要点を出しています。"
      >
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-slate-700">
          {SAFETY_NOTES.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </Section>

      <Section
        id="removal"
        title="写真の削除を求める"
        lead="店舗の方や、写真に写り込んだ方からの削除・公開停止の依頼を受け付けます。依頼した側から写真を見られないようにしたうえで、必要なら写真そのものを消します。"
      >
        <RemovalForm />
      </Section>
    </>
  );
}
