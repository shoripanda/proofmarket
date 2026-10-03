# 03. State Transition Design (English translation)

> English translation. The Japanese version in [`../ja/03-state-machine.md`](../ja/03-state-machine.md) is authoritative; if they differ, the Japanese version wins.

Created: 2026-10-02

## 1. Why state is split into 3 axes

The existing `requirements.md` writes the task state as a single sequence, but for a multi-witness task, claims and submissions progress in parallel, so it cannot be decided as one value whether it is "CLAIMED or SUBMITTED". Also, `VERIFIED_PENDING_SETTLEMENT` during an RPC outage (`architecture.md` Section 4) shows that the verification result and the fund state move independently.

So the state is split as follows.

| Axis | Where held | Values | How exposed externally |
|---|---|---|---|
| Lifecycle | `verification_requests.status` | The state names of `requirements.md` are used as they are | The API's `status` |
| Funds | `verification_requests.funding_status`, `settlement_status` | Section 4 below | The API's `funding.status`, `settlement.status` |
| Outcome | `verification_results.outcome` | `VERIFIED`, `REJECTED`, `EXPIRED` | `VerificationResult.status` |

The example in `api-contract.md` Section 7, where `status: "VERIFIED"` and `settlement.status: "SETTLED"` appear together, is consistent with this split.

Individual progress is held in the states of the claims, submissions, and challenges under the task.

## 2. Task lifecycle

### 2.1 Meaning of states

CLAIMED, SUBMITTED, and VERIFYING mean "it has progressed at least this far" and never go backward. Whether a slot is open is judged by `open_slots`, not by state.

| State | Meaning | Visible to workers? |
|---|---|---|
| CREATED | Created after passing the checks. Waiting for fund locking | No |
| FUNDED | The fund-locking transaction is confirmed (a transient state that moves to OPEN right after) | No |
| OPEN | Accepting claims. No one has claimed yet | Yes |
| CLAIMED | At least one claim has been created. Keeps accepting if slots are open | If slots are open |
| SUBMITTED | At least one submission has been received. Keeps accepting if slots are open | If slots are open |
| VERIFYING | Consensus is being computed (a short state that ends within the same transaction) | No |
| VERIFIED | Consensus reached | No |
| SETTLED | After VERIFIED, the payment transaction is confirmed | No |
| REJECTED | Consensus was not reached (`NO_CONSENSUS`) | No |
| EXPIRED | Valid submissions did not reach quorum by the deadline | No |
| CANCELLED | The requester cancelled, or fund locking failed | No |
| REFUNDED | The locked funds were refunded in full | No |
| DISPUTED | P1. Not implemented this time | — |

Open slots are computed by the following formula.

```text
open_slots = required_witnesses − (number of valid submissions) − (number of ACTIVE claims)
```

### 2.2 Transition table

Any combination of (state, event) not in the table is rejected (REQ-S-001).

