# Logical Architecture

更新日: 2026-10-02

この文書は**technology-neutralなsystem boundary**を定義する。frameworkやcloud vendorは固定しない。

## 1. Components

### A. Agent Gateway
Responsibilities:
- REST API
- optional MCP
- requester authentication
- rate/spend/task-category limits
- idempotency
- request validation

### B. Task Service
Responsibilities:
- verification lifecycle
- assignment/claim state
- deadlines
- quorum/witness rules
- cancellation/expiry

### C. Worker Web App
Responsibilities:
- eligible task discovery
- task review
- explicit accept/decline
- evidence capture
- status/rejection reason

MVPはnative app不要。mobile browserで完結できればよい。

### D. Evidence Service
Responsibilities:
- upload authorization
- raw media storage
- metadata extraction
- hash generation
- evidence root generation
- retention/deletion

### E. Verification Engine
Responsibilities:
- geofence
- freshness
- nonce binding
- replay/duplicate checks
- schema checks
- optional AI vision consistency
- multi-witness consensus

### F. Settlement Adapter
Responsibilities:
- Solana transaction construction/invocation
- task funding
- settlement/refund
- attestation
- confirmation tracking

### G. Solana Program / On-chain Layer
Minimal responsibilities:
- authorized state transition
- escrow/settlement if used
- evidence root/hash anchoring
- immutable public receipt

Do not move general marketplace/business logic on-chain.

### H. Off-chain Database
Stores:
- users/principals
- task details
- worker claims
- verification state
- validation output
- audit log
- payout reference

### I. Object Storage
Stores:
- photos
- optional thumbnails
- derived files

Raw evidence must not be publicly enumerable.

## 2. Trust boundaries

```text
Untrusted Agent Input
       |
       v
[Agent Gateway]
       |
       v
[Task Service] ----> [Off-chain DB]
       |
       +-----------> [Worker Web]
       |                  |
       |                  v
       |            Untrusted Evidence
       |                  |
       v                  v
[Verification Engine] < [Evidence Service/Object Storage]
       |
       +------ valid result ------+
                                  v
                         [Settlement Adapter]
                                  |
                                  v
                               Solana
```

Everything received from agent, worker device, media metadata, callback endpoint and blockchain RPC must be treated as untrusted until validated.

## 3. Primary sequence

1. agent authenticates
2. create request + idempotency key
3. policy/preflight validation
4. task created
5. funding/authorization path succeeds
6. task opens
7. worker claims
8. server issues one-time challenge
9. worker captures and submits evidence
10. evidence service hashes/stores
11. verification engine runs checks
12. if quorum met, task becomes VERIFIED
13. settlement/attestation transaction submitted
14. confirmation recorded
15. `VerificationResult` returned/webhook sent

## 4. Failure behavior

### No worker
Task expires; refundable funds must return through defined path.

### Worker submit fails validation
Do not settle. Mark submission rejected with reason; task may reopen if deadline permits.

### Solana/RPC unavailable
Do not lose accepted evidence. Persist VERIFIED_PENDING_SETTLEMENT off-chain and retry according to bounded policy.

Do not claim SETTLED before chain confirmation required by implementation policy.

### Callback fails
Result remains retrievable via polling. Callback retry must not repeat settlement.

## 5. Architecture constraints

- raw evidence off-chain
- public chain contains minimum state/hash only
- no single HTTP retry can create duplicate bounty
- no client timestamp is authoritative by itself
- no AI model result is sole proof of physical presence
- main requester flow remains usable without worker knowing blockchain details
- worker UI should not require understanding Solana

## 6. Optional x402

x402 V2 may payment-gate a requester API or fund a service balance.

Do not assume x402 itself implements asynchronous human-task escrow. If using x402, clearly separate:
- API payment/funding authorization
- task bounty escrow/settlement

Use current Solana x402 documentation and V2 headers only for new implementation.

## 7. Observability

Minimum structured events:
- request_created
- funding_confirmed
- task_opened
- worker_claimed
- evidence_uploaded
- evidence_check_completed
- witness_accepted
- quorum_reached
- settlement_submitted
- settlement_confirmed
- refund_confirmed
- task_expired
- task_cancelled

Correlation key: `verification_id`.
