# ProofMarket Implementation Design & Requirements (English translation)

> English translation. The Japanese version in [`../ja/00-README.md`](../ja/00-README.md) is authoritative; if they differ, the Japanese version wins.

Created: 2026-10-02
Scope: Crypto World's Fair 2026 submission (deadline 2026-10-12)
Japanese version: [`../ja/00-README.md`](../ja/00-README.md) (the authoritative original; this English version is a translation. If they differ, the Japanese version is correct)

## Role of this document set

The 14 existing specs under `specs/proofmarket/` define "what must be satisfied" and leave technology choices and implementation details to the implementation side. This document set fills in those delegated parts so that Claude Code can start implementing from P0 using only these documents.

None of the existing specs' P0 requirements, security/privacy constraints, or acceptance criteria has been weakened. Where the existing specs were ambiguous or contradictory, we decided on an interpretation and recorded it under "Gaps in the existing specs and their resolutions" below.

Priority follows the Precedence in the existing `specs/proofmarket/README.md`.

1. Security, privacy, and implementation principles in `AGENTS.md`
2. `requirements.md`
3. `acceptance-criteria.md`
4. `api-contract.md`
5. This document set (on par with the data model / architecture documents. Where it is more specific than the existing data model / architecture, use this one)

## Reading order

| # | File | Contents |
|---|---|---|
| 1 | [01-requirements-definition.md](01-requirements-definition.md) | Requirements definition. Scope, roles, business flows, functional and non-functional requirements, decisions on ambiguous points |
| 2 | [02-system-architecture.md](02-system-architecture.md) | Basic design. Tech stack, architecture, repository layout, screen list, environment variables |
| 3 | [03-state-machine.md](03-state-machine.md) | State transition tables for tasks, claims, submissions, and funds |
| 4 | [04-database-design.md](04-database-design.md) | PostgreSQL table definitions and constraints |
| 5 | [05-api-design.md](05-api-design.md) | Details of REST / MCP / Webhook and the error code list |
| 6 | [06-solana-program-design.md](06-solana-program-design.md) | Anchor program and Settlement Adapter |
| 7 | [07-evidence-verification-design.md](07-evidence-verification-design.md) | Processing from photo capture through verdict, consensus, and evidence root |
| 8 | [08-security-privacy-operations.md](08-security-privacy-operations.md) | Mapping of threats to countermeasures, key management, retention periods, failure procedures |
| 9 | [09-test-plan.md](09-test-plan.md) | Test plan and mapping to acceptance criteria |
| 10 | [10-implementation-plan.md](10-implementation-plan.md) | Schedule for 10/2 to 10/12, work breakdown, human responsibilities |

## List of decisions

Decisions confirmed by the user are marked "Confirmed". The rest are design judgments, with reasons given in each chapter.

| ID | Decision | Basis / confirmation |
|---|---|---|
| D-01 | Unify everything in TypeScript. Combine the worker web app and the `/v1` REST API into one Next.js (App Router) app and host it on Vercel | Confirmed (all TypeScript) |
| D-02 | The DB and object storage are Supabase (PostgreSQL + a private Storage bucket). The ORM is Drizzle | Chapter 02 |
| D-03 | The Solana program uses Anchor 1.2.x (Rust), the TS client is `@anchor-lang/core`, and program tests use LiteSVM | Chapter 06. Stable versions as of 2026-10-02 |
| D-04 | Worker login and the payout wallet use Privy. A Solana embedded wallet is created automatically on first login, and the worker never signs a transaction | Confirmed (the app issues it automatically) |
| D-05 | The requester (agent) authenticates with an API key. It is not given any Solana private key. Funds use a prepaid balance model held by the platform (Devnet only) | Chapters 05 and 06. Doing the same in production requires legal review |
| D-06 | The reward asset is Circle's Devnet USDC (mint `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`, 6 decimals). If the faucet runs short, switch to our own test mint | Chapter 06 |
| D-07 | `bounty.amount` is the amount per witness. The total escrow is `amount × required_witnesses` | Chapter 01, Section 4 |
| D-08 | Every submission that passes verification (valid) is paid. This holds even when consensus is not reached or the deadline expires. Submissions that fail verification are not paid | Chapter 01, Section 4 |
| D-09 | Separate the claim (reserving a slot) from the challenge (issuing a nonce). The nonce is issued when the worker starts shooting on site, and its validity period is `freshness.max_age_seconds` | Chapter 07 |
| D-10 | State is held on three axes: the task lifecycle, funds (funding / settlement), and outcome. `VERIFIED_PENDING_SETTLEMENT` is expressed as "VERIFIED and settlement.status = PENDING" | Chapter 03 |
| D-11 | No on-chain time limit is placed on finalizing the outcome. This is so that a prolonged RPC outage does not cost a worker with a valid submission their payment | Chapter 06 |
| D-12 | Asynchronous processing uses a transactional outbox. It is run once immediately within the request, and Supabase's pg_cron calls `/api/internal/tick` every minute to pick up the rest | Chapter 02 |
| D-13 | The evidence root and result hash are the SHA-256 of JSON canonicalized per RFC 8785 (JSON Canonicalization Scheme) | Chapter 07 |
| D-14 | Photos are taken with the in-app camera (`getUserMedia`). Selecting from the device gallery is not allowed. The server re-encodes them and strips EXIF | Chapter 07 |
| D-15 | Workers are an invite-only closed pilot. The target area is limited by a configured rectangle | Chapter 01 |
| D-16 | The deliverables treat Japanese as authoritative, with an English version as a parallel translation | Confirmed |
| D-17 | Claude Code mainly handles implementation; humans handle the worker role, on-site verification, the video, and the pitch | Confirmed. Chapter 10 |

