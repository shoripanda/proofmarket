# 01. Current system: settlement and verification work; spending limits and key storage are weak

Written: 2026-10-14 / Scope: `origin/main` commit `05d6544` (up to PR #37, 266 commits, started 2026-09-11) / The unmerged PRs #39-#42 are marked "under review"

## 1. Purpose

This is step 1 of the brief. It rates ProofMarket's technical makeup per feature on four levels (Implemented / Partial / Missing / Unknown) as the starting point for the design in later steps. Facts checked in the code are kept apart from guesses and proposals: guesses are marked "(guess)" and proposals "(proposal)".

## 2. Current state: summary

ProofMarket lets an AI agent ask a person to check something in the real world, receive a photo and an answer, and pay in USDC. It runs on Vercel as a single Next.js app. Everything from creating a request through escrow, verification and payout is implemented, and production (proofmarket.fun) runs on Devnet. The ratings first:

| Feature | Rating | Evidence (where in the code) |
|---|---|---|
| Frontend (worker PWA, public pages, requester console) | Implemented | `apps/web/app/(worker)`, `(site)`, `r/[id]`; 29 pages |
| Backend (REST `/v1`, tick, MCP) | Implemented | 59 route handlers, 35 files in `lib/services` |
| Database | Implemented | 39 tables in `packages/db/src/schema.ts`, migrations 0000-0028 |
| Solana connection | Implemented | `packages/solana/src/anchor-adapter.ts`, `send.ts` |
| Wallet authentication (worker) | Implemented | Privy access-token verification (`lib/auth/worker.ts`) |
| Wallet authentication (requester) | Missing (by design) | API keys and OAuth only; Solana signatures are not used for auth (05 §1.2) |
| USDC settlement | Implemented | Prepaid-balance ledger `requester_ledger`, Solana Pay deposits, x402 |
| Escrow | Implemented | Anchor program v1.2, 8 instructions, 23 LiteSVM tests |
| API for AI agents | Implemented | Three routes: REST, MCP (OAuth 2.1), x402 |
| Request → claim → delivery flow | Implemented | State machine (chapter 03), claim, challenge, submission |
| Verifying deliveries | Implemented | 6 machine checks + Claude review + optional human review + disputes |
| "Approval" of deliveries (requester accepts or rejects) | Missing (by design) | D-08: "every submission that passes is paid". No approval action; disputes instead |
| Listing requests (requester) | Missing | No `GET /v1/verifications` list; GET by ID only |
| Spending limits (per request, per day) | Partial | `requester_credentials.max_task_amount` and `daily_spend_limit` are stored but nothing checks them at creation |
| Kill switches | Implemented | 5 `platform_flags`, the program's `paused`, suspending credentials and workers |
| Key management | Partial | Operator and verifier secret keys sit in Vercel env vars as base58; no KMS or MPC |
| Deployment | Implemented | Vercel + Supabase (PostgreSQL, Storage, pg_cron); CI is 3 GitHub Actions jobs |
| Env vars and secrets | Implemented | Checked with zod in `apps/web/lib/env.ts`; gitleaks runs in CI |
| Tests | Implemented | 54 test files: web 234, core 78, db 7, sdk 10, program 23 |
| Mainnet | Partial | Startup gate (`lib/cluster.ts`) and keys are ready; program not deployed; RPC chosen as Helius (no contract yet) |
| Multiple tokens (beyond USDC) | Partial | SOL works on main; 11 tokens and Token-2022 are under review in PRs #39-#42 |

Both Missing items were either decided against or not yet needed; neither is a bug. Among the Partial items the unchecked spending limit is the most serious and is handled first in chapter 08.

## 3. Requirements (what this document checks)

The 13 items in the brief, in order: frontend, backend, DB, Solana connection, wallet auth, USDC settlement, escrow, agent API, request flow, verification, deployment, env vars, tests. Below are the facts for each, which ground the ratings.

## 4. Proposed design (in this document: "facts found")

### 4.1 Technology

A TypeScript 5.9 / pnpm 12 monorepo requiring Node 24: `apps/web` (Next.js 16.3, React 19), `packages/core` (pure TS, no dependency on the DB or Solana), `packages/db` (Drizzle 0.45, SQL migrations), `packages/solana` (settlement adapter), `packages/sdk` (requester client), `packages/mcp` (MCP server), `programs/proofmarket` (Anchor 1.2, Rust) and `scripts` (19 operational scripts). Biome for lint and formatting; Vitest 5, PGlite, LiteSVM 0.17 and Playwright for tests.

### 4.2 Solana connection

The client is `@solana/web3.js` 1.99, `@anchor-lang/core` 1.2.0 and `@solana/spl-token` 0.4.15; `@solana/kit` is not used. The reason, given in chapter 02 of the existing spec, is that Anchor 1.x's TS client assumes web3.js v1. Sending lives in `anchor-adapter.ts`: it takes a finalized blockhash, uses a fixed priority fee of 10,000 micro-lamports and waits up to 60 seconds for finalized. PR #40 moves this into `send.ts`, sets the fee from the p75 of recent fees, resends every 2 seconds and proceeds on confirmed only for ATA creation (under review).

Production RPC is Devnet's public RPC or Helius; for mainnet, Helius's Developer plan was chosen on 2026-10-13 (`docs/ops/rpc-mainnet-2026-10-13.md`). At startup `SOLANA_EXPECTED_GENESIS_HASH` is compared with the RPC, and the server refuses to start on a mismatch.

### 4.3 Wallet authentication

Workers log in with email or Google through Privy (`@privy-io/react-auth` 3.46, `@privy-io/node` 0.35); a Solana embedded wallet is created on first login. Workers never sign transactions. The server accepts only Privy access tokens and rejects identity tokens.

Requesters (agents) authenticate with an API key `Authorization: Bearer pm_test_<prefix>_<secret>` or, for MCP, an OAuth access token (`pm_oat_`). Only a SHA-256 hash of the secret is stored, compared in constant time. Authentication by wallet signature is rejected by the spec (`api-contract.md`).

### 4.4 USDC settlement

Requester funds are a prepaid balance recorded in `requester_ledger` (TOPUP / RESERVE / RELEASE / REFUND). There are three ways in: a manual TOPUP by the operator (`scripts/issue-api-key.ts`, and the 5 USDC trial balance from `/join`), a Solana Pay transfer with a reference that the tick detects (15 §4.3, `deposits` table), and x402 payment. x402 is `POST /v1/x402/verifications` with v2 `PAYMENT-REQUIRED` and `PAYMENT-SIGNATURE` headers; the operator acts as its own facilitator, verifies every MUST in `scheme_exact_svm.md` and then co-signs as fee payer (`packages/solana/src/x402.ts`). The official `@x402/svm` is not used. Only USDC, and the amount is fixed at `bounty.amount × required_witnesses`.

### 4.5 Escrow

Anchor program v1.2 (Devnet `A9frCat4fv1rKRKF4sAg6WT8LaUwm4CvJ1JZb81kgC2s`) has 8 instructions: `initialize_config`, `update_config`, `add_mint`, `remove_mint`, `initialize_task` (treasury → vault), `finalize_verification` (the verifier records the result and recipients), `settle` (vault → witnesses, the rest → treasury, close the vault) and `refund` (everything → treasury). The Task PDA is unique per `task_id_hash`, so a request cannot be funded twice, and `settle` and `refund` read the state before acting, so double payment cannot happen. Keys are split three ways: admin (upgrade authority, never on the server), operator (moves money) and verifier (writes results); `initialize_config` requires operator ≠ verifier. An operator review is in `docs/security/program-review-2026-10-13.md`; there has been no third-party audit.

### 4.6 Request lifecycle

States: CREATED → FUNDED → OPEN → CLAIMED → SUBMITTED → VERIFYING → VERIFIED → SETTLED, with branches REJECTED, EXPIRED, CANCELLED and REFUNDED (transitions T01-T19 in chapter 03). Funding/settlement and the outcome are separate axes. There is no DISPUTED state; a dispute is implemented as "create a new recheck request" (01 §4.12). Async work goes through a transactional outbox: pg_cron calls `/api/internal/tick` every minute and jobs are taken with leases.

### 4.7 Verifying deliveries

There are six machine checks: location (geofence), freshness, challenge nonce, replay, near-duplicate photos (pHash Hamming distance ≤ 6 within 90 days) and image format. Only submissions that pass are compared with the request by Claude (`lib/adapters/claude-reviewer.ts`, default model `claude-opus-5-5`). The verdict is pass / fail / uncertain: fail asks the worker to redo it; uncertain and API failures pass with a warning. With the flag `external_review_enabled` set, submissions wait for Claude Code on the owner's Mac and pass unchecked after 30 minutes (01 §4.17). The requester may dispute once within 24 hours of the result, which creates a recheck request at their cost. With optimistic verification (13 §3), the first submission returns a provisional answer that becomes final after the challenge window.

### 4.8 Deployment and operations

Production is Vercel (proofmarket.fun) and Supabase; there is no `vercel.json` and deployment is through the Git integration. pg_cron calls the tick, and GitHub Actions `uptime.yml` checks `/v1/health/ready` from outside every 5 minutes. CI (`ci.yml`) has three jobs, all required to merge: TypeScript (lint, typecheck, tests, OpenAPI in sync, `next build`, no key-like strings in the client bundle), program (`anchor build`, `cargo test`, IDL in sync) and secrets (gitleaks).

### 4.9 Env vars and secrets

`apps/web/lib/env.ts` validates with zod at startup and refuses to start if anything is missing. The secrets are `DATABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `PRIVY_APP_SECRET`, `SOLANA_RPC_URL`, `OPERATOR_SECRET_KEY`, `VERIFIER_SECRET_KEY`, `LOCATION_ENC_KEY`, `WORKER_REF_SALT`, `WEBHOOK_SIGNING_SECRET_PEPPER`, `INTERNAL_CRON_SECRET`, `ADMIN_TOKEN` and `ANTHROPIC_API_KEY` (optional), all in Vercel env vars. Mainnet adds `SOLANA_CLUSTER`, `REAL_FUNDS_ENABLED` and `LEGAL_SIGNOFF`, and keys used on Devnet are refused on mainnet (`lib/cluster.ts`). The original keys live in `~/.config/proofmarket/`, never in the repository.

### 4.10 Tests

54 test files: unit tests of pure functions in `packages/core` (78), integration tests on PGlite with a fake chain adapter in `apps/web/test` (234), a real-validator round trip in `packages/solana/test/localnet.test.ts` (5, only with `PM_LOCALNET=1`) and LiteSVM in `programs/proofmarket/tests` (23). Counted by running them on main on 2026-10-14. Playwright e2e lives in `apps/web/e2e` and is not run in CI (guess: it needs a fake camera set up, so it is run locally).

## 5. Why these technologies (existing decisions)

The reasons are in decisions D-01 to D-17 in chapter 00 of the existing spec. In short: to let one person and Claude Code finish in 10 days, everything is TypeScript on one server (D-01); PostgreSQL, because unique constraints and transactions protect idempotency (D-02); Privy, so workers never have to think about wallets (D-04). Requesters hold no Solana secret key and use a prepaid balance instead (D-05); doing the same in production needs legal review, as that decision notes.

## 6. Alternatives (rejected by the existing spec)

A separate API server such as Hono, Firestore, Prisma, S3, holding users' keypairs ourselves, plain Rust, `@solana/kit` alone. The reasons are in the table in chapter 02 of the existing spec.

## 7. Security considerations (weaknesses found)

Four, most serious first.

1. **Spending limits are not checked.** `requester_credentials` stores per-request and per-day limits, and keys from x402 and `/join` get 5 USDC and 20 USDC, but nothing in `createVerification` reads them. The check existed in the first implementation (commit `89c0159`) and was removed on purpose on 2026-10-09 in PR #14 (commit `0a3e3a5`, "no cap on the bounty an agent pays"). The error codes `TASK_AMOUNT_LIMIT_EXCEEDED` and `DAILY_SPEND_LIMIT_EXCEEDED` remain. The only brake today is the prepaid balance; an agent can spend all of it on one request. Against the brief's "a design where an AI agent can spend funds without limit is forbidden", the balance acts as a ceiling so it is not unlimited, but a limit written on the key that is only for show is misleading.
2. **The operator key is in a Vercel env var.** On mainnet it will hold real money. 15 §4.2 limits the damage by capping what the treasury holds, but the cap value and the sweep procedure are not decided yet.
3. **The program's upgrade authority.** The deploying key becomes the upgrade authority. Item 5 of the review asks for it to move to a multisig or hardware wallet after deployment; so far this only concerns Devnet.
4. **A payment can become final on AI judgement alone.** A machine-check pass plus a Claude pass queues the payment in the outbox, and once final it cannot be undone. The requester's only remedy is a dispute (the recheck is at their cost). Assessed in chapter 07.

## 8. Implementation issues

- Moving to `@solana/kit` can only be partial while Anchor's TS client requires web3.js v1 (covered in chapter 02)
- The production program is deployed as SBPF v0 and has to be built with `cargo build-sbf --tools-version v1.57`, not `anchor build`'s default (v3) (failure log in CLAUDE.md, 2026-10-08)
- Multi-token support (PRs #39-#42) is under review, with a fixed merge order (#39 → #40 → #41 → #42) and migration 0029 applied first. These documents do not assume it

## 9. Test strategy (current assessment)

The three CI jobs gate merging, and OpenAPI and the IDL are checked against the code by machine. Missing: load testing (measuring whether settlement jobs fit in a tick) and a way to run e2e against a real chain in CI. Covered in Phase 5 of chapter 11.

## 10. Open questions

- At what granularity to check spending limits (per request, day, month, principal). Options in chapters 08 and 11
- Whether to move the operator key to a KMS or MPC, or rely on the treasury cap alone
- Whether to add a requester "approval" action, or keep D-08 (every submission that passes is paid)
- No item was rated Unknown. However, production data (actual request counts, settlement latency) was not read; these ratings rest on the code and the specs only
