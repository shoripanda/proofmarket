// Plain-language wording for the public result page and its badge (01 §4.21). No server-only imports: the
// badge route and the page both use it. Every function takes the language; the default keeps old callers Japanese.
import type { AnswerKind, TaskType } from "@proofmarket/core";
import { answerLabel, taskTypeText } from "./answers";
import { dateLocale, type Lang, pick } from "./lang";

export interface ProofFacts {
  status: "VERIFIED" | "REJECTED" | "EXPIRED";
  reason: "NO_CONSENSUS" | "INSUFFICIENT_WITNESSES" | null;
  type: TaskType;
  answer_kind: AnswerKind;
  answer: string | null;
  verified_at: string;
  /** 13 §5: what the agent asked a person to confirm it did; the headline names it. */
  agent_attestation?: { description: string } | null;
}

const jst = (iso: string, lang: Lang, opts: Intl.DateTimeFormatOptions) =>
  new Date(iso).toLocaleString(dateLocale(lang), { timeZone: "Asia/Tokyo", ...opts });

/** 2026年10月5日 14:02 / 5 October 2026, 14:02 */
export const proofTimeLong = (iso: string, lang: Lang = "ja") =>
  jst(iso, lang, { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });

/** 10/5 14:02 / 5 Oct 14:02 */
export const proofTimeShort = (iso: string, lang: Lang = "ja") =>
  lang === "en"
    ? jst(iso, lang, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
    : jst(iso, lang, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

/** たった今 / 12分前 / 3時間前 / 2日前 — just now / 12 min ago / 3 h ago / 2 days ago */
export function ago(iso: string, now: Date, lang: Lang = "ja"): string {
  const min = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (lang === "en") {
    if (min < 1) return "just now";
    if (min < 60) return `${min} min ago`;
    if (min < 60 * 24) return `${Math.floor(min / 60)} h ago`;
    const d = Math.floor(min / (60 * 24));
    return `${d} day${d === 1 ? "" : "s"} ago`;
  }
  if (min < 1) return "たった今";
  if (min < 60) return `${min}分前`;
  if (min < 60 * 24) return `${Math.floor(min / 60)}時間前`;
  return `${Math.floor(min / (60 * 24))}日前`;
}

export const proofTypeName = (type: TaskType, lang: Lang = "ja") => taskTypeText(lang)[type]?.name ?? type;

/** The answer as a reader sees it. Text answers stay with the requester, so only their existence is shown. */
export function proofAnswer(f: Pick<ProofFacts, "answer" | "answer_kind">, lang: Lang = "ja"): string | null {
  if (f.answer === null) return null;
  if (f.answer_kind === "text")
    return pick(
      lang,
      "文章の答え（内容は依頼者だけが見られます）",
      "Text answer (visible to the requester only)",
    );
  return answerLabel(lang, f.answer);
}

export function proofHeadline(
  f: Pick<ProofFacts, "status" | "reason" | "agent_attestation">,
  lang: Lang = "ja",
): string {
  const did = f.agent_attestation?.description;
  if (f.status === "VERIFIED" && did)
    return pick(lang, `『${did}』が本当だと、人が確かめました`, `A person confirmed: “${did}”`);
  if (f.status === "VERIFIED") return pick(lang, "人が確かめました", "Verified by a person");
  if (f.status === "EXPIRED")
    return pick(lang, "期限までに確かめられませんでした", "Not verified before the deadline");
  return f.reason === "NO_CONSENSUS"
    ? pick(lang, "答えが分かれ、確かめられませんでした", "Answers disagreed; not verified")
    : pick(lang, "確かめられませんでした", "Not verified");
}

/** Right half of the badge: what was found and when, in one short line. */
export function badgeMessage(
  f: ProofFacts | null,
  lang: Lang = "ja",
): { label: string; message: string; ok: boolean } {
  if (!f) return { label: "ProofMarket", message: pick(lang, "確認中", "pending"), ok: false };
  if (f.status !== "VERIFIED")
    return { label: "ProofMarket", message: pick(lang, "確認できず", "not verified"), ok: false };
  const a =
    f.answer_kind === "text"
      ? pick(lang, "回答あり", "answered")
      : (proofAnswer(f, lang) ?? pick(lang, "確認済み", "verified"));
  return {
    label: pick(lang, "人が確認", "Human-verified"),
    message: `${a}${pick(lang, "・", " · ")}${proofTimeShort(f.verified_at, lang)}`,
    ok: true,
  };
}
