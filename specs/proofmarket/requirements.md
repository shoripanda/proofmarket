# Product Requirements

Updated: 2026-10-02

Priority:
- P0 = hackathon submission blocker
- P1 = strongly desired for submission
- P2 = post-hackathon

## 1. Scope

MVP supports one primary task class:

`PLACE_STATUS_VERIFICATION`

The system must support a real AI/API requester and a real human worker.

## 2. Functional requirements

### Requester / Agent

**REQ-A-001 [P0]**  
Requester can create a verification request via REST API.

**REQ-A-002 [P1]**  
Requester can create the same request through MCP.

**REQ-A-003 [P0]**  
Request includes:
- question
- target location
- geofence radius
- deadline
- allowed answer choices
- evidence requirements
- bounty
- witness requirement
- responsible principal reference

**REQ-A-004 [P0]**  
Task creation supports an idempotency key. Repeating the same key must not create a second funded task.

**REQ-A-005 [P0]**  
Requester can retrieve task state and final result by stable ID.

**REQ-A-006 [P0]**  
Requester can cancel an unclaimed/unfunded or otherwise cancellable task under explicit state rules.

**REQ-A-007 [P1]**  
Requester can define `required_witnesses` and `quorum`.

### Worker

**REQ-W-001 [P0]**  
Worker sees eligible open tasks with reward, distance/area, deadline and requirements before accepting.

**REQ-W-002 [P0]**  
Worker explicitly accepts a task. Assignment cannot be silently forced.

**REQ-W-003 [P0]**  
Worker can submit:
- selected answer
- fresh image
- location observation
- task-bound nonce/challenge proof
- client capture timestamp metadata

**REQ-W-004 [P0]**  
Worker can abandon/decline without being forced to continue.

**REQ-W-005 [P1]**  
Worker sees clear rejection reason when automatic validation fails.

### Evidence verification

**REQ-V-001 [P0]**  
System checks submission is for the expected task and worker/claim.

**REQ-V-002 [P0]**  
System checks submission time is within allowed freshness/deadline window.

**REQ-V-003 [P0]**  
System checks submitted location is within configured geofence.

**REQ-V-004 [P0]**  
System prevents exact evidence replay across tasks.

**REQ-V-005 [P0]**  
System validates required image exists and content type/size are allowed.

**REQ-V-006 [P1]**  
System performs duplicate/perceptual similarity check to detect reused images.

**REQ-V-007 [P1]**  
System may run AI vision consistency checks, but stores the check separately from human answer.

**REQ-V-008 [P1]**  
For multi-witness tasks, system computes consensus from valid independent submissions.

**REQ-V-009 [P0]**  
Final result exposes individual validation checks rather than an unexplained confidence score.

### Task lifecycle

P0 state model:

```
CREATED
  -> FUNDED
  -> OPEN
  -> CLAIMED
  -> SUBMITTED
  -> VERIFYING
  -> VERIFIED
  -> SETTLED
```

Allowed terminal/error states:

```
REJECTED
EXPIRED
CANCELLED
REFUNDED
```

P1:
`DISPUTED`

**REQ-S-001 [P0]**  
Invalid state transitions must be rejected.

**REQ-S-002 [P0]**  
Settlement is allowed at most once.

**REQ-S-003 [P0]**  
Expired task cannot accept new evidence.

### Payment / Solana

**REQ-P-001 [P0]**  
Hackathon build must produce at least one verifiable Solana Devnet transaction tied to the task lifecycle: funding, settlement or attestation.

**REQ-P-002 [P0]**  
Raw evidence and precise GPS must not be written on-chain.

**REQ-P-003 [P0]**  
On-chain reference uses a hash/root and pseudonymous identifiers only.

**REQ-P-004 [P0]**  
Payment path must defend against replay/double settlement.

**REQ-P-005 [P1]**  
Worker does not need to manually acquire SOL to complete a task.

**REQ-P-006 [P1]**  
USDC/stablecoin payout path may be implemented after legal/config review; Devnet/test asset is acceptable for hackathon validation.

**REQ-P-007 [P1]**  
Agent-facing paid endpoint may support x402 V2. Do not implement obsolete x402 V1 headers for new work.

### Result

