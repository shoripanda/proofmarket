// Consensus (07 §4, 01 §4.3). Called at T07 / T08 / T11 / T12.

export type ConsensusOutcome =
  | { kind: "VERIFIED"; answer: string; answerCounts: Record<string, number> }
  | { kind: "REJECTED"; reason: "NO_CONSENSUS"; answerCounts: Record<string, number> }
  | { kind: "EXPIRED"; reason: "INSUFFICIENT_WITNESSES"; answerCounts: Record<string, number> };

export function countAnswers(valid: readonly { answer: string }[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const v of valid) counts[v.answer] = (counts[v.answer] ?? 0) + 1;
  return counts;
}

/**
 * valid < quorum -> EXPIRED; unique top answer with count >= quorum -> VERIFIED; else REJECTED.
 * UNCLEAR counts like any other answer. No early finalization in MVP.
 */
export function decide(valid: readonly { answer: string }[], quorum: number): ConsensusOutcome {
  const answerCounts = countAnswers(valid);
  if (valid.length < quorum) return { kind: "EXPIRED", reason: "INSUFFICIENT_WITNESSES", answerCounts };
  const max = Math.max(...Object.values(answerCounts));
  const top = Object.keys(answerCounts).filter((a) => answerCounts[a] === max);
  const [answer] = top;
  if (max >= quorum && top.length === 1 && answer !== undefined)
    return { kind: "VERIFIED", answer, answerCounts };
  return { kind: "REJECTED", reason: "NO_CONSENSUS", answerCounts };
}

/**
 * Text answers (01 §4.15): free text rarely matches word for word, so there is no vote. Once `quorum` valid
 * submissions exist the task is VERIFIED; `answer` is the earliest one and every text is returned to the requester.
 * Callers pass submissions oldest first. answerCounts stays empty so no text leaks into counts.
 */
export function decideText(valid: readonly { answer: string }[], quorum: number): ConsensusOutcome {
  const [first] = valid;
  if (valid.length < quorum || first === undefined)
    return { kind: "EXPIRED", reason: "INSUFFICIENT_WITNESSES", answerCounts: {} };
  return { kind: "VERIFIED", answer: first.answer, answerCounts: {} };
}

/** consensus_ratio = top count / valid count, rounded to 4 decimals. API-only; excluded from result_hash (07 §5.2). */
export function consensusRatio(answerCounts: Readonly<Record<string, number>>): number | null {
  const counts = Object.values(answerCounts);
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return null;
  return Math.round((Math.max(...counts) / total) * 10_000) / 10_000;
}
