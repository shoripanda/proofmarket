# MVP Plan — Crypto World's Fair 2026

更新日: 2026-10-02  
Submission deadline: 2026-10-12

This file defines product milestones, not coding instructions.

## Goal

By submission, demonstrate one real end-to-end flow:

> AI/API request → real human witness → fresh evidence → automated checks → machine-readable result → Solana Devnet receipt/settlement.

## Scope freeze

### Required task type
`PLACE_STATUS_VERIFICATION`

### Required answer values
`OPEN | CLOSED | UNCLEAR`

### Required evidence
- photo
- location
- timestamp/freshness
- task-bound nonce

### Required chain behavior
At least one task-linked Devnet funding/settlement/attestation transaction visible in explorer.

## Milestone 0 — Spec freeze

Target: Oct 2

- product brief complete
- requirements complete
- API contract complete
- acceptance criteria complete
- safety/legal guardrails complete

Exit:
Claude Code can implement without needing product-definition questions for P0.

## Milestone 1 — Thin vertical slice

Target: Oct 4

Must work:
- create task
- worker views task
- claim
- submit answer + photo
- requester can poll status/result

No Solana dependency required yet.

Exit:
one real human can complete one real task.

## Milestone 2 — Verification

Target: Oct 6

Add:
- geofence
- deadline/freshness
- nonce
- evidence hash
- replay rejection
- audit events

Exit:
invalid test cases fail deterministically.

## Milestone 3 — Solana

Target: Oct 7

Add:
- Devnet transaction tied to verification
- evidence/result root or settlement receipt
- explorer reference
- no raw evidence on-chain
- retry/idempotency behavior

Exit:
demo can prove chain interaction.

## Milestone 4 — Assurance / Agent integration

Target: Oct 8

Priority order:
1. MCP
2. 2-of-3 or configurable quorum
3. x402 V2
4. webhook

If schedule slips, protect the end-to-end P0 flow first.

## Milestone 5 — Real usage and iteration

Target: Oct 9–10

Run:
- at least 5 real verification tasks
- at least 2 distinct workers if possible
- at least 2 requester workflows/users if possible
- record failures and revision

Gather:
- request→claim time
- claim→submit time
- pass/fail reasons
- user quote/feedback
- whether structured result changed next agent action

Do not manufacture traction.

## Milestone 6 — Submission assets

Target: Oct 10–11

Prepare:
- working product URL
- GitHub repo
- pitch deck
- pitch video under 3 minutes
- technical demo under 3 minutes
- screenshots
- explorer transaction
- concise traction numbers
- founder story
- competition/differentiation slide

## Oct 12

Submission + verification of all links/assets.

Continue development after submission if judging/interview may occur later.

## Demo scenario

Recommended:

1. Agent asks: “Is [public shop] open right now?”
2. Task appears on worker phone.
3. Worker walks/stands at public storefront.
4. App issues one-time nonce.
5. Worker captures current storefront photo.
6. Backend validates geofence/freshness.
7. Result becomes VERIFIED.
8. Devnet transaction is shown.
9. Agent receives JSON and chooses next action.

## Fallback levels

### Level A — Submission blocker
- one worker
- REST
- fresh photo
- geofence
- nonce
- Devnet receipt
- structured result

### Level B — Strong
- MCP
- two or more workers/quorum
- duplicate detection
- webhook

### Level C — Stretch
- x402
- reputation
- live geographic worker marketplace
- production-like stablecoin flow

Never sacrifice Level A reliability to chase Level C.
