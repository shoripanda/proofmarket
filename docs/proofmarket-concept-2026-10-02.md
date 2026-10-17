# ProofMarket — a Reality Verification Network for AI

Updated: 2026-10-02  
Status: **Lead implementation candidate for the Fall 2026 Crypto World's Fair**

## 1. In one line

**A network where AI agents ask humans to verify real-world facts that the web and APIs cannot settle, and receive evidence-backed, machine-readable results.**

The goal is not a general "marketplace where AI hires humans". The first wedge is limited to **real-world fact verification**.

> Revised 2026-10-16: by the owner's decision, verification stays the headline, and general work (tasks) can be requested side by side. See `docs/architecture/12-rentahuman-benchmark.md`, `13-marketplace-migration.md` and `specs/proofmarket/requirements.md` §7.

Working tagline:

> Give AI eyes in the real world.

## 2. Problem

AI agents can reach the web, APIs, databases and browsers, but cannot directly check "what is actually happening at this place right now", such as:

- Whether a shop is really open now
- Whether a particular product is on the shelf
- What price is currently posted
- Whether an on-site notice, facility or sign exists
- Whether web information matches the state on the ground

Search results, reviews and opening-hours databases can be stale, and an AI may take its next action on a wrong premise.

## 3. Narrow initial user

The first requesters are **AI agent developers / operators who need up-to-date facts about the physical world**.

In the MVP the target is not "general consumers" or "all companies" but developers such as:

- travel / local search agents
- shopping / retail research agents
- operations agents that need field verification
- autonomous research agents

On the human worker side, start with a small number of test workers in the pilot area.

## 4. First task type

The MVP is not a do-anything service with free-form requests.

### P0 task: PLACE_STATUS_VERIFICATION

Example:

> Check whether the specified shop is open right now.

Required input:

- question
- target location
- geofence radius
- deadline
- answer choices
- required evidence
- bounty
- witness count / quorum

Required submission:

- answer
- fresh photo
- device/server timestamp
- location proof
- binding to a one-time task nonce

### P1 tasks

- PRICE_VERIFICATION
- PRODUCT_PRESENCE
- SIGNAGE_VERIFICATION

Subjective evaluation, purchasing on someone's behalf, delivery, negotiating with people and dangerous work are out of scope for the MVP.

## 5. User flow

```text
AI Agent
   ↓ REST / MCP
Verification Request
   ↓
ProofMarket
   ↓
Human Worker
   ↓
Fresh evidence + answer
   ↓
Verification checks
   ↓
Consensus / acceptance
   ↓
Solana settlement + attestation receipt
   ↓
Machine-readable result
   ↓
AI Agent continues workflow
```

## 6. What the output is

The main deliverable returned to the AI is not "human work product" but a **VerificationResult**.

Example:

```json
{
  "verification_id": "ver_...",
  "status": "verified",
  "answer": "OPEN",
  "consensus_ratio": 1.0,
  "witnesses": 3,
  "evidence_checks": {
    "geofence": true,
    "freshness": true,
    "nonce": true,
    "duplicate": false
  },
  "evidence_root": "...",
  "settlement_signature": "..."
}
```

The MVP does not use uncalibrated numbers like "AI confidence 98%". Instead it returns an observable `consensus_ratio` and the result of each check.

## 7. How it differs from competitors

As of 2026-10-02, the agent-to-human market includes Taskin, RentAHuman, NeedaHuman, Human4Hire and others.

ProofMarket narrows to:

1. A **fact verification protocol**, not a general task marketplace
2. Input/output schemas standardized for verification
3. Machine-readable results rather than workers' free-text deliverables
4. Quorum across several witnesses when needed
5. Anchoring evidence hashes/roots on Solana rather than raw evidence
6. Agents completing request → proof → settlement entirely over API/MCP

Competitors are likely to add similar features. The difference has to be proven not by naming but by verification quality, latency, coverage, worker reputation, agent integration and cost.

## 8. Why blockchain

Task matching and evidence storage could be built with an ordinary database alone.

The hypotheses for using Solana are limited to:

- agents can fund bounties programmatically in USDC and the like
- settlement after acceptance conditions becomes verifiable by third parties
- only hashes/roots are anchored with timestamps, without publishing the evidence itself
- a common settlement receipt across requester / worker / verifier
- composable connection with agentic payment tooling

If PoC does not confirm this value, shrink the on-chain scope.

## 9. Why Solana

- Low cost suited to micro-payments and high-frequency settlement
- Fast confirmation makes it easy to build into agent workflows
- A stablecoin payment ecosystem
- Official documentation for agentic payments such as x402 / MPP
- Usable as a publicly verifiable settlement / attestation layer

x402 is not the same as "escrow for the whole human task". Agent API payment/funding and worker bounty settlement may be designed as separate layers.

## 10. Hackathon MVP

At minimum, run the following end to end with real people:

1. An AI agent creates a verification request
2. The task appears on the worker screen
3. A worker accepts it
4. On site, the worker submits a fresh photo + location + answer
5. The server runs evidence checks
6. A VerificationResult is produced
7. Settlement or attestation on Solana Devnet
8. The agent retrieves the machine-readable result

**Simulated human results are forbidden.**

Stretch:

- 2-of-3 quorum
- MCP integration
- x402 payment-gated requests
- worker reputation
- live explorer

## 11. Non-goals

The MVP does not do:

- a general gig marketplace
- delivery / purchasing / negotiating on someone's behalf
- medical, legal or financial judgements
- tracking individuals / surveillance
- tasks requiring entry onto private property
- anything involving weapons, drugs or controlled goods
- token issuance
- DAO governance
- storing raw GPS or photos on chain
- fully autonomous dispute arbitration

## 12. Mandatory gate

### Problem
The problem that agents cannot directly get the fresh state of the physical world is real. Willingness to pay for ProofMarket specifically has not been validated in user interviews.

### Existing alternatives
Taskin / RentAHuman / NeedaHuman / Human4Hire are close. So "AI can hire humans" alone is no differentiation.

### Why now
AI agent tool use and machine payment infrastructure are expanding, and a physical-world escalation path is starting to appear as a product category.

### Founder-market fit
For now, explain it mainly through "builds AI agents and automation day to day". Do not exaggerate. Strengthen it with user interviews and real operation.

### Distribution
Start by offering REST/MCP to agent developers, and build worker supply with a closed pilot in one area.

### Hackathon feasibility
Limited to one task type, a working MVP is feasible in a short time.

## 13. Main risks

- Existing competitors are close
- Cold start of worker supply
- GPS spoofing / stale photos / replay
- Dangerous or illegal tasks from requesters
- Worker collusion
- Regulation of payouts / escrow
- Worker classification / freelance regulation
- Privacy / location data
- Verification cost exceeding the bounty
- Higher latency from quorum

## 14. Source of truth

When implementing, start from `specs/proofmarket/README.md` and give priority to:

- `requirements.md`
- `api-contract.md`
- `privacy-security.md`
- `acceptance-criteria.md`

## Sources

- Solana Agentic Payments: https://solana.com/docs/payments/agentic-payments
- Solana x402: https://solana.com/docs/payments/agentic-payments/x402
- Taskin: https://trytaskin.ai/
- Taskin docs: https://trytaskin.ai/docs
- RentAHuman: https://rentahuman.ai/for-agents
- NeedaHuman: https://needahuman.ai/
- Human4Hire: https://www.human4hire.ai/
- Colosseum Crypto World's Fair: https://colosseum.com/worldsfair
