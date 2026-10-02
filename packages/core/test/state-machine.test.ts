// 09-test-plan.md §3.1 — U-SM-ALL, U-SM-CAN.
import { describe, expect, it } from "vitest";
import { TASK_STATUSES } from "../src/domain/enums.ts";
import { openSlots, transition } from "../src/task/evaluate.ts";
import { type GuardName, TASK_EVENTS, TRANSITIONS, type TransitionContext } from "../src/task/transitions.ts";

const NOW = new Date("2026-10-09T03:00:00Z");
const before = new Date(NOW.getTime() + 3600_000); // deadline in the future
const past = new Date(NOW.getTime() - 1000); // deadline passed

const base = (o: Partial<TransitionContext> = {}): TransitionContext => ({
  now: NOW,
  deadline: before,
  requiredWitnesses: 2,
  quorum: 2,
  validCount: 0,
  activeClaimCount: 0,
  answerCounts: {},
  flags: { claimsEnabled: true },
  chain: {},
  funding: { txSent: false, retryLimitReached: false, allBlockhashesExpired: false },
  ...o,
});

/** A context under which the named guard holds. */
const CTX_FOR: Record<GuardName, TransitionContext> = {
  fundingFinalized: base({ chain: { fundingFinalized: true } }),
  deadlineInFuture: base(),
  slotOpenAndClaimsEnabled: base(),
  claimActiveBeforeDeadline: base(),
  validEqualsRequired: base({ validCount: 2 }),
  validAtLeastQuorum: base({ deadline: past, validCount: 2 }),
  validBetweenOneAndQuorum: base({ deadline: past, validCount: 1 }),
  validZero: base({ deadline: past }),
  consensusReached: base({ answerCounts: { OPEN: 2 } }),
  consensusNotReached: base({ answerCounts: { OPEN: 1, CLOSED: 1 } }),
  settleFinalized: base({ chain: { settleFinalized: true } }),
  settleFinalizedWithValid: base({ validCount: 1, chain: { settleFinalized: true } }),
  fundingTxNotSent: base(),
  noActiveClaimNoValid: base(),
  fundingUnrecoverable: base({
    deadline: past,
    chain: { taskPdaExists: false },
    funding: { txSent: true, retryLimitReached: true, allBlockhashesExpired: true },
  }),
  refundFinalized: base({ chain: { refundFinalized: true } }),
};

describe("task state machine", () => {
  it("U-SM-ALL: only (status, event) pairs listed in 03 §2.2 can succeed (REQ-S-001, REQ-N-004)", () => {
    const listed = new Set(TRANSITIONS.flatMap((r) => r.from.map((s) => `${s}|${r.event}`)));
    for (const status of TASK_STATUSES) {
      for (const event of TASK_EVENTS) {
        const key = `${status}|${event}`;
        if (!listed.has(key)) {
          for (const ctx of Object.values(CTX_FOR)) {
            expect(transition(status, event, ctx), key).toMatchObject({ ok: false, reason: "NO_RULE" });
          }
        }
      }
    }
    for (const rule of TRANSITIONS) {
      for (const status of rule.from) {
        const r = transition(status, rule.event, CTX_FOR[rule.guard]);
        expect(r, `${rule.id} from ${status}`).toMatchObject({ ok: true, rule: { id: rule.id } });
        if (r.ok) expect(r.next).toBe(rule.to === "same" ? status : rule.to);
      }
    }
  });

  it("U-SM-CAN: cancel is rejected with an ACTIVE claim or a valid submission", () => {
    for (const status of ["OPEN", "CLAIMED", "SUBMITTED"] as const) {
      expect(transition(status, "CANCEL_REQUESTED", base()).ok).toBe(true);
      expect(transition(status, "CANCEL_REQUESTED", base({ activeClaimCount: 1 }))).toMatchObject({
        ok: false,
        reason: "GUARD_FAILED",
      });
      expect(transition(status, "CANCEL_REQUESTED", base({ validCount: 1 }))).toMatchObject({
        ok: false,
        reason: "GUARD_FAILED",
      });
    }
    expect(
      transition(
        "CREATED",
        "CANCEL_REQUESTED",
        base({ funding: { txSent: true, retryLimitReached: false, allBlockhashesExpired: false } }),
      ).ok,
    ).toBe(false);
    expect(transition("VERIFIED", "CANCEL_REQUESTED", base()).ok).toBe(false);
  });

  it("deadline routing: >= quorum -> VERIFYING, 1..quorum-1 -> EXPIRED(settle), 0 -> EXPIRED(refund)", () => {
    const at = (validCount: number) =>
      transition("SUBMITTED", "DEADLINE_REACHED", base({ deadline: past, validCount }));
    expect(at(2)).toMatchObject({ ok: true, rule: { id: "T08" }, next: "VERIFYING" });
    expect(at(1)).toMatchObject({ ok: true, rule: { id: "T11" }, next: "EXPIRED" });
    expect(at(0)).toMatchObject({ ok: true, rule: { id: "T12" }, next: "EXPIRED" });
    expect(transition("SUBMITTED", "DEADLINE_REACHED", base({ validCount: 2 })).ok).toBe(false); // not yet due
  });

  it("claims are refused without open slots, after the deadline, or when the kill switch is off", () => {
    expect(transition("OPEN", "CLAIM_CREATED", base({ activeClaimCount: 2 })).ok).toBe(false);
    expect(transition("OPEN", "CLAIM_CREATED", base({ deadline: past })).ok).toBe(false);
    expect(transition("OPEN", "CLAIM_CREATED", base({ flags: { claimsEnabled: false } })).ok).toBe(false);
  });

  it("funding failure only cancels when the PDA is absent and no signature can still land (T16)", () => {
    const ok = CTX_FOR.fundingUnrecoverable;
    expect(transition("CREATED", "FUNDING_FAILED", ok).ok).toBe(true);
    expect(transition("CREATED", "FUNDING_FAILED", { ...ok, chain: { taskPdaExists: true } }).ok).toBe(false);
    expect(
      transition("CREATED", "FUNDING_FAILED", {
        ...ok,
        funding: { ...ok.funding, allBlockhashesExpired: false },
      }).ok,
    ).toBe(false);
  });

  it("openSlots = required − valid − active, floored at 0", () => {
    expect(openSlots({ requiredWitnesses: 3, validCount: 1, activeClaimCount: 1 })).toBe(1);
    expect(openSlots({ requiredWitnesses: 1, validCount: 1, activeClaimCount: 1 })).toBe(0);
  });
});
