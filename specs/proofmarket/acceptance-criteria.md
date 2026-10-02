# Acceptance Criteria / Definition of Done

更新日: 2026-10-02

## A. P0 Submission-ready criteria

The hackathon build is not “done” until every item below passes.

### A1. Real requester flow
- [ ] a requester can create `PLACE_STATUS_VERIFICATION` through documented REST API
- [ ] requester identity maps to responsible principal
- [ ] request has deadline, geofence, answer choices, evidence requirements and bounty
- [ ] duplicate create with same idempotency key does not create/fund a second task

### A2. Real human flow
- [ ] a real human sees task on mobile
- [ ] human sees reward/requirements before accepting
- [ ] human explicitly claims/accepts
- [ ] server issues task-bound one-time challenge
- [ ] human captures/submits actual photo + answer + location
- [ ] no synthetic/AI-generated evidence is used as successful demo proof

### A3. Verification
- [ ] expired submission rejected
- [ ] outside-geofence submission rejected
- [ ] wrong/used nonce rejected
- [ ] exact replay rejected
- [ ] valid submission passes
- [ ] final result lists concrete check outcomes

### A4. Result
- [ ] agent receives JSON `VerificationResult`
- [ ] result includes answer/status/witness count/checks/evidence hash or root
- [ ] raw evidence is not publicly enumerable
- [ ] no unexplained confidence percentage is presented as fact

### A5. Solana
- [ ] at least one task-linked Devnet transaction succeeds
- [ ] transaction signature/reference is returned/stored
- [ ] no raw photo/GPS/personal data is on-chain
- [ ] repeated settlement attempt cannot pay/finalize twice
- [ ] refund and settlement cannot both succeed for same funded task

### A6. Security
- [ ] secrets are absent from git history/current repo
- [ ] invalid state transitions are tested
- [ ] requester has rate/spend constraints
- [ ] prohibited task category test is rejected
- [ ] upload type/size validation exists

### A7. Demo
- [ ] technical demo can complete in under 3 minutes
- [ ] user action, evidence, verification, chain interaction and result are visible
- [ ] explorer reference works
- [ ] demo does not depend on hidden manual DB edits

## B. P1 Strong submission criteria

- [ ] MCP tool creates/reads verification
- [ ] multi-witness configuration works
- [ ] quorum result computed
- [ ] duplicate/perceptual similarity check
- [ ] worker rejection reason shown
- [ ] signed webhook/callback
- [ ] no worker SOL acquisition required
- [ ] at least 5 real completed pilot verifications logged

## C. Stretch

- [ ] x402 V2 requester payment/funding path
- [ ] configurable assurance tiers
- [ ] worker reputation
- [ ] live public result verifier
- [ ] multiple pilot areas

## D. Required negative tests

1. same idempotency key twice
2. same evidence reused on second task
3. expired nonce
4. outside geofence
5. expired task
6. unsupported file
7. prohibited task content
8. settlement invoked twice
9. refund after settlement
10. settlement after refund

## E. Product acceptance

Even if all technical tests pass, do not claim product validation until real requesters have used it.

At submission, clearly separate:
- implemented
- tested
- pilot evidence
- future work