| # | From | Event | Condition | To | Side effects |
|---|---|---|---|---|---|
| T01 | CREATED | `FUNDING_CONFIRMED` | initialize_task is finalized | FUNDED | funding_status = CONFIRMED |
| T02 | FUNDED | `OPEN` | deadline > now | OPEN | Webhook `verification.open`, `NOTIFY_WORKERS` job (added 2026-10-04; push to workers who chose that area) |
| T03 | OPEN | `CLAIM_CREATED` | open_slots > 0, claims_enabled flag is true | CLAIMED | Create claim, Webhook `verification.claimed` |
| T04 | CLAIMED / SUBMITTED | `CLAIM_CREATED` | Same as above | (unchanged) | Create claim |
| T05 | CLAIMED | `SUBMISSION_RECEIVED` | Claim is ACTIVE, before deadline | SUBMITTED | Webhook `verification.submitted` |
| T06 | SUBMITTED | `SUBMISSION_RECEIVED` | Same as above | (unchanged) | — |
| T07 | SUBMITTED | `QUORUM_READY` | valid count = required_witnesses | VERIFYING | Run consensus computation in the same transaction |
| T08 | OPEN / CLAIMED / SUBMITTED | `DEADLINE_REACHED` | valid count ≥ quorum | VERIFYING | Set ACTIVE claims to EXPIRED. Compute consensus |
| T09 | VERIFYING | `CONSENSUS_REACHED` | Count of the most frequent answer ≥ quorum, and the most frequent is unique | VERIFIED | Save result, settlement_status = PENDING, put FINALIZE_AND_SETTLE in the outbox, Webhook `verification.verified` |
| T10 | VERIFYING | `CONSENSUS_FAILED` | The condition of T09 is not met | REJECTED | Save result (`NO_CONSENSUS`), settlement_status = PENDING, put FINALIZE_AND_SETTLE in the outbox, Webhook `verification.rejected` |
| T11 | OPEN / CLAIMED / SUBMITTED | `DEADLINE_REACHED` | 1 ≤ valid count < quorum | EXPIRED | Save result (`INSUFFICIENT_WITNESSES`), set ACTIVE claims to EXPIRED, put FINALIZE_AND_SETTLE in the outbox, Webhook `verification.expired` |
| T12 | FUNDED / OPEN / CLAIMED / SUBMITTED | `DEADLINE_REACHED` | valid count = 0 | EXPIRED | Save result (`INSUFFICIENT_WITNESSES`, 0 valid), set ACTIVE claims to EXPIRED, put REFUND_TASK in the outbox, Webhook `verification.expired` |
| T13 | VERIFIED | `SETTLEMENT_CONFIRMED` | settle is finalized | SETTLED | settlement_status = CONFIRMED, Webhook `verification.settled` |
| T14 | CREATED | `CANCEL_REQUESTED` | The fund-locking transaction has not been sent yet | CANCELLED | Release the balance reservation, cancel the FUND_TASK job |
| T15 | OPEN / CLAIMED / SUBMITTED | `CANCEL_REQUESTED` | 0 ACTIVE claims, 0 valid | CANCELLED | Put REFUND_TASK in the outbox |
| T16 | CREATED | `FUNDING_FAILED` | The retry limit was reached, or the deadline has passed. And the Task PDA does not exist on-chain, and the blockhash of every signature sent has expired (it can no longer land) | CANCELLED | Release the balance reservation, reason `FUNDING_FAILED`, Webhook `verification.cancelled` |
| T17 | CANCELLED / EXPIRED | `REFUND_CONFIRMED` | refund is finalized | REFUNDED | Return the balance, settlement_status = CONFIRMED |
| T18 | REJECTED / EXPIRED | `SETTLEMENT_CONFIRMED` | settle is finalized (1 or more valid) | (unchanged) | Return the remainder, settlement_status = CONFIRMED. `verification.settled` is not sent (so that it is not misread as success) |

If the Task PDA is found while checking the condition of T16, fund locking had succeeded, so proceed to T01. If the deadline has passed, continue with a refund through T12. This way, we never create the state "marked CANCELLED, but the funds remain locked on-chain".

For REJECTED, and for EXPIRED with 1 or more valid submissions, payment to the valid workers and return of the remainder are done in a single settle (Chapter 06). In this case the lifecycle stays REJECTED / EXPIRED, and completion of the funds is indicated by `settlement_status = CONFIRMED`. SETTLED is used only when "consensus was reached and payment is complete", so that an agent looking only at `status` does not confuse success with failure.

If a cancellation arrives while the fund-locking transaction is being sent in CREATED, do not use T14; wait for confirmation and then handle it with T15. The response is `409 TASK_NOT_CANCELLABLE` (`retryable: true`).

### 2.3 Final resting states

| Ending | Lifecycle | settlement_status | result.status |
|---|---|---|---|
| Consensus reached and paid | SETTLED | CONFIRMED | VERIFIED |
| Consensus reached, awaiting payment | VERIFIED | PENDING / SUBMITTED / FAILED | VERIFIED |
| No consensus, valid workers paid | REJECTED | CONFIRMED | REJECTED |
| Expired, valid workers paid | EXPIRED | CONFIRMED | EXPIRED |
| Expired, no submissions, refunded | REFUNDED | CONFIRMED | EXPIRED |
| Cancelled after fund locking, refunded | REFUNDED | CONFIRMED | (none) |
| Cancelled before fund locking | CANCELLED | NONE | (none) |