## Gaps in the existing specs and their resolutions

| # | State of the existing spec | Resolution | Chapters |
|---|---|---|---|
| G-01 | The lifecycle in `requirements.md` lists CLAIMED / SUBMITTED as task states, but with multiple witnesses there are multiple claims, which cannot be expressed by a single task state | Define the task state as a monotonic state meaning "how far it has progressed", and keep individual progress in the claim and submission states | 03 |
| G-02 | `VERIFIED_PENDING_SETTLEMENT` in `architecture.md` is not in the state list | Do not add a state; express it on the settlement.status axis (D-10) | 03 |
| G-03 | The states in which cancellation is allowed are described only as "explicit state rules", with no content | Cancellation is allowed only while there are 0 in-progress claims and 0 valid submissions | 01, 03 |
| G-04 | `api-contract.md` lists fund as an Idempotency target, but there is no fund API | fund is made an internal process. Idempotency is guaranteed by PDA uniqueness and a unique constraint on payment_records | 05, 06 |
| G-05 | It does not say whether bounty is a total or per person | Per person (D-07) | 01 |
| G-06 | Payment for UNCLEAR answers, failed consensus, and deadline expiry is undefined | As in D-08 | 01, 07 |
| G-07 | `onchain-data-model.md` requires finalize to be "before the deadline", but if an RPC outage spans the deadline, a legitimate submission can no longer be finalized | Remove the time limit on finalize on-chain. The deadline is judged off-chain at the moment a submission is accepted. refund can be called only when the state is Funded, so a finalized task is never refunded (D-11) | 06 |
| G-08 | The claim response includes a nonce, but with a freshness of 300 seconds it expires before the worker reaches the site | Add a challenge reissue API. The nonce in the claim response is kept for compatibility (D-09) | 05, 07 |
| G-09 | The API's `network: "solana-devnet"` is the same notation as the x402 V1 network name | Keep it as an enumerated value of our own API. When implementing x402 V2, convert it to CAIP-2 notation (`solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1`) | 05 |
| G-11 | `onchain-data-model.md` allows placing the worker's public key "if needed for settlement". However, the payout address is the same across tasks, so someone looking at the Explorer could link which stores the same worker visited and when | The MVP is a closed pilot; we explain this point to workers and obtain their consent. The API does not return the public key. In production, change to a model where the platform holds balances and pays out in batches (P2) | 06, 08 |
| G-12 | `offchain-data-model.md` says the request location is "encrypted or restricted" | Store it in plaintext and restrict access. The location is the public store location shown to workers and is limited to points on the allowlist registered by the operator (G-14) | 04 |
| G-13 | Among the Webhook events, none notifies of a cancellation caused by failed fund locking | Add `verification.cancelled` (the existing 7 types are unchanged) | 05 |
| G-14 | `privacy-security.md` limits the MVP's targets to public places, but the existing specs have no mechanism to verify that | Keep an operator-registered allowlist of stores (`places`), and reject a request unless its location is within 30 m of one of those points | 04, 05, 08 |
| G-10 | The directory policy in the root README separates `app/`, `backend/`, and `programs/` | To combine the worker screens and the API in one Next.js app, use `apps/web`, and move domain logic out to `packages/`. The README will be updated when implementation starts | 02 |

## Remaining items for humans to decide

Implementation can proceed even if the following are undecided. The values are externalized into configuration files.

1. The pilot area (municipality and 3 to 5 target stores). Needed by 10/6 for the on-site test
2. Creating accounts and issuing API keys for Privy, Supabase, Vercel, and an RPC provider (such as Helius). Needed by 10/3
3. Who to ask to be test workers (2 or more) and test requesters (2 or more)
4. Whether to use the AI image consistency check (P1, optional). If used, it incurs a small Claude API cost
