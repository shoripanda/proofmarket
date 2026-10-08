// S-08 依頼と撮影の決まり — what may be asked, what is refused (core policy rules), photo rules, and removal requests.
import { type PolicyRuleId, TASK_TYPE_ANSWERS, TASK_TYPE_SPECS, type TaskType } from "@proofmarket/core";
import type { Metadata } from "next";
import { RemovalForm } from "@/components/removal-form";
import { safetyNotes } from "@/components/safety";
import { PageHero, Section } from "@/components/site";
import { answerLabel, taskTypeText } from "@/lib/answers";
import { type Lang, pick } from "@/lib/lang";
import { getLang } from "@/lib/lang-server";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: pick(
      await getLang(),
      "依頼と撮影の決まり | ProofMarket",
      "Rules for requests and photos | ProofMarket",
    ),
  };
}

/** Labels for POLICY_RULES (packages/core/src/policy/rules.ts). Keep in step when rules change. */
const REFUSED: Record<Lang, Record<Exclude<PolicyRuleId, "TYPE_ALLOWLIST">, string>> = {
  ja: {
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
  },
  en: {
    PERSON_TRACKING: "Following, locating or identifying a particular person",
    PRIVATE_RESIDENCE: "Visiting someone's home or private room",
    TRESPASS: "Entering restricted areas or private property",
    WEAPONS_DRUGS: "Anything involving weapons, drugs or controlled goods",
    SEXUAL: "Sexual services or content",
    PROFESSIONAL_JUDGMENT: "Medical, legal or financial professional judgement",
    HARASSMENT: "Anything that could amount to harassment or threats",
    DANGER: "Dangerous actions",
    EVASION: "Helping evade police investigations or entry restrictions",
    MINORS: "Anything involving children",
    COVERT_RECORDING: "Covert recording",
    IMPERSONATION: "Impersonating someone",
  },
};

export default async function RulesPage() {
  const lang = await getLang();
  const types = taskTypeText(lang);
  return (
    <>
      <PageHero
        eyebrow={pick(lang, "依頼と撮影の決まり", "Rules for requests and photos")}
        title={pick(
          lang,
          "確かめてよいのは、誰でも見られる店の様子だけです",
          "Only what anyone could see from the street",
        )}
      >
        <p>
          {pick(
            lang,
            "ProofMarket が受ける依頼は、公開されている店の前に立てば誰にでも分かることに限ります。人を調べる依頼や、立ち入りが要る依頼は受けません。",
            "ProofMarket accepts only requests about things anyone could learn by standing in front of a public place. Requests that investigate people or require entering premises are refused.",
          )}
        </p>
      </PageHero>

      <Section
        title={pick(lang, "受けられる依頼", "What can be asked")}
        lead={pick(
          lang,
          "現地で見て確かめる依頼と、本や紙の資料・実物・電話など、人の手が要る作業の依頼があります。選んで答える依頼には「分からない」という答えがあり、無理に決めなくて構いません。",
          "Some requests are checked on the spot; others need a person's hands: books and paper documents, physical items, phone calls. Multiple-choice requests always include “can't tell”, so nobody has to force an answer.",
        )}
      >
        <dl className="divide-y divide-slate-200 rounded-2xl border border-slate-200 text-sm">
          {(Object.keys(types) as TaskType[]).map((t) => (
            <div key={t} className="grid gap-1 p-4 sm:grid-cols-[12rem_1fr]">
              <dt className="font-semibold">{types[t].name}</dt>
              <dd className="leading-relaxed text-slate-600">
                {types[t].howTo} {pick(lang, "答え: ", "Answer: ")}
                {TASK_TYPE_SPECS[t].answer === "number"
                  ? pick(lang, "数字", "a number")
                  : TASK_TYPE_SPECS[t].answer === "text"
                    ? pick(lang, "文章", "text")
                    : (TASK_TYPE_ANSWERS[t]?.map((v) => answerLabel(lang, v)).join(pick(lang, "・", " / ")) ??
                      pick(lang, "依頼者が決めた選択肢", "choices set by the requester"))}
              </dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section
        title={pick(lang, "受けない依頼", "What is refused")}
        lead={pick(
          lang,
          "依頼の文に次のような内容が含まれていると、作成の時点で断ります。言葉による自動の判定なので、すり抜けたものは運営者が見つけしだい止めます。",
          "A request whose text contains any of the following is refused when it is created. The check is automatic and text-based; anything that slips through is stopped by the operator as soon as it is found.",
        )}
      >
        <ul className="grid gap-2 sm:grid-cols-2">
          {Object.entries(REFUSED[lang]).map(([id, label]) => (
            <li key={id} className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-700">
              {label}
            </li>
          ))}
        </ul>
      </Section>

      <Section
        title={pick(lang, "撮影の決まり", "Photo rules")}
        lead={pick(
          lang,
          "worker は登録のときと、依頼を引き受ける前の画面でこの決まりを読みます。撮影画面にも要点を出しています。",
          "Workers read these rules when they register and again before claiming a request. The capture screen repeats the essentials.",
        )}
      >
        <ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed text-slate-700">
          {safetyNotes(lang).map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ul>
      </Section>

      <Section
        id="removal"
        title={pick(lang, "写真の削除を求める", "Ask for a photo to be removed")}
        lead={pick(
          lang,
          "店舗の方や、写真に写り込んだ方からの削除・公開停止の依頼を受け付けます。依頼した側から写真を見られないようにしたうえで、必要なら写真そのものを消します。",
          "Shop owners and people who appear in a photo can ask for it to be removed or taken out of circulation. Access by the requester is cut first; the photo itself is deleted where needed.",
        )}
      >
        <RemovalForm />
      </Section>
    </>
  );
}
