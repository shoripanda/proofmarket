# 09. Database design: keep the 39 tables; migration 0030 adds four things

Written: 2026-10-14 / Authoritative: chapter 04 (table definitions) and `packages/db/src/schema.ts`; migrations in `packages/db/drizzle/`

## 1. Purpose

Confirm how the existing tables and constraints protect the invariants of the state machine and settlement, and gather the changes chapters 04-08 need into one migration.

## 2. Current state

39 tables defined with Drizzle live in PostgreSQL (Supabase; PGlite in tests), with 29 migrations, 0000-0028 (0029 from PR #41 is under review). The tables fall into nine groups by role.

| Group | Tables | Role |
|---|---|---|
| Requesters | principals, requester_credentials, requester_ledger, deposits, x402_wallets, x402_payments, console_sessions | Identity, API keys (hashed), prepaid-balance ledger, deposits, x402 payment records |
| Requests | verification_requests, verification_schedules, verification_challenges, places, place_owner_tokens, place_status_reports | The request (three state axes), recurring checks, challenges to optimistic answers, the shop allow list and self-reports |
| Witnesses | workers, worker_consents, invite_codes, push_subscriptions, payout_adjustments | Privy users, consent, invites, notifications, payout adjustments |
| Work | claims, challenges, uploads, witness_submissions | Claims, nonces, uploads, submissions |
| Evidence and verdicts | evidence_objects, location_observations, evidence_checks, verification_results | Photos (hash, pHash), locations (encrypted), check results, consensus |
| Settlement | payment_records | Chain transactions (kind, array of signatures, confirmation time) |
| Platform | audit_events, idempotency_keys, outbox_jobs, webhook_endpoints, webhook_deliveries, platform_flags, rate_limit_counters | Audit (append-only), idempotency, async jobs, webhooks, flags, rate limits |
| MCP | oauth_clients, oauth_codes, oauth_tokens | OAuth 2.1 |
| Public and sign-up | participation_requests, removal_requests | Sign-up requests, photo removal requests |

Where invariants are protected by constraints — the layer where the DB stops things even if the application has a bug:

- The partial unique index `settle_xor_refund` on `payment_records`: only one of settle or refund can be recorded per request
- `one_credit_back_per_task` on `requester_ledger`: only one of RELEASE or REFUND per request
- `unique (credential_id, idempotency_key_hash)` on `verification_requests`: one key cannot create two requests
- The unique constraint on `outbox_jobs.dedupe_key`: the same job cannot be queued twice
- The SHA-256 unique constraint on `evidence_objects`: the same photo cannot be used twice
- An append-only trigger on `audit_events` (0001): rejects updates and deletes
- RLS on every table (0001, 0004): blocks reads through PostgREST. `migrations.test.ts` checks it on every table
- The primary key `(signature, asset)` on `deposits` (0029, under review): one transaction can carry several currencies

Time columns never rely on DB defaults; `app.now()` is set explicitly (failure log in CLAUDE.md, 2026-10-09). Times in raw SQL are passed as ISO strings (same, 2026-10-08).

## 3. Requirements

Chapters 04-08 need four things, none affecting existing columns or rows:

1. Credential spending limits can be null (04 §4.3)
2. Quotes can be held for 5 minutes (04 §4.2)
3. `x402_enabled` can be added to `platform_flags` (08 §4.3)
4. An index for the request list API (04 §4.1)

## 4. Proposed design: migration 0030

Numbered after PR #41's 0029. If PR #41 is not merged first, skip 0029 and apply 0030 as is (drizzle allows gaps).

```sql
-- 1. Limits may be null (no limit). Existing rows keep their values
ALTER TABLE requester_credentials ALTER COLUMN max_task_amount DROP NOT NULL;
ALTER TABLE requester_credentials ALTER COLUMN daily_spend_limit DROP NOT NULL;

-- 2. Quotes (04 §4.2): keep the body hash and total for 5 minutes
CREATE TABLE verification_quotes (
  id            text PRIMARY KEY,                       -- ULID
  credential_id text NOT NULL REFERENCES requester_credentials(id),
  request_hash  bytea NOT NULL,                         -- SHA-256 of the RFC 8785 body
  asset         text NOT NULL,
  total         numeric(20, 6) NOT NULL CHECK (total > 0),
  created_at    timestamptz NOT NULL,
  expires_at    timestamptz NOT NULL,
  consumed_at   timestamptz,
  verification_id text REFERENCES verification_requests(id)
);
CREATE INDEX verification_quotes_credential_idx ON verification_quotes (credential_id, created_at);
ALTER TABLE verification_quotes ENABLE ROW LEVEL SECURITY;

-- 3. A flag for the x402 window (08 §4.3)
ALTER TABLE platform_flags DROP CONSTRAINT platform_flags_key_chk;
ALTER TABLE platform_flags ADD CONSTRAINT platform_flags_key_chk CHECK (key IN (
  'tasks_create_enabled','claims_enabled','settlement_enabled','public_evidence_enabled',
  'external_review_enabled','x402_enabled'));

-- 4. List API (04 §4.1)
CREATE INDEX vr_credential_created_idx ON verification_requests (credential_id, created_at DESC);
```

Adding `reconciliation_mismatch` (06 §4.2) to `audit_events.event_type` means rebuilding the CHECK in the same migration, since the enumeration lives both in `packages/core/src/domain/enums.ts` and in the CHECK constraint. Recording the reviewer in `evidence_checks.details` (07 §4.4) is inside jsonb and needs no migration.

Quote rows are deleted after 24 hours (in the same step that deletes `idempotency_keys`). A row with `consumed_at` set is linked to its request through `verification_id`.

## 5. Rationale

Quotes get their own table rather than sharing `idempotency_keys`: an idempotency key means "the same request sent again", while a quote means "a different request (the confirm) refers to an earlier one". Putting two meanings in one table makes constraints impossible to write. Null means "no limit" because using 0 for that would be indistinguishable from "up to 0 USDC".

## 6. Alternatives

- Not storing quotes in the DB and returning a signed token (HMAC) instead. Sealing the body hash, total and expiry with an HMAC needs no table, but cannot record whether it was used, so one quote could create two requests. Combined with idempotency keys that is preventable, but splits the logic across two mechanisms; a table is simpler
- Limits on the principal. As in 04 §10, the ledger is per credential, so not this time

## 7. Security considerations

Enable RLS on the new table too. `migrations.test.ts` checks every table, so forgetting fails the test (failure log in CLAUDE.md, 2026-10-04). `verification_quotes.request_hash` is a hash of the body; the body itself is not stored. The quote response includes the balance, but the DB keeps only `total`.

## 8. Implementation issues

- Apply the migration to production **before** the code. Allowing null works with the old code, but the CHECK constraint must change before new code reads `x402_enabled` (the same order as 0026; failure log in CLAUDE.md, 2026-10-09)
- `ALTER TABLE ... DROP CONSTRAINT` works in PGlite tests (proven in 0004)

## 9. Test strategy

The existing checks in `packages/db/test/migrations.test.ts` (RLS on every table, CHECK enumerations matching the code) cover 0030 too. Expiry and consumption of `verification_quotes` are checked by the quote tests in `apps/web/test/requester-api.test.ts`.

## 10. Open questions

- The order of 0029 and 0030 (whether PR #41 is merged first)
- Whether to keep quotes for less than 24 hours (they expire after 5 minutes, so keeping the rows only serves auditing)
