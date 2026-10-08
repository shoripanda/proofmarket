# Incident: the tick returned 500 for 3 hours; settlements stalled (2026-10-08)

Status: fixed in PR #16 (`fix/tick-date-binding`). Written 2026-10-09.

## Summary

From 13:29 UTC on 2026-10-08 (22:29 JST) the once-a-minute maintenance call `POST /api/internal/tick` failed with HTTP 500 on every run. The tick is what drains the outbox jobs, so nothing that depends on a job happened: no `FINALIZE_AND_SETTLE` (worker payout), no `NOTIFY_WORKERS` (push), no deadline expiry. Two verifications that had reached `VERIFIED` with a passing AI review sat at "確定待ち" (awaiting settlement) in the worker's payout screen for about three hours. `FUND_TASK` jobs still ran because the create route kicks them inline.

Root cause: the optimistic-verification step added that evening (PR #10) bound a JavaScript `Date` directly into a raw `` sql`…` `` fragment. The production driver (postgres-js) serialises an unannotated `Date` with `toString()` — `"Thu Oct 08 2026 16:40:00 GMT+0000 (Coordinated Universal Time)"` — which Postgres cannot parse as a timestamp. The test database (PGlite) serialises the same value as ISO 8601, so the test suite passed. Because the failing step ran second in the tick and nothing caught it, every later step was skipped.

## Impact

- Two VERIFIED verifications (5 USDC each, one witness) were not settled for ~3 h. No money was lost; the escrow held the funds and the jobs were still `PENDING` with `attempts = 0`.
- Four `NOTIFY_WORKERS` pushes were never sent (the tasks had already been taken, so no one missed work).
- No deadline-driven expiry ran during the window. No task was due in that window.
- Public pages, the requester API, MCP and x402 were unaffected.

## Timeline (UTC)

| Time | Event |
|---|---|
| 13:16 | PR #11 (onboarding) merged; deploy healthy, tick still 200 |
| 13:26 | PR #10 (optimistic verification) merged |
| 13:29 | First 500 from the tick (Supabase `net._http_response`); 178 consecutive 200s before, 182 consecutive 500s after |
| 15:50–16:22 | Two tasks created, submitted, reviewed (pass) and marked VERIFIED; their `FINALIZE_AND_SETTLE` jobs queued |
| 16:27 | Owner reports payouts stuck at "確定待ち" |
| 16:30 | DB read: jobs `PENDING`, `attempts = 0`; pg_cron succeeding; tick responding 500 |
| 16:40 | `vercel logs` shows the failing query and the `toString()`-formatted parameter |
| 16:52 | Fix pushed (PR #16) |

## How it was found

1. The worker screen showed `PENDING` payouts; the DB showed their verifications were `VERIFIED` with results written, so the failure was after the verdict.
2. `outbox_jobs` had the settlement jobs `PENDING` with zero attempts: the drain had never leased them.
3. `cron.job_run_details` said every minute "succeeded, 1 row" — pg_cron only records that it *sent* the HTTP request. `net._http_response` held the real answer: `status_code 500` since 13:29.
4. Hand-running the step's SQL with the production driver succeeded, which ruled out the SQL text; a local Next run reproduced a different error (empty database), a false lead.
5. The Vercel runtime-logs HTTP API returned nothing; `npx vercel logs https://proofmarket.fun --token … --scope curio-lang --json` streamed the function log, which printed the query and its parameters: `params: SUBMITTED,Thu Oct 08 2026 16:40:00 GMT+0000 …`.

## Fix (PR #16)

- `apps/web/lib/services/challenge-service.ts`: bind `now.toISOString()::timestamptz` instead of the `Date` (the convention `jobs.ts` already followed).
- `apps/web/lib/services/jobs.ts`: every tick step runs in its own `try/catch`; a failing step is logged as `tick_step_failed` and named in the response's `failed` array; the deadline loop isolates each task; the job drain always runs.
- `apps/web/lib/http.ts`: unhandled errors now log the `cause` chain. Drizzle wraps driver errors as `Failed query: …` and the real reason was invisible.
- `apps/web/test/tick-isolation.test.ts`: a step that throws is reported and the jobs still drain.
- `CLAUDE.md` failure ledger: one line.

## Why the tests did not catch it

The suite runs on PGlite, which encodes `Date` parameters as ISO text. postgres-js, used in production, does not add a type to an unannotated `Date` in a raw fragment and falls back to `String(value)`. Drizzle's typed column helpers (`lte(column, date)`) map the value through the column's `mapToDriverValue` and are safe; only hand-written `` sql`…` `` fragments are exposed.

## Follow-ups

- [ ] Health signal: `/v1/health` should report the age of the last successful tick; an external monitor should alert when it exceeds a few minutes (the audit of 2026-10-08 listed this).
- [ ] A lint or review rule: no `Date` inside `` sql`…` `` fragments; always `toISOString()`.
- [ ] Consider running one integration test file against a real Postgres (Docker) in CI, since driver behaviour differs from PGlite.
- [ ] Vercel log access: the HTTP runtime-logs endpoint did not stream for us; keep the CLI invocation above in the runbook.
