# 01. Requirements Definition (English translation)

> English translation. The Japanese version in [`../ja/01-requirements-definition.md`](../ja/01-requirements-definition.md) is authoritative; if they differ, the Japanese version wins.

Created: 2026-10-02

## 1. Purpose and target outcome

An AI agent asks "Is this store open right now?" through a REST API and receives a JSON answer determined from a photo and location taken on site by a real human. The finalization and the reward payment are recorded on Solana Devnet. We will run this with real humans and real stores at the 10/12 submission.

The level to meet at submission follows the fallback levels in `mvp-plan.md`.

| Level | Contents | Handling |
|---|---|---|
| Level A | REST, 1 worker, on-site photo, geofence, nonce, Devnet record, structured result | Mandatory. Do no work that breaks this |
| Level B | MCP, multiple witnesses and quorum, similar-image detection, Webhook | Target to include by 10/8 |
| Level C | x402 V2, worker reputation, multiple regions | If time allows |

## 2. Scope

### In scope

- One task type, `PLACE_STATUS_VERIFICATION`
- Answer choices `OPEN | CLOSED | UNCLEAR`
- Evidence: at least 1 photo, location, time, and a nonce tied to the task
- Escrow (fund locking), result recording (attestation), and payment and refund on Devnet
- A smartphone web app for workers (no native app)
- A REST API for requesters, plus an MCP server and Webhook in P1
- A public result page for judges and third parties (no photos shown)
- A demo agent (a small script that calls REST and branches its next action on the result)

### Out of scope

In addition to the out-of-scope items in Section 6 of `requirements.md`, the following are also not built.

- An admin screen for requesters (the API and the public result page suffice)
- An admin screen for operators (replaced by admin APIs and scripts)
- Operating real funds on Mainnet (the whole feature is disabled until the checks in `legal-checklist.md` are complete)
- Computing worker reputation scores (only the records are kept)

## 3. Roles

| Role | Entity | Authentication | What they can do |
|---|---|---|---|
| Requester | An AI agent, or its developer | API key (Bearer) | Create, retrieve, and cancel verification requests; retrieve evidence images (P1) |
| Responsible Principal | The person or legal entity responsible for the requester | None (linked when the API key is issued) | The accountable party when the operator issues an API key |
| Worker | An invited human witness | Privy login (email or Google) | View, claim, capture, submit, and abandon tasks; view payment history |
| Operator | The platform operator | Admin token | Suspend requesters and workers, freeze new tasks, halt settlement, revoke API keys, stop evidence publication |
| Verifier | The verification process inside the server | None (internal) | Verify evidence, compute consensus, finalize on-chain |
| Public viewer | Judges and third parties | None | View the public result page and Solana Explorer |

An API key is always linked to exactly one Responsible Principal (`users-and-stakeholders.md`, Section 3). No API key is issued without a responsible party.

## 4. Decisions on ambiguous points

The operating rules that the existing specs did not decide are set out below. The criteria were two: fairness to workers, and letting an agent branch on the result alone.

### 4.1 Reward amount

`bounty.amount` is the reward amount per witness. At creation, `amount × required_witnesses` is reserved from the requester's balance and placed in the on-chain escrow. The platform fee is 0 in the MVP, and only a field for it is provided (the rate is undecided, as stated in `project-brief.md`).

### 4.2 What is paid

A submission that passes all verification (Chapter 07) is called valid. A worker who made a valid submission is paid one share of the reward, regardless of whether their answer is in the majority and whether the task reached consensus. A submission that fails verification is not paid.

There are two reasons. If those who honestly answered UNCLEAR, or those in the minority, were not paid, it would create an incentive to side with the majority and weaken the point of verification. Also, the worker has completed work that meets the conditions (this corresponds to the explicit statement of reward and rejection rules in `legal-checklist.md`, Section 1).

### 4.3 Computing consensus

