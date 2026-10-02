// Task lifecycle transition table (03-state-machine.md §2.2). This file is DATA + signatures only.
// Every (status, event) pair not listed here must be rejected (REQ-S-001). U-SM-ALL enumerates all pairs.

import type { TaskStatus, WebhookEvent } from "../domain/enums.ts";

export const TASK_EVENTS = [
  "FUNDING_CONFIRMED",
  "OPEN",
  "CLAIM_CREATED",
  "SUBMISSION_RECEIVED",
  "QUORUM_READY",
  "DEADLINE_REACHED",
  "CONSENSUS_REACHED",
  "CONSENSUS_FAILED",
  "SETTLEMENT_CONFIRMED",
  "CANCEL_REQUESTED",
  "FUNDING_FAILED",
  "REFUND_CONFIRMED",
] as const;
export type TaskEvent = (typeof TASK_EVENTS)[number];

/** Named guards. Each is evaluated against TransitionContext by the implementation (PR-03). */
export const GUARDS = {
  fundingFinalized: "initialize_task is finalized on-chain",
  deadlineInFuture: "deadline > now()",
  slotOpenAndClaimsEnabled: "open_slots > 0 and platform flag claims_enabled",
  claimActiveBeforeDeadline: "the claim is ACTIVE and now() < deadline",
  validEqualsRequired: "valid submissions = required_witnesses",
  validAtLeastQuorum: "valid submissions >= quorum",
  validBetweenOneAndQuorum: "1 <= valid submissions < quorum",
  validZero: "valid submissions = 0",
  consensusReached: "top answer count >= quorum and the top answer is unique",
  consensusNotReached: "negation of consensusReached",
  settleFinalized: "settle is finalized on-chain",
  settleFinalizedWithValid: "settle is finalized on-chain and valid submissions >= 1",
  fundingTxNotSent: "the initialize_task transaction has not been sent",
  noActiveClaimNoValid: "ACTIVE claims = 0 and valid submissions = 0",
  fundingUnrecoverable:
    "(retry limit reached or deadline passed) and Task PDA absent on-chain and every sent signature's blockhash expired",
  refundFinalized: "refund is finalized on-chain",
} as const;
export type GuardName = keyof typeof GUARDS;

/** Side effects the service layer must apply in the same DB transaction (03 §5). */
export type Effect =
  | { kind: "setFundingStatus"; value: "CONFIRMED" | "ABANDONED" }
  | { kind: "setSettlementStatus"; value: "PENDING" | "CONFIRMED" }
  | { kind: "createClaim" }
  | { kind: "expireActiveClaims" }
  | { kind: "runConsensus" }
  | { kind: "saveResult"; outcome: "VERIFIED" | "REJECTED" | "EXPIRED" }
  | { kind: "enqueue"; job: "FUND_TASK" | "FINALIZE_AND_SETTLE" | "REFUND_TASK" }
  | { kind: "cancelJob"; job: "FUND_TASK" }
  | { kind: "ledger"; entry: "RELEASE" | "REFUND" }
  | { kind: "webhook"; event: WebhookEvent }
  | { kind: "setReason"; value: "FUNDING_FAILED" };

export interface TransitionRule {
  id: `T${string}`;
  from: readonly TaskStatus[];
  event: TaskEvent;
  guard: GuardName;
  /** "same" = status does not change (T04, T06, T18). */
  to: TaskStatus | "same";
  effects: readonly Effect[];
}