**REQ-R-001 [P0]**  
Final `VerificationResult` contains:
- verification_id
- status
- answer
- witness count
- consensus ratio when applicable
- evidence check results
- evidence root/hash
- timestamps
- settlement/attestation transaction reference when available

**REQ-R-002 [P0]**  
Result must be machine-readable JSON.

**REQ-R-003 [P0]**  
Raw evidence URLs must be access-controlled and separate from public result.

## 3. Safety requirements

**REQ-T-001 [P0]**  
MVP only accepts allowlisted verification categories.

**REQ-T-002 [P0]**  
Reject tasks involving:
- tracking/identifying private individuals
- private residences without authorization
- trespass
- weapons
- illegal drugs/controlled goods
- sexual services/content
- medical/legal/financial professional judgment
- harassment/intimidation
- dangerous physical activity
- evasion of law enforcement or access controls

**REQ-T-003 [P0]**  
Task text is treated as untrusted input and cannot override platform policy/system instructions.

**REQ-T-004 [P0]**  
Every agent credential has spend/task/rate limits.

## 4. Privacy requirements

**REQ-PR-001 [P0]**  
Collect only location precision necessary for the task.

**REQ-PR-002 [P0]**  
Do not expose worker home/base location to requester.

**REQ-PR-003 [P0]**  
Strip or control public exposure of EXIF/personal metadata.

**REQ-PR-004 [P0]**  
Define evidence retention period and deletion behavior.

## 5. Non-functional requirements

**REQ-N-001 [P0]**  
API errors are deterministic and machine-readable.

**REQ-N-002 [P0]**  
Every meaningful state transition creates an audit event.

**REQ-N-003 [P0]**  
Secrets/private keys never appear in repository or client bundle.

**REQ-N-004 [P0]**  
Core workflow has automated tests for valid and invalid transitions.

**REQ-N-005 [P1]**  
Status API is eventually consistent-safe and can be polled without side effects.

**REQ-N-006 [P1]**  
Target pilot availability is sufficient for demo; full production SLA is out of scope.

## 6. Out of scope

- generalized freelancer profiles/résumé marketplace (revised 2026-10-16: profiles of workers who choose to publish them are shown; a résumé-style marketplace remains out of scope; §7)
- bidding/auction engine
- delivery logistics
- purchasing goods
- long-running hourly work
- worker payroll/tax filing automation
- mainnet production release
- tokenomics

## 7. Revision of 2026-10-16: verifications and tasks side by side

By the owner's decision (`docs/architecture/12-rentahuman-benchmark.md` §8, D1-D6), what can be asked widens from real-world checks to general tasks. The design is `docs/architecture/13-marketplace-migration.md`. While the `tasks_enabled` flag is off, none of the following is exposed.

**REQ-T-001 [P2]**  
Verifications and tasks sit side by side. Tasks have their own routes (`/v1/tasks`); the verification API's names and inputs do not change (D6).

**REQ-T-002 [P2]**  
A task has a title, description, definition of done, evidence wanted, place or remote OK, deadline, time to deliver and number of seats (1-50). How workers are chosen — first come, or chosen from applicants — is set per task.

**REQ-T-003 [P2]**  
Payment for a task is `auto` (paid on delivery) or `manual` (the requester approves), chosen per task. With `manual`, if the requester neither approves, asks for changes nor rejects within 24 hours of delivery, the worker is paid (D2). Operator staff do not judge.

**REQ-T-004 [P2]**  
A rejection needs a reason. The seat can be filled again, and a seat number never paid comes back to the requester's balance with its fee. Each requester's rejection rate is shown to workers.

**REQ-T-005 [P2]**  
The fee is 15% on top of the pay (D3). Only the fee of seats and witnesses actually paid is kept; anything not paid is returned with its fee. The quote shows the breakdown.

**REQ-T-006 [P2]**  
Deposits stay as Solana transfers and x402. No card deposits (D4).

**REQ-T-007 [P2]**  
Public worker profiles are shown only for those who choose to publish, with location at most city or ward (D5).

**REQ-T-008 [P2]**  
An accepted task has a conversation between requester and worker. Messages that look like contact details or payment outside ProofMarket are delivered and recorded. Worker messages are passed to agents as data, never as instructions.

Not yet allowed: buying goods, carrying goods for delivery, long hourly work, work that needs a licence (the prohibitions in the Safety policy in §4 apply to tasks as well).