- Consensus is computed when `required_witnesses` valid submissions have arrived, or at the deadline
- If the most frequent answer has at least `quorum` votes and the most frequent answer is unique, the result is VERIFIED. The answer is that value
- Otherwise the result is REJECTED (reason `NO_CONSENSUS`)
- If valid submissions have not reached `quorum` at the deadline, the result is EXPIRED (reason `INSUFFICIENT_WITNESSES`)
- UNCLEAR is counted as one value like any other answer. If UNCLEAR meets the quorum, it is returned as "VERIFIED / UNCLEAR"
- Early finalization at the moment `quorum` is reached is not done in the MVP (because how to treat workers still on their way is undecided. P2)

`required_witnesses = quorum = 1` is the default, and P0 works with this setting alone.

### 4.4 Cancellation

A requester can cancel only while there are 0 in-progress claims and 0 valid submissions. If funds have not yet been locked, it ends as CANCELLED; if they have been locked, it goes through CANCELLED, the full amount is refunded, and it becomes REFUNDED. Cancellation while a worker is on the way to the site is not accepted (`TASK_NOT_CANCELLABLE`).

### 4.5 Deadlines

| Item | Default | Bounds |
|---|---|---|
| deadline (length from creation time) | Specified per request | At least 10 minutes and at most 24 hours |
| Claim validity period | 30 minutes (not exceeding the deadline) | Configurable |
| Nonce validity period | `freshness.max_age_seconds` (default 300 seconds) | 60 to 900 seconds |
| Submission attempts per claim | 3 | Configurable |

When a submission fails for a reason not the worker's fault, such as insufficient location accuracy, the worker can get a new nonce and retry within the claim's validity period. An exact-match photo reuse (replay) and a photo nearly identical to another submission (near-duplicate, P1) are suspected fraud, so the claim is terminated on the spot.

### 4.6 One worker, one vote

The same worker can claim the same task only once. A retry is treated as an attempt within the same claim and is not added to the witness count (`offchain-data-model.md`, Section 5).

### 4.7 Other decisions

| Item | Decision |
|---|---|
| Starting to accept multiple witnesses | Until PR-14 lands, the environment variable `MAX_WITNESSES=1` rejects `required_witnesses > 1` with 400 `VALIDATION_FAILED` |
| Comparison set for replay | The photos of all submissions that passed the earlier checks (including those that became INVALID). The app takes a new photo on every retake, so the same byte sequence arriving again can happen only if it was tampered with |
| The "day" in the daily limit | The calendar day in Japan time (Asia/Tokyo) |
| Who can view a request | Only the API key that created it. It is not visible even from another key of the same principal |
| Idempotency keys older than 24 hours | The create API continues to prevent duplicates through the unique constraint on `verification_requests`. If the body is the same, the existing request is returned with 200; if it differs, 409 `IDEMPOTENCY_KEY_CONFLICT` |
| Storage limits | Set `file_size_limit = 8 MiB` and `allowed_mime_types = image/jpeg` on the bucket itself, because signed URLs do not enforce the declared size |
| Where requests can be made | Within 30 m of a point on the allowlist of public stores registered by the operator (REQ-X-T-104) |

## 5. Business flow

### 5.1 Normal case (1 witness)

```text
Requester            ProofMarket API / Jobs              Worker (phone)            Solana Devnet
   | POST /v1/verifications ->|                              |                          |
   |<- 201 CREATED ------------|                              |                          |
   |                          |-- initialize_task ------------------------------------->|
   |                          |<- confirmed: FUNDED -> OPEN ----------------------------|
   |                          |<----- GET /v1/worker/tasks ---|                          |
   |                          |<----- POST claim -------------|                          |
   |                          |<----- POST challenge (on site)|                          |
   |                          |--- nonce ------------------->|                          |
   |                          |<----- photo upload, submit ---|                          |
   |                          | verify -> valid -> consensus VERIFIED |                  |
   |                          |-- finalize_verification + settle ---------------------->|
   |                          |<- finalized: SETTLED ----------------------------------|
   | GET /v1/verifications/{id} (polling) or Webhook                                    |
   |<- VerificationResult -----|                              |                          |
```

### 5.2 Main failure cases

