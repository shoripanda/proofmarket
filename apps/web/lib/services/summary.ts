// A one-paragraph, human-readable account of where a verification stands (01 §4.27). The agent that asked is
// expected to repeat it to the person it is working for, so the verdict reaches them without being asked for.
// Pure: built from the GET view alone, in both languages, so a test can pin every wording.
import type { GetVerificationResponse } from "@proofmarket/core/schemas/api";

type View = Omit<GetVerificationResponse, "summary">;
export type Summary = { ja: string; en: string };

const jst = (iso: string) =>
  new Date(iso).toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" });

/** The answer as a person would read it: a choice or number as is, a text or form shortened to one line. */
function shownAnswer(v: View): string | null {
  const r = v.result;
  if (!r) return null;
  if (v.answer_schema.type === "text" || v.answer_schema.type === "form") {
    const first = r.answers?.[0];
    if (first === undefined || first === null) return null;
    const s = typeof first === "string" ? first : JSON.stringify(first);
    return s.length > 80 ? `${s.slice(0, 79)}…` : s;
  }
  return r.answer === null || r.answer === undefined ? null : String(r.answer);
}

function reviewLine(v: View): { ja: string; en: string } | null {
  const reviews = v.result?.reviews;
  if (!reviews || reviews.length === 0) return null;
  const pass = reviews.filter((r) => r.verdict === "pass").length;
  const unsure = reviews.filter((r) => r.verdict === "uncertain");
  const why = unsure[0]?.reason ? `（${unsure[0].reason}）` : "";
  const whyEn = unsure[0]?.reason ? ` (${unsure[0].reason})` : "";
  if (unsure.length === 0) {
    return {
      ja: `AI の照合は ${pass} 件とも合格。`,
      en: `The AI review passed ${pass === 1 ? "the submission" : `all ${pass}`}.`,
    };
  }
  return {
    ja: `AI の照合: 合格 ${pass} 件、判断できず ${unsure.length} 件${why}。`,
    en: `AI review: ${pass} passed, ${unsure.length} uncertain${whyEn}.`,
  };
}

