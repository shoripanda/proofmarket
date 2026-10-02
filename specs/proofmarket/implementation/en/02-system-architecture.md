# 02. Basic Design (System Architecture) (English translation)

> English translation. The Japanese version in [`../ja/02-system-architecture.md`](../ja/02-system-architecture.md) is authoritative; if they differ, the Japanese version wins.

Created: 2026-10-02

## 1. Tech stack

The top priority is that one person (and Claude Code) can finish building it in 10 days. We unify the language on TypeScript, consolidate the server into one, and run no infrastructure of our own.

| Layer | Choice | Main reason | Rejected candidates |
|---|---|---|---|
| Web and API | Next.js (latest stable at the start of work, App Router, Route Handlers), Node.js runtime | The worker screens and the `/v1` API ship in one deployment | A separate API server such as Hono (would mean two deployment targets) |
| Hosting | Vercel | Next.js can be deployed as is. Preview environments appear automatically | Render (an always-on server is unnecessary) |
| DB | Supabase PostgreSQL | Row locks, unique constraints, and transactions prevent idempotency violations and double settlement. pg_cron is available | Firestore etc. (weak unique constraints and transactions) |
| ORM | Drizzle ORM + drizzle-kit (migrations) | Close to SQL, and typed | Prisma (heavy generated artifacts) |
| Object storage | Supabase Storage private bucket | Has signed upload URLs and avoids Vercel's 4.5MB limit | S3 (adds another account) |
| Worker auth and wallet | Privy (`@privy-io/react-auth`, and `@privy-io/node` on the server; the older `@privy-io/server-auth` is deprecated as of 2026-10) | Email/Google login and automatic Solana embedded wallet creation come in one package | Creating and holding keypairs ourselves (would become custody) |
| Solana program | Anchor 1.2.x (Rust) | Stable version as of 2026-10. Account validation can be written declaratively | Plain Rust (higher risk of missed validation) |
| Solana client | `@anchor-lang/core`, `@solana/web3.js` v1, `@solana/spl-token` | Because the Anchor 1.x TS client assumes web3.js v1 | `@solana/kit` alone (mixing with the Anchor client would duplicate types) |
| Image processing | sharp | Re-encoding, EXIF removal, resizing, preprocessing for perceptual hashing | — |
| MCP | `@modelcontextprotocol/sdk` (stdio server) | Runs on the agent developer's machine using their API key | — |
| Testing | Vitest (TS), LiteSVM (program), PGlite (migration SQL and DB constraints), Playwright (end-to-end screen checks, P1) | Anchor 1.x defaults to LiteSVM. PGlite lets CI exercise PostgreSQL constraints without Docker | — |
| Language / lint | TypeScript 5.9, Biome (lint and format), Node.js 24+ | TypeScript 7 is not yet verified with Next.js, so 5.9 is pinned. Biome needs a single config file | ESLint + Prettier |
| Package management | pnpm workspaces | Monorepo | — |
| CI | GitHub Actions (lint, type check, tests, gitleaks, `anchor build`) | — | — |

## 2. Architecture diagram

```text
                    ┌──────────────────────── Vercel ────────────────────────┐
 AI Agent ──REST──▶ │ apps/web                                                │
 (API key)          │  ├ /v1/verifications/*      Agent Gateway               │
 MCP client ─stdio─▶│  ├ /v1/worker/*             Worker API                  │
  └ packages/mcp ───┤  ├ /v1/public/*             Public results              │
                    │  ├ /v1/admin/*              Operator API                │
 Worker (phone) ──▶ │  ├ /(worker)/*              Worker Web (PWA)            │
  └ Privy SDK       │  ├ /r/[id]                  Public result page          │
                    │  └ /api/internal/tick       outbox processing (from cron)│
                    │        │  packages/core (state transitions, verification, consensus, canonicalization) │
                    │        │  packages/solana (Settlement Adapter)          │
                    └────────┼──────────────┬──────────────┬─────────────────┘
                             │              │              │
                     ┌───────▼──────┐ ┌─────▼──────┐ ┌─────▼────────┐
                     │ Supabase     │ │ Supabase   │ │ Solana       │
                     │ PostgreSQL   │ │ Storage    │ │ Devnet RPC   │
                     │ + pg_cron    │ │ (private)  │ │ (Helius etc.)│
                     └──────────────┘ └────────────┘ └──────┬───────┘
                                                             │
                                                   programs/proofmarket
```

The mapping to the logical components in `architecture.md` is as follows.

