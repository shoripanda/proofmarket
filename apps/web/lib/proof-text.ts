// Plain-language wording for the public result page and its badge (01 §4.21). No server-only imports: the
// badge route and the page both use it.
import type { AnswerKind, TaskType } from "@proofmarket/core";
import { answerJa, TASK_TYPE_JA } from "./answers";

export interface ProofFacts {
  status: "VERIFIED" | "REJECTED" | "EXPIRED";
  reason: "NO_CONSENSUS" | "INSUFFICIENT_WITNESSES" | null;
  type: TaskType;
  answer_kind: AnswerKind;
  answer: string | null;
  verified_at: string;
}

const jst = (iso: string, opts: Intl.DateTimeFormatOptions) =>
  new Date(iso).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo", ...opts });

/** 2026年10月5日 14:02 */
export const proofTimeLong = (iso: string) =>
  jst(iso, { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });

/** 10/5 14:02 */
export const proofTimeShort = (iso: string) =>
  jst(iso, { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" });

/** たった今 / 12分前 / 3時間前 / 2日前 */
export function ago(iso: string, now: Date): string {
  const min = Math.floor((now.getTime() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "たった今";
  if (min < 60) return `${min}分前`;
  if (min < 60 * 24) return `${Math.floor(min / 60)}時間前`;
  return `${Math.floor(min / (60 * 24))}日前`;
}

export const proofTypeName = (type: TaskType) => TASK_TYPE_JA[type]?.name ?? type;

/** The answer as a reader sees it. Text answers stay with the requester, so only their existence is shown. */
export function proofAnswer(f: Pick<ProofFacts, "answer" | "answer_kind">): string | null {
  if (f.answer === null) return null;
  if (f.answer_kind === "text") return "文章の答え（内容は依頼者だけが見られます）";
  return answerJa(f.answer);
}

export function proofHeadline(f: Pick<ProofFacts, "status" | "reason">): string {
  if (f.status === "VERIFIED") return "人が確かめました";
  if (f.status === "EXPIRED") return "期限までに確かめられませんでした";
  return f.reason === "NO_CONSENSUS" ? "答えが分かれ、確かめられませんでした" : "確かめられませんでした";
}

/** Right half of the badge: what was found and when, in one short line. */
export function badgeMessage(f: ProofFacts | null): { label: string; message: string; ok: boolean } {
  if (!f) return { label: "ProofMarket", message: "確認中", ok: false };
  if (f.status !== "VERIFIED") return { label: "ProofMarket", message: "確認できず", ok: false };
  const a = f.answer_kind === "text" ? "回答あり" : (proofAnswer(f) ?? "確認済み");
  return { label: "人が確認", message: `${a}・${proofTimeShort(f.verified_at)}`, ok: true };
}
