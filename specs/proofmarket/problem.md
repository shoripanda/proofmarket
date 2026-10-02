# Problem Definition

更新日: 2026-10-02

## Core problem

AI agents can reason over digital information but cannot directly observe current physical reality.

The failure mode is not lack of intelligence. It is lack of **fresh, location-bound evidence**.

## Problem examples

- Search says a shop is open, but shutters are down.
- Online inventory says “in stock,” but the shelf is empty.
- A menu/photo is months old and the posted price changed.
- A business claims signage/equipment was installed, but no current proof exists.
- A local condition changed after the latest web crawl.

## Why current digital tools are insufficient

### Search / maps
Useful for discovery but may be stale, incomplete, or user-reported.

### APIs
Only work where a provider exposes the needed field and keeps it current.

### Computer vision from existing images
Cannot establish that the image was captured at the target place and time.

### General human-task marketplace
Can obtain human work, but the agent still needs a standard way to express a verification claim, enforce evidence conditions, aggregate witnesses, and consume a structured result.

## Problem statement

> When an AI agent needs a fresh fact about a physical location, there is no universal low-friction primitive for requesting human observation, validating its freshness/location, and consuming the result programmatically.

## What is validated vs unvalidated

### Observed facts

- Multiple 2026 services publicly market agent-to-human task execution.
- Some explicitly focus on real-world tasks, evidence, GPS/freshness, API/MCP, escrow or crypto funding.
- Solana documents agentic payment patterns including x402 and MPP.

These facts show category activity, not ProofMarket product-market fit.

### Unvalidated hypotheses

- agent developers will pay for ProofMarket specifically
- quorum is worth extra latency/cost
- Solana anchoring materially increases requester trust
- worker supply can meet short SLA
- local verification tasks occur frequently enough for a marketplace

## Required validation

Before claiming PMF or market demand, gather:

- requester interviews
- real verification requests
- willingness-to-pay
- completion latency
- worker acceptance rate
- reasons for failed/rejected tasks
- repeated usage

## Initial hypothesis tests

### H1
Agent developers understand `request_reality_verification` without explanation.

Pass signal: at least 3 external developers can describe when they would call it.

### H2
A real worker can complete a place-status task within 15 minutes after claiming it.

Pass signal: median claim-to-submit under 15 minutes in pilot conditions.

### H3
Evidence checks reduce obvious stale/replayed submissions.

Pass signal: test suite rejects reused evidence and expired submissions.

### H4
Machine-readable answer is more useful than raw photo only.

Pass signal: agent can branch workflow automatically on the returned result.

## Anti-problem

Do not broaden the problem to:

> AI needs humans for anything.

That category is already crowded and too broad for the hackathon MVP.