export function summarize(v: View): Summary {
  const p = v.witness_progress;
  const r = v.result;
  const q = v.assurance.quorum;
  const n = v.assurance.required_witnesses;

  // Final outcomes first: the result row says more than the task status.
  if (r && !r.provisional) {
    const ans = shownAnswer(v);
    const paid = r.settlement.status === "SETTLED";
    if (r.status === "VERIFIED") {
      const rev = reviewLine(v);
      return {
        ja:
          `確定しました。答え: ${ans ?? "（本文を参照）"}。${r.witnesses.valid} 人が確かめ、` +
          `${q > 1 ? `${q} 人以上の一致で確定` : "1 人の確認で確定"}。` +
          (rev ? rev.ja : "") +
          (paid ? "報酬は支払い済み。" : "報酬の支払いを進めています。") +
          (r.proof ? `証明: ${r.proof.url}` : ""),
        en:
          `Final: ${ans ?? "(see the body)"}. ${r.witnesses.valid} ${r.witnesses.valid === 1 ? "person" : "people"} checked` +
          `${q > 1 ? `, ${q} agreeing` : ""}. ` +
          (rev ? `${rev.en} ` : "") +
          (paid ? "Workers have been paid. " : "Payout in progress. ") +
          (r.proof ? `Proof: ${r.proof.url}` : ""),
      };
    }
    if (r.status === "REJECTED") {
      const counts = Object.entries(r.answer_counts)
        .map(([k, c]) => `${k} ${c}`)
        .join(" / ");
      const why: Record<string, { ja: string; en: string }> = {
        NO_CONSENSUS: {
          ja: `答えが割れたため確定できませんでした（${counts}）。`,
          en: `The answers did not agree (${counts}), so nothing is final.`,
        },
        INSUFFICIENT_WITNESSES: {
          ja: "有効な証言が足りず、確定できませんでした。",
          en: "Not enough valid submissions came in, so nothing is final.",
        },
        CHALLENGED: {
          ja: "異議の再確認で仮の答えが覆り、却下になりました。",
          en: "A challenge recheck contradicted the provisional answer, so it was rejected.",
        },
      };
      const w = (r.reason && why[r.reason]) || {
        ja: "確定できませんでした。",
        en: "Nothing is final.",
      };
      return {
        ja: `${w.ja}有効な答えを出した人には報酬を払い、残りは残高に戻ります。`,
        en: `${w.en} People who gave a valid answer are paid; the rest returns to your balance.`,
      };
    }
    if (r.status === "EXPIRED") {
      return {
        ja: `締め切り（${jst(v.deadline)} JST）までに確定しませんでした。${r.witnesses.valid > 0 ? `${r.witnesses.valid} 人分の有効な答えはあり、その人には報酬を払います。` : ""}残りは残高に戻ります。`,
        en: `Not final by the deadline (${jst(v.deadline)} JST). ${r.witnesses.valid > 0 ? `${r.witnesses.valid} valid answer(s) were paid. ` : ""}The rest returns to your balance.`,
      };
    }
  }

  if (r?.provisional) {
    const ans = shownAnswer(v);
    const until = r.challenge ? jst(r.challenge.until) : null;
    const state = r.challenge?.state;
    if (state === "challenged") {
      return {
        ja: `仮の答え「${ans}」に異議が出て、2 人が確かめ直しています。結果が出るまでお待ちください。`,
        en: `The provisional answer "${ans}" was challenged; two people are rechecking. Wait for the outcome.`,
      };
    }
    return {
      ja: `仮の答え: ${ans}（1 人が確認）。${until ? `${until} JST まで` : "異議期間のあいだ"}異議がなければ、そのまま確定します。`,
      en: `Provisional answer: ${ans} (one person checked). It becomes final if nobody challenges it${until ? ` by ${until} JST` : ""}.`,
    };
  }

  switch (v.status) {
    case "CANCELLED":
    case "REFUNDED":
      return {
        ja: "取り消し済みです。拘束した額は残高に戻ります。",
        en: "Cancelled. The reserved amount returns to your balance.",
      };
    case "EXPIRED":
      return {
        ja: `締め切り（${jst(v.deadline)} JST）を過ぎ、確定しませんでした。`,
        en: `The deadline (${jst(v.deadline)} JST) passed without a final answer.`,
      };
    case "SUBMITTED":
    case "VERIFYING": {
      const parts: string[] = [];
      const partsEn: string[] = [];
      if (p.checking > 0) {
        parts.push(`AI が写真と答えを確かめている提出が ${p.checking} 件`);
        partsEn.push(`${p.checking} submission${p.checking === 1 ? "" : "s"} under AI review`);
      }
      if (p.returned > 0) {
        parts.push(`依頼と合わず差し戻した提出が ${p.returned} 件（worker が直せます）`);
        partsEn.push(`${p.returned} sent back for not matching the request (the worker can fix it)`);
      }
      return {
        ja: `人の答えが届き始めました。有効な答え ${p.valid} / ${n} 人${parts.length ? `、${parts.join("、")}` : ""}。${q > 1 ? `${q} 人の答えがそろうと確定します。` : "確認が済むと確定します。"}`,
        en: `Answers are coming in: ${p.valid} of ${n} valid${partsEn.length ? `; ${partsEn.join("; ")}` : ""}. ${q > 1 ? `Final once ${q} agree.` : "Final once the check passes."}`,
      };
    }
    case "CLAIMED":
      return {
        ja: `${p.active_claims} 人が引き受けて向かっています。締め切りは ${jst(v.deadline)} JST。`,
        en: `${p.active_claims} ${p.active_claims === 1 ? "person has" : "people have"} taken it and ${p.active_claims === 1 ? "is" : "are"} on the way. Deadline ${jst(v.deadline)} JST.`,
      };
    default:
      return {
        ja: `まだ引き受け手を待っています（${n} 人募集、締め切り ${jst(v.deadline)} JST）。人が動くので数分から数十分かかります。`,
        en: `Waiting for someone to take it (${n} needed, deadline ${jst(v.deadline)} JST). A person has to go, so expect minutes to an hour.`,
      };
  }
}
