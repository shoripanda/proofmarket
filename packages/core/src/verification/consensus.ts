// Consensus (07 §4, 01 §4.3). Called at T07 / T08 / T11 / T12.

export type ConsensusOutcome =
  | { kind: "VERIFIED"; answer: string; answerCounts: Record<string, number> }
  | { kind: "REJECTED"; reason: "NO_CONSENSUS"; answerCounts: Record<string, number> }
  | { kind: "EXPIRED"; reason: "INSUFFICIENT_WITNESSES"; answerCounts: Record<string, number> };

/**
 * valid < quorum -> EXPIRED; unique top answer with count >= quorum -> VERIFIED; else REJECTED.
 * UNCLEAR counts like any other answer. No early finalization in MVP.
 */
export function decide(_valid: readonly { answer: string }[], _quorum: number): ConsensusOutcome {
  throw new Error("NOT_IMPLEMENTED: decide (PR-08)");
}

/** consensus_ratio = top count / valid count. API-only; excluded from result_hash (07 §5.2). */
export function consensusRatio(_answerCounts: Readonly<Record<string, number>>): number | null {
  throw new Error("NOT_IMPLEMENTED: consensusRatio (PR-08)");
}