export const TRANSITIONS: readonly TransitionRule[] = [
  {
    id: "T01",
    from: ["CREATED"],
    event: "FUNDING_CONFIRMED",
    guard: "fundingFinalized",
    to: "FUNDED",
    effects: [{ kind: "setFundingStatus", value: "CONFIRMED" }],
  },
  {
    id: "T02",
    from: ["FUNDED"],
    event: "OPEN",
    guard: "deadlineInFuture",
    to: "OPEN",
    effects: [{ kind: "webhook", event: "verification.open" }],
  },
  {
    id: "T03",
    from: ["OPEN"],
    event: "CLAIM_CREATED",
    guard: "slotOpenAndClaimsEnabled",
    to: "CLAIMED",
    effects: [{ kind: "createClaim" }, { kind: "webhook", event: "verification.claimed" }],
  },
  {
    id: "T04",
    from: ["CLAIMED", "SUBMITTED"],
    event: "CLAIM_CREATED",
    guard: "slotOpenAndClaimsEnabled",
    to: "same",
    effects: [{ kind: "createClaim" }],
  },
  {
    id: "T05",
    from: ["CLAIMED"],
    event: "SUBMISSION_RECEIVED",
    guard: "claimActiveBeforeDeadline",
    to: "SUBMITTED",
    effects: [{ kind: "webhook", event: "verification.submitted" }],
  },
  {
    id: "T06",
    from: ["SUBMITTED"],
    event: "SUBMISSION_RECEIVED",
    guard: "claimActiveBeforeDeadline",
    to: "same",
    effects: [],
  },
  {
    id: "T07",
    from: ["SUBMITTED"],
    event: "QUORUM_READY",
    guard: "validEqualsRequired",
    to: "VERIFYING",
    effects: [{ kind: "runConsensus" }],
  },
  {
    id: "T08",
    from: ["OPEN", "CLAIMED", "SUBMITTED"],
    event: "DEADLINE_REACHED",
    guard: "validAtLeastQuorum",
    to: "VERIFYING",
    effects: [{ kind: "expireActiveClaims" }, { kind: "runConsensus" }],
  },
  {
    id: "T09",
    from: ["VERIFYING"],
    event: "CONSENSUS_REACHED",
    guard: "consensusReached",
    to: "VERIFIED",
    effects: [
      { kind: "saveResult", outcome: "VERIFIED" },
      { kind: "setSettlementStatus", value: "PENDING" },
      { kind: "enqueue", job: "FINALIZE_AND_SETTLE" },
      { kind: "webhook", event: "verification.verified" },
    ],
  },
  {
    id: "T10",
    from: ["VERIFYING"],
    event: "CONSENSUS_FAILED",
    guard: "consensusNotReached",
    to: "REJECTED",
    effects: [
      { kind: "saveResult", outcome: "REJECTED" },
      { kind: "setSettlementStatus", value: "PENDING" },
      { kind: "enqueue", job: "FINALIZE_AND_SETTLE" },
      { kind: "webhook", event: "verification.rejected" },
    ],
  },
  {
    id: "T11",
    from: ["OPEN", "CLAIMED", "SUBMITTED"],
    event: "DEADLINE_REACHED",
    guard: "validBetweenOneAndQuorum",
    to: "EXPIRED",
    effects: [
      { kind: "saveResult", outcome: "EXPIRED" },
      { kind: "expireActiveClaims" },
      { kind: "setSettlementStatus", value: "PENDING" },
      { kind: "enqueue", job: "FINALIZE_AND_SETTLE" },
      { kind: "webhook", event: "verification.expired" },
    ],
  },
  {
    id: "T12",
    from: ["FUNDED", "OPEN", "CLAIMED", "SUBMITTED"],
    event: "DEADLINE_REACHED",
    guard: "validZero",
    to: "EXPIRED",
    effects: [
      { kind: "saveResult", outcome: "EXPIRED" },
      { kind: "expireActiveClaims" },
      { kind: "setSettlementStatus", value: "PENDING" },
      { kind: "enqueue", job: "REFUND_TASK" },
      { kind: "webhook", event: "verification.expired" },
    ],
  },
  {
    id: "T13",
    from: ["VERIFIED"],
    event: "SETTLEMENT_CONFIRMED",
    guard: "settleFinalized",
    to: "SETTLED",
    effects: [
      { kind: "ledger", entry: "RELEASE" }, // remainder when valid < required_witnesses (T08 path); skipped if 0
      { kind: "setSettlementStatus", value: "CONFIRMED" },
      { kind: "webhook", event: "verification.settled" },
    ],
  },
  {
    id: "T14",
    from: ["CREATED"],
    event: "CANCEL_REQUESTED",
    guard: "fundingTxNotSent",
    to: "CANCELLED",
    effects: [
      { kind: "ledger", entry: "RELEASE" },
      { kind: "cancelJob", job: "FUND_TASK" },
      { kind: "setFundingStatus", value: "ABANDONED" },
      { kind: "webhook", event: "verification.cancelled" },
    ],
  },
  {
    id: "T15",
    from: ["OPEN", "CLAIMED", "SUBMITTED"],
    event: "CANCEL_REQUESTED",
    guard: "noActiveClaimNoValid",
    to: "CANCELLED",
    effects: [
      { kind: "setSettlementStatus", value: "PENDING" },
      { kind: "enqueue", job: "REFUND_TASK" },
      { kind: "webhook", event: "verification.cancelled" },
    ],
  },
  {
    id: "T16",
    from: ["CREATED"],
    event: "FUNDING_FAILED",
    guard: "fundingUnrecoverable",
    to: "CANCELLED",
    effects: [
      { kind: "ledger", entry: "RELEASE" },
      { kind: "setFundingStatus", value: "ABANDONED" },
      { kind: "setReason", value: "FUNDING_FAILED" },
      { kind: "webhook", event: "verification.cancelled" },
    ],
  },
  {
    id: "T17",
    from: ["CANCELLED", "EXPIRED"],
    event: "REFUND_CONFIRMED",
    guard: "refundFinalized",
    to: "REFUNDED",
    effects: [
      { kind: "ledger", entry: "REFUND" },
      { kind: "setSettlementStatus", value: "CONFIRMED" },
    ],
  },
  {
    id: "T18",
    from: ["REJECTED", "EXPIRED"],
    event: "SETTLEMENT_CONFIRMED",
    guard: "settleFinalizedWithValid",
    to: "same",
    effects: [
      { kind: "ledger", entry: "RELEASE" },
      { kind: "setSettlementStatus", value: "CONFIRMED" },
    ],
  },
];

/** Facts the guards need. Loaded under `SELECT ... FOR UPDATE` on the task row (02 §4.2). */
export interface TransitionContext {
  now: Date;
  deadline: Date;
  requiredWitnesses: number;
  quorum: number;
  validCount: number;
  activeClaimCount: number;
  answerCounts: Readonly<Record<string, number>>;
  flags: { claimsEnabled: boolean };
  chain: {
    fundingFinalized?: boolean;
    settleFinalized?: boolean;
    refundFinalized?: boolean;
    taskPdaExists?: boolean;
  };
  funding: { txSent: boolean; retryLimitReached: boolean; allBlockhashesExpired: boolean };
}

export type TransitionResult =
  | { ok: true; rule: TransitionRule; next: TaskStatus }
  | { ok: false; reason: "NO_RULE" | "GUARD_FAILED"; candidates: readonly TransitionRule["id"][] };

export { openSlots, transition } from "./evaluate.ts";