| Event | Behavior |
|---|---|
| No one claims it | EXPIRED at the deadline, refund the full amount, and it becomes REFUNDED |
| Submission outside the geofence, stale, or invalid nonce | Mark the submission INVALID and show the reason to the worker. If attempts remain, the worker can retry |
| Exact-match photo reuse, nearly identical photo | Submission INVALID, claim REJECTED. The task returns the slot to other workers |
| RPC is down | The result stays VERIFIED with settlement.status set to PENDING, and retries continue until recovery. It does not claim to be SETTLED |
| Webhook destination is down | The result can be retrieved by polling. Resending never causes a double settlement |
| Resend with the same Idempotency-Key | Return the same response as the first time. If the contents differ, 409 |

## 6. Functional requirements

ID convention: use the IDs of the existing `requirements.md` as they are, and start requirements added for implementation with `REQ-X-`. The meaning of priority is the same as in the existing spec (P0 = required for submission).

### 6.1 Requester

| ID | Requirement | Priority | Existing correspondence |
|---|---|---|---|
| REQ-A-001 | A verification request can be created via REST | P0 | Same |
| REQ-A-003 | A request includes the question, location, radius, deadline, choices, evidence requirements, reward, witness count, and principal | P0 | Same |
| REQ-A-004 | Idempotency-Key prevents double creation and double locking | P0 | Same |
| REQ-A-005 | Status and result can be retrieved by ID | P0 | Same |
| REQ-A-006 | Cancellation is possible under the rules in 4.4 | P0 | Same (rules made concrete) |
| REQ-A-002 | Create, retrieve, and cancel are possible via MCP | P1 | Same |
| REQ-A-007 | Witness count and quorum can be specified | P1 | Same |
| REQ-X-A-101 | At creation, check the balance, per-request limit, daily limit, rate limit, and region, and reject with a defined error code if exceeded | P0 | Concretization of REQ-T-004 |
| REQ-X-A-102 | An authenticated requester can retrieve the evidence images of their own requests (derived images with EXIF removed) through a signed URL valid for 5 minutes | P1 | Concretization of REQ-R-003 |
| REQ-X-A-103 | State changes can be received through a signed Webhook | P1 | api-contract Section 11 |

### 6.2 Worker

| ID | Requirement | Priority | Existing correspondence |
|---|---|---|---|
| REQ-X-W-101 | Only people with an invite code can register. At first login, consent to the terms of use and safety rules is obtained, and the version and time are recorded | P0 | Closed pilot (legal-checklist Section 9) |
| REQ-W-001 | Before claiming, the reward, distance, deadline, requirements, and cautions can be seen in a list and in detail | P0 | Same |
| REQ-W-002 | A task is claimed only by an explicit action | P0 | Same |
| REQ-X-W-102 | The nonce is obtained when starting to shoot on site | P0 | Concretization of REQ-W-003 |
| REQ-W-003 | Submit the answer, photo, location, nonce, and device time | P0 | Same |
| REQ-W-004 | The worker can abandon at any time, with no penalty for abandoning | P0 | Same |
| REQ-W-005 | The reason a verification failed is shown in Japanese that makes clear what to fix | P1 | Same |
| REQ-X-W-103 | The worker can see their own payment history and links to the Explorer | P1 | New |
| REQ-X-W-104 | The worker is not made aware of wallets, SOL, or signing | P0 | REQ-P-005 raised to P0 (because D-04 makes it achievable) |

### 6.3 Verification

REQ-V-001 to 009 of `requirements.md` are satisfied as they are. The conditions and reason codes for each check are defined in Chapter 07.

| ID | Requirement | Priority |
|---|---|---|
| REQ-X-V-101 | Run the checks in ascending order of cost, and record the first check that fails and its reason code. The rest are `not_run` | P0 |
| REQ-X-V-102 | Accepting multiple submissions to the same task and computing consensus are done serially under a lock on the task row | P0 |

### 6.4 Settlement and Solana

REQ-P-001 to 007 of `requirements.md` are satisfied.