| Logical component | Implementation location |
|---|---|
| A. Agent Gateway | `apps/web/app/v1/verifications/**`, `apps/web/lib/auth/requester.ts` |
| B. Task Service | `packages/core/src/task/**` (state transitions), `apps/web/lib/services/task-service.ts` (DB operations) |
| C. Worker Web App | `apps/web/app/(worker)/**` |
| D. Evidence Service | `apps/web/lib/services/evidence-service.ts`, `packages/core/src/evidence/**` |
| E. Verification Engine | `packages/core/src/verification/**` (pure functions), `apps/web/lib/services/verification-service.ts` |
| F. Settlement Adapter | `packages/solana/src/**` |
| G. Solana Program | `programs/proofmarket/**` |
| H. Off-chain DB | `packages/db/**` (Drizzle schema and migrations) |
| I. Object Storage | Supabase Storage buckets `evidence-raw` and `evidence-derived` |

## 3. Repository layout

```text
Solana-idea/
├── apps/
│   └── web/                      Next.js (worker screens, API, public pages)
│       ├── app/
│       │   ├── (worker)/         Login, list, detail, capture, result, payment history
│       │   ├── r/[id]/           Public result page
│       │   ├── v1/               REST (Route Handlers)
│       │   └── api/internal/     outbox processing called from cron
│       └── lib/                  Auth, service layer, errors, logger
├── packages/
│   ├── core/                     Domain logic (pure TS, depends on neither the DB nor Solana)
│   ├── db/                       Drizzle schema, migrations, seed
│   ├── solana/                   Anchor client, transaction building, sending, confirmation
│   ├── sdk/                      Typed REST client for requesters
│   └── mcp/                      MCP server (uses sdk)
├── programs/
│   └── proofmarket/              Anchor program (Rust) and LiteSVM tests
├── scripts/
│   ├── devnet-setup.ts           Initialize config, create the treasury's ATA
│   ├── issue-api-key.ts          Issue a principal and an API key
│   ├── issue-invite.ts           Issue a worker invite code
│   ├── register-place.ts         Register public stores that can be requested
│   ├── register-webhook.ts       Register a Webhook destination (P1)
│   └── demo-agent.ts             Demo agent
├── tests/
│   └── e2e/                      Playwright (P1)
├── specs/ docs/ ideas/           Existing
├── Anchor.toml
├── pnpm-workspace.yaml
└── .github/workflows/ci.yml
```

`packages/core` is separated from the DB and Solana so that most of the negative tests for the acceptance criteria (state transitions, verification, consensus) can run as fast unit tests.

## 4. Processing model

### 4.1 Splitting synchronous and asynchronous work

The API response includes only DB writes and verification. Sending to the chain and Webhooks are queued in the outbox and done asynchronously.

```text
API request
  └ DB transaction
      ├ State transition
      ├ Append to audit_events
      └ Add to outbox_jobs (e.g. FUND_TASK, FINALIZE_AND_SETTLE, REFUND_TASK, DELIVER_WEBHOOK)
  └ After returning the response, try running the relevant job once with Next.js after() (not counted in response time)

pg_cron (every minute) → pg_net POST /api/internal/tick (with shared secret)
  └ Detect expirations (tasks, claims, nonces)
  └ Take a lease on runnable outbox jobs and run them
  └ Delete evidence past its retention period (once a day)
```

Jobs are fetched using a lease. This is so that no DB transaction is held open while waiting for chain confirmation (up to 60 seconds).

```sql
update outbox_jobs
   set state = 'RUNNING', locked_until = now() + interval '3 minutes',
       locked_by = :runner_id, attempts = attempts + 1
 where id = (select id from outbox_jobs
              where (state = 'PENDING' and run_after <= now())
                 or (state = 'RUNNING' and locked_until < now())   -- reclaim the lease of a crashed run
              order by run_after
              for update skip locked
              limit 1)
returning *;
```

Commit this single lease-taking statement in a short transaction, and then run the job. after() and tick never take the same job at the same time. When a run finishes, set the job back to DONE or PENDING (with the next `run_after`) only if `locked_by` is itself.

Write jobs so that running them any number of times gives the same result. For chain transactions, read the on-chain account before sending, and if it is already in the target state, do not send and only advance the record (Chapter 06, Section 5).

### 4.2 Transactions and locks

When creating a request, take the relevant row of `requester_credentials` with `SELECT ... FOR UPDATE` before checking the limits and the balance. Even if creations arrive concurrently from the same API key, the reservation never exceeds the limits.

Any process that changes a task's state must first take the relevant row of `verification_requests` with `SELECT ... FOR UPDATE`. Even if claim acceptance, submission acceptance, consensus computation, cancellation, and expiry processing run concurrently on the same task, the number of open slots and the count of valid submissions stay correct.

### 4.3 Time