## 3. States under a task

### 3.1 Claim

| State | Meaning |
|---|---|
| ACTIVE | Claimed. Challenges can be obtained and submissions can be made |
| ACCEPTED | There was a valid submission (terminal) |
| REJECTED | Attempts were used up, or it was terminated due to replay (terminal) |
| ABANDONED | The worker gave up (terminal) |
| EXPIRED | The claim's validity period or the deadline passed (terminal) |

| From | Event | To |
|---|---|---|
| ACTIVE | Submission is VALID | ACCEPTED |
| ACTIVE | Submission is INVALID, for a retryable reason, with attempts remaining | ACTIVE |
| ACTIVE | Submission is INVALID, the reason is replay or near-duplicate, or attempts are used up | REJECTED |
| ACTIVE | Worker abandons | ABANDONED |
| ACTIVE | Validity period expired, or the task advanced to VERIFYING or later | EXPIRED |

Moving to any terminal state other than ACCEPTED frees one slot.

### 3.2 Submission

Verification is done synchronously inside the request, so CHECKING is not visible from outside.

| State | Meaning |
|---|---|
| CHECKING | Being verified |
| VALID | Passed all required checks. Enters the consensus computation |
| INVALID | Failed one of the required checks. Has a reason code |

A claim can have at most one submission in CHECKING at a time (guaranteed by a partial unique index. Chapter 04).

### 3.3 Challenge (nonce)

| State | Meaning |
|---|---|
| ISSUED | Issued, not yet used |
| USED | Used in a submission |
| SUPERSEDED | A new challenge was issued for the same claim |
| EXPIRED | Past the validity period |

A claim always has at most one challenge in ISSUED.

### 3.4 Upload

| State | Meaning |
|---|---|
| PENDING | A signed upload URL was issued |
| FINALIZED | Tied to a submission |
| DISCARDED | One hour passed without being used. The object is also deleted |

## 4. Fund states

### 4.1 funding_status

```text
NONE → PENDING (job registered) → SUBMITTED (has signature) → CONFIRMED
                                   └→ FAILED (waiting to retry) → SUBMITTED …
                                   └→ ABANDONED (T14, T16)
```

### 4.2 settlement_status

```text
NONE → PENDING → SUBMITTED → CONFIRMED
                   └→ FAILED (waiting to retry) → SUBMITTED …
```

For settlement, only one of payment (settle) and refund (refund) ever happens. Which one it was is recorded in `payment_records.kind`.

### 4.3 Mapping to on-chain states

The on-chain states are kept to a minimum (Chapter 06). The mapping to the candidates in `onchain-data-model.md` Section 3 is as follows.

| On-chain | Meaning | Off-chain correspondence |
|---|---|---|
| `Funded` | Funds locked | FUNDED to VERIFYING, and VERIFIED / REJECTED / EXPIRED before finalization |
| `Finalized` | The result (outcome, evidence root, recipients) was written | Waiting for settle |
| `Settled` | Payment and return of the remainder done | SETTLED, or REJECTED / EXPIRED + CONFIRMED |
| `Refunded` | Refunded in full | REFUNDED |

OPEN, CANCELLED, and EXPIRED, which `onchain-data-model.md` lists, are not kept on-chain. These are states about who claimed when, and there is no benefit in verifying them on a public chain.

## 5. Implementation conventions

- Write the transition table as a single piece of data in `packages/core/src/task/transitions.ts`, and have `transition(state, event, context)` return the destination state and the list of side effects, or an error
- The service layer looks at the list of side effects and writes state updates, audit_events, outbox_jobs, and Webhooks in the same transaction
- The unit tests run through every (state, event) combination and confirm that only the combinations in the table succeed (REQ-N-004)
- The `event_type` of audit_events uses the names in `architecture.md` Section 7, and `before_state` and `after_state` are always filled in
