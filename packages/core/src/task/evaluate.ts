// Pure evaluation of the transition table (03 §2.2, §5).
import type { TaskStatus } from "../domain/enums.ts";
import type { GuardName, TaskEvent, TransitionContext, TransitionResult } from "./transitions.ts";
import { TRANSITIONS } from "./transitions.ts";

export function openSlots(
  ctx: Pick<TransitionContext, "requiredWitnesses" | "validCount" | "activeClaimCount">,
): number {
  return Math.max(0, ctx.requiredWitnesses - ctx.validCount - ctx.activeClaimCount);
}

/** Unique top answer with count >= quorum (07 §4). */
export function consensusHolds(answerCounts: Readonly<Record<string, number>>, quorum: number): boolean {
  const counts = Object.values(answerCounts);
  if (counts.length === 0) return false;
  const max = Math.max(...counts);
  return max >= quorum && counts.filter((c) => c === max).length === 1;
}

const GUARD_FNS: Record<GuardName, (c: TransitionContext) => boolean> = {
  fundingFinalized: (c) => c.chain.fundingFinalized === true,
  deadlineInFuture: (c) => c.now.getTime() < c.deadline.getTime(),
  slotOpenAndClaimsEnabled: (c) => c.flags.claimsEnabled && openSlots(c) > 0 && c.now < c.deadline,
  claimActiveBeforeDeadline: (c) => c.now.getTime() < c.deadline.getTime(),
  validEqualsRequired: (c) => c.validCount === c.requiredWitnesses,
  validAtLeastQuorum: (c) => c.now >= c.deadline && c.validCount >= c.quorum,
  validBetweenOneAndQuorum: (c) => c.now >= c.deadline && c.validCount >= 1 && c.validCount < c.quorum,
  validZero: (c) => c.now >= c.deadline && c.validCount === 0,
  consensusReached: (c) => consensusHolds(c.answerCounts, c.quorum),
  consensusNotReached: (c) => !consensusHolds(c.answerCounts, c.quorum),
  settleFinalized: (c) => c.chain.settleFinalized === true,
  settleFinalizedWithValid: (c) => c.chain.settleFinalized === true && c.validCount >= 1,
  fundingTxNotSent: (c) => !c.funding.txSent,
  noActiveClaimNoValid: (c) => c.activeClaimCount === 0 && c.validCount === 0,
  fundingUnrecoverable: (c) =>
    (c.funding.retryLimitReached || c.now >= c.deadline) &&
    c.chain.taskPdaExists === false &&
    c.funding.allBlockhashesExpired,
  refundFinalized: (c) => c.chain.refundFinalized === true,
  challengeOverturned: (c) => c.challengeOverturned === true,
};

/** Find the rule for (status, event) whose guard holds. Never throws; callers map failures to API errors. */
export function transition(status: TaskStatus, event: TaskEvent, ctx: TransitionContext): TransitionResult {
  const candidates = TRANSITIONS.filter((r) => r.event === event && r.from.includes(status));
  if (candidates.length === 0) return { ok: false, reason: "NO_RULE", candidates: [] };
  const rule = candidates.find((r) => GUARD_FNS[r.guard](ctx));
  if (!rule) return { ok: false, reason: "GUARD_FAILED", candidates: candidates.map((r) => r.id) };
  return { ok: true, rule, next: rule.to === "same" ? status : rule.to };
}