All times used for decisions are the DB server's `now()`. The device's time is only recorded and is not used for decisions (`architecture.md` Section 5, "no client timestamp is authoritative").

## 5. Screen list (Worker Web)

Only portrait smartphone screens are assumed. The words Solana, wallet, and SOL do not appear on screen (only the Explorer link in the payment history is shown as "View transaction record").

| # | Screen | Path | Main elements |
|---|---|---|---|
| W-01 | Login | `/login` | Privy email/Google login |
| W-02 | First-time registration | `/onboarding` | Invite code entry, consent to terms of use and safety rules, explanation of location and camera permissions |
| W-03 | Task list | `/tasks` | Nearest first from the current location. Reward, distance, time remaining, required evidence |
| W-04 | Task detail | `/tasks/[id]` | Question, store location (link to a maps app), radius, reward, deadline, shooting cautions (capture the storefront and signboard, avoid people's faces), "Claim" button |
| W-05 | In transit | `/claims/[id]` | Time remaining, "I have arrived" button, "Give up" button |
| W-06 | Capture and answer | `/claims/[id]/capture` | Live camera, capture, choosing OPEN/CLOSED/UNCLEAR, submit |
| W-07 | Verification result | `/claims/[id]/result` | Pass/fail, reason and how to retry, remaining attempts |
| W-08 | Payment history | `/payouts` | Amount, date and time, status, "View transaction record" |

The public result page `/r/[id]` can be viewed by anyone. It shows the answer, witness count, verification list, evidence root, finalization time, and Explorer link. It does not show photos, coordinates, the question text, or worker information.

## 6. Environments and configuration

### 6.1 Environments

| Environment | Purpose | Solana |
|---|---|---|
| local | Development | solana-test-validator or LiteSVM |
| preview | Vercel preview per PR | Devnet (settlement disabled) |
| demo | Submission and pilot | Devnet |

No Mainnet environment is created.

### 6.2 Environment variables

Variables other than those starting with `NEXT_PUBLIC_` are server-only. Put `import "server-only"` at the top of any module that reads a private key, so that the build fails if it ends up in a client bundle.

| Variable | Contents | Secret |
|---|---|---|
| `DATABASE_URL` | Supabase connection string (via the pooler) | Yes |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | For Storage operations | Yes |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Privy app ID | No |
| `PRIVY_APP_SECRET`, `PRIVY_VERIFICATION_KEY` | Access token verification | Yes |
| `SOLANA_RPC_URL` | Devnet RPC | Yes (because it contains an API key) |
| `SOLANA_EXPECTED_GENESIS_HASH` | Devnet genesis hash. Checked against the RPC at startup, and startup stops if it differs | No |
| `PROGRAM_ID` | Address of the deployed program | No |
| `BOUNTY_MINT` | Mint of the reward asset | No |
| `OPERATOR_SECRET_KEY` | Key for fee payment, fund locking, payment, and refund (owner of the treasury) | Yes |
| `VERIFIER_SECRET_KEY` | Key for result finalization (finalize) | Yes |
| `LOCATION_ENC_KEY` | 32-byte key that encrypts the worker's location | Yes |
| `WORKER_REF_SALT` | HMAC key for the worker reference included in the evidence bundle | Yes |
| `INTERNAL_CRON_SECRET` | Shared secret for `/api/internal/tick` | Yes |
| `ADMIN_TOKEN` | Token for the operator API | Yes |
| `WEBHOOK_SIGNING_SECRET_PEPPER` | For deriving Webhook signing keys | Yes |
| `PILOT_BBOX` | Target area (`minLat,minLng,maxLat,maxLng`) | No |
| `MAX_WITNESSES` | Upper limit of `required_witnesses` accepted. 1 until PR-14 | No |
| `ANTHROPIC_API_KEY` | AI image consistency check (P1, optional) | Yes |
| `APP_ENV` | `local`, `preview` or `demo`. The dev settlement stub refuses to start in `demo` | No |

The config's admin key is not placed on Vercel. It is used only when running `scripts/devnet-setup.ts` locally.

## 7. External services and how they are used

| Service | Features used | Does the free tier suffice? |
|---|---|---|
| Privy | Login, automatic Solana embedded wallet creation (`createOnLogin: "users-without-wallets"`) | Enough for the pilot's headcount |
| Supabase | PostgreSQL, Storage, pg_cron, pg_net | Enough |
| Vercel | Hosting, previews | Enough. Cron runs on the Supabase side, so it does not hit Vercel Cron's frequency limit |
| Helius etc. | Devnet RPC | Enough. Public RPCs have strict rate limits, so they are not used in the production demo |
| Circle faucet | Devnet USDC | At 0.5 USDC per request, securing enough for 20 to 40 requests suffices |
