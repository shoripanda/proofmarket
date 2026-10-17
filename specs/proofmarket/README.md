# ProofMarket Specifications

Updated: 2026-10-02

This directory is the **source of truth for ProofMarket's pre-implementation specification**.

Before Claude Code, Codex, OpenClaw or any other agent starts implementing, read all of `AGENTS.md` at the repository root, then this README and the specs below.

## Product definition

ProofMarket is not a general gig marketplace.

**A network and API through which an AI agent has facts about the physical world that cannot be settled from the web or APIs verified with fresh human evidence, and receives them as a machine-readable VerificationResult.**

The MVP centres on `PLACE_STATUS_VERIFICATION`. Since 2026-10-16, general tasks are offered next to verifications (`requirements.md` §7).

## Read order

1. `project-brief.md`
2. `problem.md`
3. `users-and-stakeholders.md`
4. `requirements.md`
5. `api-contract.md`
6. `acceptance-criteria.md`
7. `privacy-security.md`
8. `legal-checklist.md`
9. `competitor-differentiation.md`
10. `architecture.md`
11. `onchain-data-model.md`
12. `offchain-data-model.md`
13. `mvp-plan.md`
14. `kpi.md`

## Precedence

When specs conflict, the order of precedence is:

1. The security, privacy and implementation principles in `AGENTS.md`
2. `requirements.md`
3. `acceptance-criteria.md`
4. `api-contract.md`
5. data model / architecture
6. idea / narrative documents

## Implementation freedom

This specification defines **what must be satisfied**.

Claude Code may choose the following:

- frontend framework
- backend framework
- database product
- object storage
- RPC provider
- wallet SDK
- deployment provider
- test framework
- image verification provider/model

A technology choice must never weaken a P0 requirement, privacy/security, a legal constraint or the acceptance criteria.

## Hard constraints

- Never write raw photos, raw GPS or personal data to Solana
- Never force workers to hold SOL
- Never commit secrets or seed phrases to the repository
- Make task creation and settlement idempotent
- Protect against replayed and duplicate evidence
- Do not accept unsafe, illegal or surveillance tasks in the MVP
- Never demo with human evidence simulated by AI
- Do not enable real-money payouts on mainnet while the legal checklist is unresolved

## Hackathon target

Crypto World's Fair submission deadline: **2026-10-12**.

"Submission-ready" means what `acceptance-criteria.md` says.

## Implementation design (2026-10-02)

The implementation design and requirements definition — technology choices, DB, API details, the Solana program, verdicts, tests and schedule — are in `implementation/en/`.

- [`implementation/en/00-README.md`](implementation/en/00-README.md)

They do not weaken the specs above; they settle how ambiguous points are interpreted. Precedence is as above.
