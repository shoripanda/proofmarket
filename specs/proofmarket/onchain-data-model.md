# On-chain Data Model

更新日: 2026-10-02

Goal: store only what benefits from public verifiability or programmatic settlement.

## 1. Principles

- no raw photo/video
- no exact GPS
- no worker name/email/phone
- no requester private profile data
- no task free-text if it may contain sensitive data
- deterministic identifiers should be hashes, not plaintext IDs when unnecessary
- one logical task must not settle twice

## 2. Candidate task account

Implementation may use an account/PDA or another minimal pattern, but semantics should support:

```text
TaskEscrow / VerificationReceipt
- version
- task_id_hash: [32]
- requester: Pubkey
- asset_mint: Pubkey
- bounty_amount
- status
- required_witnesses
- quorum
- deadline
- evidence_root: [32] optional until finalization
- result_hash: [32] optional
- created_slot/timestamp
- finalized_slot/timestamp
```

Worker payout pubkeys may be stored only if required by settlement mechanics. Do not put worker profile identifiers on-chain.

## 3. State values

Suggested semantic states:

- CREATED/FUNDED
- OPEN
- VERIFIED
- SETTLED
- REFUNDED
- CANCELLED
- EXPIRED

Off-chain lifecycle can be more detailed than on-chain lifecycle.

## 4. Candidate instructions

### initialize_task
Creates/funds task state.

Invariants:
- supported mint only
- amount > 0
- deadline in future
- quorum <= required_witnesses
- requester signer authorized
- unique task hash

### finalize_verification
Commits evidence/result root after off-chain verification.

Invariants:
- task not expired
- task not already finalized
- authorized verifier/oracle policy
- evidence_root length/format valid

For MVP, platform-authorized verifier is acceptable if clearly disclosed. Do not claim decentralized verification.

### settle
Pays valid recipient(s) and closes/marks escrow.

Invariants:
- task VERIFIED
- not previously settled/refunded
- total payout <= funded amount
- expected mint/recipient accounts
- authorized transition

### refund
Returns eligible funds after cancellation/expiry.

Invariants:
- not settled
- cancellation/expiry conditions met
- at most once

## 5. Evidence root

Off-chain evidence bundle should be canonically serialized and hashed.

Example logical fields:
- verification_id
- accepted witness submission hashes
- check results
- final answer
- finalized_at

The on-chain layer stores only the resulting root/hash.

Canonicalization must be documented and deterministic before relying on cross-client verification.

## 6. Replay / double-spend protections

Must include:
- unique task identifier/hash
- explicit state transition guards
- single settlement/refund terminality
- signer checks
- mint allowlist
- amount checks
- deterministic account derivation where appropriate

Off-chain API idempotency is still required; on-chain safety does not replace it.

## 7. Fee sponsorship

Worker should not need to own SOL merely to submit evidence.

Possible implementations:
- platform fee payer
- sponsored transaction
- platform performs settlement after off-chain verified submission

Choice is implementation-level, but security boundaries must be explicit.

## 8. Devnet-first

Hackathon validation:
- local validator / Devnet before any mainnet use
- real-money production settlement disabled by default
- explorer-visible transaction reference in demo