| ID | Requirement | Priority |
|---|---|---|
| REQ-X-P-101 | For each task, send to Devnet the transactions for fund locking (initialize_task), result finalization (finalize_verification), and payment (settle) or refund (refund), and record the signatures | P0 |
| REQ-X-P-102 | settle and refund are mutually exclusive in the on-chain state. Each succeeds only once | P0 |
| REQ-X-P-103 | If sending fails, read the on-chain state and then resend. If the state has already advanced, do not resend and only correct the record | P0 |
| REQ-X-P-104 | The platform pays fees and the cost of creating the worker's receiving account (ATA) | P0 |
| REQ-X-P-105 | Sending to Mainnet is prohibited by code configuration (the RPC URL and genesis hash are checked at startup) | P0 |

### 6.5 Results and publication

| ID | Requirement | Priority |
|---|---|---|
| REQ-R-001 to 003 | As in `requirements.md` | P0 |
| REQ-X-R-101 | The public result page `/r/{verification_id}` shows the answer, witness count, verification results, evidence root, and Explorer link. It does not show photos, coordinates, or the question text | P1 |
| REQ-X-R-102 | A public verification API returns the canonicalized evidence bundle so that anyone can recompute the root and check it against the on-chain value | P2 (Stretch: live public result verifier) |

### 6.6 Safety and policy

REQ-T-001 to 004 of `requirements.md` are satisfied. Implementation methods are described in Chapter 08.

| ID | Requirement | Priority |
|---|---|---|
| REQ-X-T-101 | Reject a request whose location is outside the target-area rectangle | P0 |
| REQ-X-T-102 | The question text is limited to 280 characters, and requests containing prohibited words (Japanese and English) are rejected. The ID of the rule used for the decision is recorded | P0 |
| REQ-X-T-103 | The operator can immediately stop new creation, claims, and settlement individually | P0 |
| REQ-X-T-104 | Reject a request unless its location is within 30 m of one of the public stores (`places`) registered by the operator | P0 |

### 6.7 Demo agent

| ID | Requirement | Priority |
|---|---|---|
| REQ-X-D-101 | `scripts/demo-agent.ts` creates a request via REST, polls until the result appears, and displays "proceed with the visit reservation" for `OPEN`, "look for another store" for `CLOSED`, and "ask a human to check" for `UNCLEAR` | P0 |
| REQ-X-D-102 | The same can be done through MCP from an MCP client such as Claude | P1 |

## 7. Non-functional requirements

| Category | Requirement |
|---|---|
| Performance | API responses excluding chain processing are within 1 second at p95. From submission to verification result is within 10 seconds. From VERIFIED to SETTLED is within 60 seconds under normal conditions |
| Availability | It is enough that it works for the demo and the real operation on 10/9 to 10/10. A production SLA is out of scope (REQ-N-006) |
| Consistency | Retrieving state has no side effects and can be called any number of times (REQ-N-005). All state transitions are done inside a DB transaction, and audit events are written in the same transaction |
| Supported devices | iOS Safari 17 or later, and the latest 2 versions of Android Chrome. Camera and location permissions are required |
| Language | The worker screens are built in Japanese first, and English is added in P1. API error messages are in English |
| Retention | Original photos and exact location: 30 days. Derived images: 30 days. Verification results, hashes, audit logs, and payment records: 1 year (the production period will be decided after legal review). Deleted by a daily job when the period expires |
| Monitoring | Always attach `verification_id` to structured logs. Leave the events in `architecture.md` Section 7 in audit_events |
| Cost | Keep within the free tiers of Devnet and each service. Even if AI image verification is used, keep it to around 1 yen per request |
| Secrets | Do not expose private keys or API keys in the repository, logs, or client bundles (REQ-N-003). Run gitleaks in CI |

## 8. Assumptions and dependencies

- The free tiers of Privy, Supabase, Vercel, and a Devnet RPC (such as Helius) are available
- Devnet USDC can be secured from Circle's faucet (if it is insufficient, switch to our own test mint. Chapter 06)
- At least 2 test workers and public stores in the pilot area can be secured
- The "real usage" shown at review is by real requesters and workers, including acquaintances, and the counts must not be inflated (`kpi.md`)
