# 05. API Design (REST / MCP / Webhook)

Created: 2026-10-02

Adds the details needed for implementation without changing the external contract in `api-contract.md`. Added items are marked "Added".

## 1. Common Items

### 1.1 Endpoint list

| Method | Path | Caller | Priority | Notes |
|---|---|---|---|---|
| POST | `/v1/verifications` | requester | P0 | Idempotency-Key required |
| POST | `/v1/verifications/batch` | requester | P2 | Added (2026-10-08). Up to 50 in one body; all succeed or none (01 §4.25). Idempotency-Key required |
| POST | `/v1/verifications/quote` | requester | P2 | Added (2026-10-15). Returns only the cost and the check results; reserves nothing (2.1b, 01 §4.29) |
| GET | `/v1/verifications` | requester | P2 | Added (2026-10-15). The API key's requests (2.2a) |
| GET | `/v1/verifications/{id}` | requester | P0 | |
| POST | `/v1/verifications/{id}/cancel` | requester | P0 | |
| GET | `/v1/verifications/{id}/evidence` | requester | P1 | Added. Signed URLs to derived images |
| GET | `/v1/worker/me` | worker | P0 | Added |
| POST | `/v1/worker/onboarding` | worker | P0 | Added. Invite code and consent |
| GET | `/v1/worker/tasks` | worker | P0 | |
| GET | `/v1/worker/tasks/{id}` | worker | P0 | Added |
| POST | `/v1/worker/tasks/{id}/claim` | worker | P0 | |
| POST | `/v1/worker/claims/{claim_id}/challenge` | worker | P0 | Added. Issue or reissue the nonce |
| POST | `/v1/worker/claims/{claim_id}/uploads` | worker | P0 | Added. Signed upload URL |
| POST | `/v1/worker/tasks/{id}/evidence` | worker | P0 | Idempotency-Key required |
| POST | `/v1/worker/claims/{claim_id}/abandon` | worker | P0 | Added |
| GET | `/v1/worker/claims/{claim_id}` | worker | P0 | Added. Verdicts and reasons |
| GET | `/v1/worker/payouts` | worker | P1 | Added |
| PUT | `/v1/worker/payout-preference` | worker | P2 | Added (2026-10-04). `{"yen_interest": true}` registers a wish to receive yen (01 §4.10); `/v1/worker/me` returns `yen_payout_interest` |
| GET / PUT / DELETE | `/v1/worker/push-subscription` | worker | P2 | Added (2026-10-04). GET tells whether notifications are available, PUT registers the endpoint and areas (zero areas is allowed, in which case only place-less requests arrive; 01 §4.20), DELETE unsubscribes. Without VAPID keys, GET returns `available: false` |
| POST | `/v1/verifications/{id}/dispute` | requester | P2 | Added (2026-10-04). Once, within 24 hours of the result. Creates a recheck request (01 §4.12). Failure is 409 `DISPUTE_NOT_ALLOWED` |
| POST | `/v1/verifications/{id}/challenge` | requester (any key) | Stretch | Added (2026-10-08). Challenge the provisional answer of an optimistic verification (13 §3, 2.3a here). Idempotency-Key required. Failure is 409 `CHALLENGE_NOT_ALLOWED` |
| POST | `/v1/console/session`, `/v1/console/logout`, `/v1/console/schedules/{id}/stop` | API key / console session | P2 | Added (2026-10-04). Requester console login, logout and stopping recurring checks (01 §4.14). Same Origin only. Login limited to 10 per minute per IP |
| POST / GET | `/v1/schedules` | requester | P2 | Added (2026-10-04). Register and list recurring checks (04 §3.23). 2026-10-05: also used for watch requests with `every_minutes`, `max_runs` and `stop_when` (01 §4.23) |
| DELETE | `/v1/schedules/{id}` | requester | P2 | Added. Stop a recurring check |
| GET | `/v1/public/verifications/{id}` | anyone | P1 | Added. Only the publishable fields |
| GET | `/v1/public/assets` | anyone | P1 | Added (2026-10-14). Reward currencies accepted, with mint and decimals (16 §3.2). Cached about 5 minutes |
| GET | `/v1/public/stats` | anyone | P1 | Added (2026-10-04). The public track record (aggregates only), §4.1. Cached about 60 seconds |
| GET | `/v1/public/dataset`, `/v1/public/dataset.jsonl` | anyone | P2 | Added (2026-10-07). VERIFIED results permitted for publication, machine-readable with their Solana records (01 §4.24). Cached about 60 seconds, up to 1000 |
| GET | `/v1/public/map` | anyone | P2 | Added (2026-10-05). VERIFIED results within 72 hours that the requester published with `publish: true` (01 §4.22). Cached about 60 seconds |
| POST | `/v1/x402/verifications` | x402 payment | P2 | Added (2026-10-04). Create a request by paying USDC, without an API key (01 §4.19, §7) |
| GET / POST | `/v1/store/{token}` | shop link | P2 | Added (2026-10-04). GET returns the shop name and current report; POST files a report (01 §4.13). Up to 10 per minute per token |
| POST | `/v1/public/removal-requests` | anyone | P2 | Added. Requests to remove a photo or stop publication (04 §3.21). Up to 5 per minute per IP |
| POST | `/v1/public/participation-requests` | anyone | P2 | Added. Sign-ups for taking part or for an API key (04 §3.20). Up to 5 per minute per IP |
| POST / GET / DELETE | `/v1/webhooks`, `/v1/webhooks/{id}`, `/v1/webhooks/{id}/test`, `/v1/webhooks/deliveries` | requester | P2 | Added (2026-10-16). Self-service webhook endpoints: register (at most 5 active, secret returned once), list, delete, send a signed test, read the delivery log |
| POST / GET | `/v1/tasks` and below | requester | P2 | Added (2026-10-16). General tasks next to verifications, behind the `tasks_enabled` flag (`docs/architecture/13-marketplace-migration.md` §7) |
| GET / POST | `/v1/worker/market-tasks` and `/v1/worker/market-seats` and below | worker | P2 | Added (2026-10-16). Workers' side of general tasks, behind the same flag |
| POST | `/v1/admin/flags` | operator | P0 | Added |
| POST | `/v1/admin/{credentials|workers}/{id}/suspend` | operator | P0 | Added |
| POST | `/v1/admin/credentials/{id}/revoke` | operator | P0 | Added |
| POST | `/v1/admin/verifications/{id}/evidence/revoke-access` | operator | P0 | Added |
| POST | `/v1/admin/verifications/{id}/feature` | operator | P2 | Added. `{"featured": true}` lists it on the top page, false removes it. Requests without a result cannot be listed |
| POST | `/v1/admin/jobs/{id}/requeue` | operator | P0 | Added. Return a DEAD outbox job to PENDING |
| POST | `/api/internal/tick` | pg_cron | P0 | Added. Treated as not public (shared secret) |

### 1.2 Authentication

| Caller | Header | Verification |
|---|---|---|
| requester | `Authorization: Bearer pm_test_<key_prefix>_<secret>` | Compare SHA-256(secret) with `requester_credentials.secret_hash`. `status = active` and `revoked_at is null`; the principal must be active too |
| worker | `Authorization: Bearer <Privy access token>` | Verify the access token with `@privy-io/node` and look up the worker by `privy_user_id`. Identity tokens are not accepted |
| operator | `Authorization: Bearer <ADMIN_TOKEN>` | Constant-time comparison |
| cron | `X-Internal-Secret: <INTERNAL_CRON_SECRET>` | Constant-time comparison |

Solana secret keys and signatures are not used to authenticate API calls (`api-contract.md` Authentication).

**Spending limits (2026-10-15)**: `max_task_amount` (per request) and `daily_spend_limit` (per Asia/Tokyo day) on `requester_credentials` mean no limit when null (the default, by the owner's decision). When set, they are checked before the balance check in 2.1, and excess is 403 `TASK_AMOUNT_LIMIT_EXCEEDED` / `DAILY_SPEND_LIMIT_EXCEEDED`. The daily total is RESERVE minus RELEASE / REFUND returned the same day, per currency (01 §4.29). Since 2026-10-16 the total includes the 15% platform fee.

### 1.3 Common headers (Added)

| Header | Direction | Content |
|---|---|---|
| `Idempotency-Key` | request | 1-255 characters. Required for creation and evidence submission |
| `X-Request-Id` | response | For matching with logs |
| `RateLimit-Limit` / `RateLimit-Remaining` / `RateLimit-Reset` | response | Rate limit over a 1-minute window |
| `Idempotent-Replayed: true` | response | When a stored response is returned |

### 1.4 Idempotency implementation

1. Insert an `IN_PROGRESS` row into `idempotency_keys` with `(scope, endpoint, SHA-256(key))`
2. If inserted, do the work, store the response and mark it `COMPLETED` (in the same transaction as the work)
3. If a row already exists:
   - different `request_hash` → `409 IDEMPOTENCY_KEY_CONFLICT`
   - `COMPLETED` → return the stored response as is
   - `IN_PROGRESS` → `409 IDEMPOTENCY_IN_PROGRESS` (`retryable: true`)

`request_hash` is the SHA-256 of the body normalised as JSON with RFC 8785, so differences in key order or whitespace count as the same request.

For the create API, the unique constraint on `verification_requests` remains after the `idempotency_keys` row is deleted at 24 hours. The same key with the same body returns the existing request with 200; a different body gets 409 `IDEMPOTENCY_KEY_CONFLICT`.

Idempotency of creation is protected twice over: besides the mechanism above there is `unique (credential_id, idempotency_key_hash)` on `verification_requests`, and the on-chain Task PDA cannot be created twice with the same `task_id_hash`.

### 1.5 Error format

Follows the format in `api-contract.md` §8. Never returns stack traces, SQL, internal IDs or secrets.

```json
{
  "error": {
    "code": "EVIDENCE_OUTSIDE_GEOFENCE",
    "message": "Evidence location does not satisfy task geofence.",
    "retryable": false,
    "details": { "distance_m": 140, "radius_m": 80 }
  }
}
```

## 2. Requester API

### 2.1 POST /v1/verifications

The request body is as in `api-contract.md` §1. The checks below run in order, returning the first failure.

| # | Check | On failure |
|---|---|---|
| 1 | The API key is valid | 401 `UNAUTHENTICATED` / 403 `CREDENTIAL_SUSPENDED` |
| 2 | The `tasks_create_enabled` flag | 503 `FEATURE_DISABLED` |
| 3 | Rate limit | 429 `RATE_LIMITED` |
| 4 | JSON schema (types, required fields, no extra fields) | 400 `VALIDATION_FAILED` |
| 5 | `type` is among the API key's allowed types | 400 `UNSUPPORTED_TASK_TYPE` |
| 6 | `principal_ref` matches the API key's principal | 403 `PRINCIPAL_MISMATCH` |
| 7 | `answer_schema.values` is a subset of the answers for the `type` (01 §4.8), with at least 2. Text types also accept `{ "type": "form", "fields": [...] }` (01 §4.25) | 400 `VALIDATION_FAILED` (with `details.allowed`) |
| 8 | `deadline` is 10 minutes to 24 hours from now; for requests without a place, up to 7 days (168 hours) (01 §4.25) | 400 `DEADLINE_OUT_OF_RANGE` |
| 9 | `radius_m` is 25-500 and `freshness.max_age_seconds` is 60-900 | 400 `VALIDATION_FAILED` |
| 10 | The location is inside the target area (the API key's rectangle, or `PILOT_BBOX`) | 400 `LOCATION_OUT_OF_PILOT_AREA` |
| 10a | The location is within 30 m of an active point in `places` | 400 `LOCATION_NOT_ALLOWLISTED` |
| 11 | `evidence_requirements.photo` and `task_nonce` are true (cannot be turned off in the MVP) | 400 `VALIDATION_FAILED` |
| 12 | `1 ≤ quorum ≤ required_witnesses ≤ MAX_WITNESSES` (1 until PR-14, then 5). `assurance` either gives the numbers directly or chooses `{ "level": "fast" | "standard" | "high" }` (added 2026-10-04): fast = 1 person, standard = 2 agreeing, high = 2 of 3. The level is replaced by the numbers before saving, and GET returns the level matching the numbers | 400 `VALIDATION_FAILED` |
| 13 | `bounty.asset = "USDC"`, `network = "solana-devnet"`, `amount > 0`, at most 6 decimals | 400 `VALIDATION_FAILED` |
| 13b | `bounty.max_amount` (optional) is at least `amount`, at most 6 decimals. `bounty.ramp_minutes` (optional) is 10-1440 and only allowed with `max_amount`; if omitted it is the minutes until the deadline (kept within 10-1440). The totals in 15-17 count `max_amount × people` (13 §1). x402 does not accept `max_amount` | 400 `VALIDATION_FAILED` |
| 13c | Unless `RISING_BOUNTY_ENABLED` is true, refuse `max_amount` (a safety valve until program v1.1 is deployed) | 400 `VALIDATION_FAILED` (`details.reason = "disabled"`) |
| 14 | Policy check on the question (08 §3) | 422 `TASK_POLICY_VIOLATION` (with `details.rule_id`) |
| 13a | `worker_requirements.min_tier` is `standard` or `trusted` (optional, 01 §4.11) | 400 `VALIDATION_FAILED` |
| 14a | With `reuse`, look for a reusable result (01 §4.9). If found, return 200 here and skip 15 onwards | 200 `reused: true` |
| — | Lock the `requester_credentials` row `FOR UPDATE` here (protects 15-17 from concurrent runs) | — |
| 15 | Total ≤ `max_task_amount` | 403 `TASK_AMOUNT_LIMIT_EXCEEDED` |
| 16 | Today's reserved total (Japan-time calendar day) + total ≤ `daily_spend_limit` | 403 `DAILY_SPEND_LIMIT_EXCEEDED` |
| 17 | Balance ≥ total | 402 `INSUFFICIENT_BALANCE` |

Rows 10 and 10a were dropped on 2026-10-04 (01 §4.15): any location is accepted unless the API key has its own rectangle.

When everything passes, the same transaction writes the request (CREATED), the balance reservation (RESERVE), the audit event `request_created` and the outbox job `FUND_TASK`. Response 201:

```json
{
  "verification_id": "ver_01J9Z4K8T3W6Q2M5N7P0R4S8V1",
  "status": "CREATED",
  "created_at": "2026-10-09T03:00:00Z",
  "funding": { "status": "PENDING" }
}
```

### 2.1a POST /v1/verifications/batch (added 2026-10-08)

The body is `{ "template": {...}, "items": [{ "location": {...}, "question": "..." }, ...] }`. `template` is the 2.1 body without `question` and `location` (both may be present; per-item values override them). `items` has 1-50 entries. Each item is overlaid on the template and goes through the 2.1 checks in order; if any fails, the whole call returns 400 or similar and nothing is created (`details.index` gives which item). One idempotency key is accepted, and `<key>#<number>` is used internally per item. Response 201: `{ "verifications": [2.1 responses, ...] }` in the order of `items`.

### 2.1b POST /v1/verifications/quote (added 2026-10-15)

The body is the same as 2.1 (without `quote_id`). No Idempotency-Key needed. Runs every 2.1 check (type, network, answer shape, place, deadline, policy, spending limits), then rolls back without reserving balance or creating a request. A body that would be refused gets the same error as in 2.1.

Response 200: `{ quote_id, bounty: { asset, amount, required_witnesses }, bounty_total, platform_fee: { rate_bps, amount }, total, balance, balance_after, policy: { checked: [...], ok: true }, reuse, expires_at }`. `bounty_total` is `amount × required_witnesses` (the ceiling, computed with `max_amount`, for a rising bounty), and `total` adds the 15% platform fee (since 2026-10-16). `reuse` is the `verification_id` of a shared result that can be returned for free, otherwise null. A quote expires after 5 minutes.

To confirm, send the 2.1 body with `quote_id`. If the RFC 8785 hash of the body (without `quote_id`) differs from the quote's, 409 `QUOTE_MISMATCH`; another key's quote is 404 `QUOTE_NOT_FOUND`; expired or used is 409 `QUOTE_EXPIRED`. 2.1 still works without a quote. In MCP, `confirm: false` on `request_reality_verification` is the quote (§6).

### 2.2a GET /v1/verifications (added 2026-10-15)

Returns the requests made with the API key, newest first. Arguments: `status` (task states, comma-separated), `created_after`, `limit` (default 50, max 200), `cursor` (the previous page's `next_cursor`). Response: `{ verifications: [summaries], next_cursor }`, where a summary is `verification_id`, `type`, `status`, `funding_status`, `settlement_status`, `result_status` (if there is a result), `bounty`, `required_witnesses`, `recheck_of`, `deadline`, `created_at`, `updated_at`. No photo URLs or free-text answers. Requests from other keys of the same principal are not included (the requester console covers that).

### 2.2 GET /v1/verifications/{id}

Requests of other API keys return 404 `VERIFICATION_NOT_FOUND`, without revealing whether they exist. No side effects.

```json
{
  "verification_id": "ver_01J9Z4K8T3W6Q2M5N7P0R4S8V1",
  "type": "PLACE_STATUS_VERIFICATION",
  "status": "SETTLED",
  "question": "Is this shop open right now?",
  "answer_schema": { "type": "enum", "values": ["OPEN", "CLOSED", "UNCLEAR"] },
  "location": { "lat": 35.6595, "lng": 139.7005, "radius_m": 80 },
  "deadline": "2026-10-09T04:00:00Z",
  "assurance": { "required_witnesses": 1, "quorum": 1 },
  "bounty": { "asset": "USDC", "amount": "0.50", "network": "solana-devnet" },
  "witness_progress": { "valid": 1, "active_claims": 0, "open_slots": 0, "required": 1 },
  "funding": {
    "status": "CONFIRMED",
    "signature": "5Kd...",
    "explorer_url": "https://explorer.solana.com/tx/5Kd...?cluster=devnet"
  },
  "result": { "...": "VerificationResult from Section 2.4" },
  "created_at": "2026-10-09T03:00:00Z",
  "updated_at": "2026-10-09T03:14:52Z"
}
```

`result` is `null` until the outcome is decided.

Added 2026-10-09 (01 §4.27): `witness_progress` includes `checking` (submissions AI is checking) and `returned` (submissions sent back by AI review). `summary: { ja, en }` is one paragraph for people, for the agent to pass straight to its user. With `?wait=0-45`, the response waits up to that many seconds until the state (`updated_at`) changes or `result` arrives. With no change it returns the current state as is, never pretending to be done. It counts as one call for rate limiting regardless of the wait.

### 2.3 POST /v1/verifications/{id}/cancel

Accepted under the conditions of T14 and T15 in chapter 03. No body. On success returns 200 with the current state (`CANCELLED`), which moves to `REFUNDED` once the refund completes. Otherwise 409 `TASK_NOT_CANCELLABLE`. If already CANCELLED / REFUNDED, returns the same content with 200 (calling it again gives the same result).

### 2.3a POST /v1/verifications/{id}/challenge (added 2026-10-08)

Challenges the provisional answer of an optimistic verification (13 §3), once, within the challenge window. Anyone with an API key may call it, not only the original requester. Body: `{ "reason"?: string (up to 500 characters) }`.

- Accepted when: `assurance.level` is optimistic, a provisional answer exists (`provisional_at` is set), before `provisional_at + challenge_minutes`, the task is SUBMITTED, and there is no challenge yet. Otherwise 409 `CHALLENGE_NOT_ALLOWED`
- The bond is twice the bounty (the cost of a two-person recheck), reserved from the calling key's balance; the balance, per-request and daily limits are the calling key's
- Creates a recheck shaped like 01 §4.12 (two agreeing, same place, same question, 60-minute deadline). The recheck belongs to the original requester; the challenger sees neither the question nor the place
- Response 201: `{ verification_id, recheck_verification_id, bond: { asset, amount }, state: "challenged" }`. The webhook `verification.challenged` is sent to the original requester

The tick settles the outcome: if the recheck is VERIFIED with an answer different from the provisional one, OVERTURNED; otherwise (agreement, expiry, or the two people disagreeing) UPHELD. Ledger movements:

| When | Challenging key | Original requester |
|---|---|---|
| On challenge | The recheck's RESERVE (−bounty×2, `verification_id` = the recheck) = the bond | No change |
| UPHELD | The bond pays for the recheck. Whatever the recheck does not pay (expiry etc.) returns through RELEASE / REFUND | No change. Any remainder of the bond (always 0 with the current values) goes to the original worker as `payout_adjustments` |
| OVERTURNED | REFUND (+bounty×2, empty `verification_id`) | RESERVE (−bounty×2, empty `verification_id`) |

If the challenger and the original requester are the same key, the two OVERTURNED rows are not written (they net to 0). `verification_id` is empty because of the unique constraint allowing only one RESERVE and one credit-back per request; which challenge a row belongs to is traced through `verification_challenges` and the audit log.

### 2.4 VerificationResult

The shape in `api-contract.md` §7, with additional fields.

`result` in `GET /v1/verifications/{id}` carries `proof` (01 §4.21): `{ "url": "https://<app>/r/<id>", "badge_url": "https://<app>/r/<id>/badge.svg", "markdown": "[![Checked by a person](<badge_url>)](<url>)" }`. Links for showing users; not part of the result_hash calculation.

```json
{
  "verification_id": "ver_01J9Z4K8T3W6Q2M5N7P0R4S8V1",
  "status": "VERIFIED",
  "reason": null,
  "answer": "OPEN",
  "witnesses": { "valid": 1, "required": 1, "quorum": 1 },
  "answer_counts": { "OPEN": 1 },
  "consensus_ratio": 1.0,
  "checks": {
    "geofence": "pass",
    "freshness": "pass",
    "task_nonce": "pass",
    "replay": "pass",
    "media_schema": "pass",
    "duplicate": "not_run",
    "vision_consistency": "not_run"
  },
  "evidence_root": "sha256:9f2c...",
  "result_hash": "sha256:41ab...",
  "attestation": {
    "network": "solana-devnet",
    "signature": "3Hq...",
    "task_account": "7Xn...",
    "explorer_url": "https://explorer.solana.com/tx/3Hq...?cluster=devnet"
  },
  "settlement": {
    "status": "SETTLED",
    "signature": "3Hq...",
    "paid": [{ "witness_ref": "wit_1", "amount": "0.50" }]
  },
  "rejected_submissions": { "EVIDENCE_OUTSIDE_GEOFENCE": 1 },
  "verified_at": "2026-10-09T03:14:31Z"
}
```

- `rejected_submissions` counts failed submissions per reason code (Added). `checks` aggregates only valid submissions, so failed ones are reported here (REQ-V-009)
- `result_hash` is computed from this JSON without `result_hash`, `consensus_ratio`, `attestation`, `settlement` and `verified_at`, normalised (07 §5.2). `consensus_ratio` is left out because it can be derived from `answer_counts`
- `status` is the outcome (`VERIFIED`, `REJECTED`, `EXPIRED`); `reason` is `NO_CONSENSUS` or `INSUFFICIENT_WITNESSES`
- With several witnesses, `checks` aggregates every valid submission's results per item; any `warning` makes it `warning`
- `settlement.status` is `PENDING`, `SUBMITTED`, `SETTLED`, `REFUNDED` or `FAILED_RETRYING`. It never shows `SETTLED` or `REFUNDED` until finalized is confirmed on chain. The internal `settlement_status = CONFIRMED` is shown as `SETTLED` for a payment and `REFUNDED` for a full refund
- In the MVP, finalize and settle are one transaction, so `attestation.signature` and `settlement.signature` are the same (06 §4)
- No confidence percentage (`acceptance-criteria.md` A4)
- `witness_ref` is a sequence number within the task. Worker IDs and public keys are not returned
- With optimistic verification (13 §3), `result` is returned while the answer is provisional, with `provisional: true` and `challenge: { minutes, until, state }`. `state` is open (accepting), closed (ended without a challenge), challenged (recheck running), upheld or overturned. A provisional result's `finalized_at` is the provisional time and is kept when it becomes final (no challenge, or UPHELD), so `evidence_root` and `result_hash` do not change from the provisional stage. `provisional` and `challenge` are not part of `result_hash`

### 2.5 GET /v1/verifications/{id}/evidence (P1)

For valid submissions on the caller's own request, returns signed URLs (valid 5 minutes) to derived images without EXIF. If the `public_evidence_enabled` flag is false, or the operator stopped publication of that request, 403 `EVIDENCE_ACCESS_REVOKED`. No coordinates are returned.

## 3. Worker API

### 3.1 POST /v1/worker/onboarding

```json
{ "invite_code": "PM-7KQ2-XA9D", "consents": { "worker_terms": "2026-10-03", "safety_rules": "2026-10-03", "privacy_notice": "2026-10-03" } }
```

Consumes the invite code, takes the embedded wallet address from Privy's user record and stores it in `workers.payout_pubkey`. The address is never taken from the client. Failure is 403 `INVITE_INVALID`. An unregistered worker calling any other worker API gets 403 `WORKER_NOT_ONBOARDED`.

### 3.2 GET /v1/worker/tasks?lat=&lng=&radius_km=

`radius_km` is 1-20, default 5. The client rounds its position to 3 decimal places (about 100 m) before sending: URLs end up in the hosting access logs, so the exact position is never put in the query. The server does not store the position either (REQ-PR-001).

```json
{
  "tasks": [
    {
      "verification_id": "ver_01J9Z4K8...",
      "question": "Is this shop open right now?",
      "answer_values": ["OPEN", "CLOSED", "UNCLEAR"],
      "location": { "lat": 35.6595, "lng": 139.7005, "radius_m": 80 },
      "distance_m": 420,
      "reward": { "asset": "USDC", "amount": "0.50" },
      "deadline": "2026-10-09T04:00:00Z",
      "freshness_max_age_seconds": 300,
      "open_slots": 1,
      "requirements": ["photo", "location", "task_nonce"],
      "safety_notes_version": "2026-10-03"
    }
  ]
}
```

The requester's name, principal and API key are not returned (`api-contract.md` §4).

With `scope=anywhere`, only requests without a place are returned, nearest deadline first (01 §4.20); `lat` and `lng` are not needed and ignored if sent. Without `scope` it is `nearby`, and `lat` and `lng` are required (400 `VALIDATION_FAILED` if missing). `nearby` lists requests in range followed by place-less requests, as before.

### 3.3 POST /v1/worker/tasks/{id}/claim

No body. Locks the task row and checks `claims_enabled`, the task state, the deadline, open_slots > 0 and that the worker has no existing claim.

```json
{
  "claim_id": "clm_01J9Z5...",
  "status": "CLAIMED",
  "expires_at": "2026-10-09T03:45:00Z",
  "challenge": { "challenge_id": "chl_01J9Z5...", "nonce": "q8V3... (32 random bytes, base64url)", "expires_at": "2026-10-09T03:20:00Z" }
}
```

Failures: 409 `TASK_NOT_CLAIMABLE`, `NO_OPEN_SLOT`, `ALREADY_CLAIMED`; 410 `TASK_EXPIRED`.

### 3.4 POST /v1/worker/claims/{claim_id}/challenge (Added)

Called by the client when the worker arrives and opens the capture screen. Marks the existing ISSUED challenge SUPERSEDED and returns a new nonce, valid for `min(freshness_max_age_seconds, time left on the claim, time left to the deadline)`. If the claim is not ACTIVE, 409 `CLAIM_NOT_ACTIVE`.

### 3.5 POST /v1/worker/claims/{claim_id}/uploads (Added)

```json
{ "challenge_id": "chl_01J9Z5...", "content_type": "image/jpeg", "byte_size": 1834221 }
```

```json
{ "upload_id": "upl_01J9Z6...", "upload_url": "https://<project>.supabase.co/storage/v1/object/upload/sign/evidence-raw/...", "expires_in_seconds": 120, "max_bytes": 8388608 }
```

`content_type` must be `image/jpeg` (the client converts to JPEG before sending; chapter 07); other values are 415 `MEDIA_TYPE_UNSUPPORTED`. A `byte_size` over 8 MiB is 413 `MEDIA_TOO_LARGE`. If the challenge is not ISSUED, 409 `NONCE_INVALID`; if expired, 410 `NONCE_EXPIRED` (get a new nonce). One upload per photo, up to 4 per challenge; the 5th is 400 `VALIDATION_FAILED` (01 §4.18).

### 3.6 POST /v1/worker/tasks/{id}/evidence

The body is as in `api-contract.md` §6. `challenge.nonce` is sent in plain text; the server takes its SHA-256 and compares.

If a preliminary check fails, the submission is not recorded and an error is returned; no attempt is used up.

| Check | Error |
|---|---|
| Authentication, claim owner, claim ACTIVE | 403 `FORBIDDEN` / 409 `CLAIM_NOT_ACTIVE` |
| The task is accepting and before its deadline | 410 `TASK_EXPIRED` |
| The nonce matches this claim's ISSUED challenge | 400 `NONCE_INVALID` / 409 `NONCE_USED` |
| The 1-4 uploads in `evidence` are all PENDING uploads of this claim, and `upload.challenge_id` matches the nonce's challenge (01 §4.18) | 404 `UPLOAD_NOT_FOUND` / 400 `NONCE_INVALID` |
| `answer` is among the choices | 400 `ANSWER_INVALID` |

The nonce's validity is not checked here. Running out of time is recorded by the next check, `freshness`, as `EVIDENCE_STALE` and counts as one attempt (the nonce was valid when the upload URL was obtained).

Once the preliminary checks pass, the submission is recorded and the checks in chapter 07 run. Pass or fail is returned in a 200 body, not as an HTTP error.

```json
{
  "submission_id": "sub_01J9Z7...",
  "state": "INVALID",
  "reason_code": "EVIDENCE_OUTSIDE_GEOFENCE",
  "reason_message_ja": "<Japanese message: taken 140 m from the shop; move within 80 m of the shop and retake>",
  "retryable": true,
  "attempts_remaining": 2,
  "claim_state": "ACTIVE",
  "checks": { "task_nonce": "pass", "freshness": "pass", "geofence": "fail", "media_schema": "not_run", "replay": "not_run", "duplicate": "not_run" }
}
```

### 3.7 Other

- `POST /v1/worker/claims/{claim_id}/abandon`: marks an ACTIVE claim ABANDONED; otherwise returns the current state as is
- `GET /v1/worker/claims/{claim_id}`: the claim's state, the verdict and reason per submission, and the task's result (when the worker's submission is valid)
- `GET /v1/worker/payouts`: tasks the worker was paid for, amounts, status and Explorer URLs

## 4. Public API and Operator API

`GET /v1/public/verifications/{id}` returns the VerificationResult of 2.4 without: per-submission information beyond the `checks` breakdown, the question, the location, evidence URLs, text answers (`answers`), AI review records (`reviews`) and `proof`. It adds the type (`type`) and the answer kind (`answer_kind`) (01 §4.21). For requests where the requester set `publish: true`, `published` also contains the question, place and shop name (01 §4.22); otherwise `published: null`. Only people who know the ID can see it; there is no list API.

As an exception, the site's top page (S-01) lists only results the operator has "featured" (added 2026-10-04). The operator decides one by one with `POST /v1/admin/verifications/{id}/feature`, so a requester's request never appears without their knowledge. The fields shown are a subset of the public result above: answer, status, number of witnesses, agreement, time finalised, settlement status and Explorer URL. No list API; the page reads them server-side.

### 4.1 Public track record (added 2026-10-04)

To show judges and prospective workers how many requests were actually completed by people and how much was paid, the site's `/stats` (S-11) and `GET /v1/public/stats` show the same aggregates. No authentication; cached about 60 seconds on both the server and the response.

- Shown: total requests and completed ones (state VERIFIED or SETTLED), the number of workers with valid submissions, the number of requesting principals, total USDC paid to workers in confirmed payments, the median time from request to result (VERIFIED ones), the `vision_consistency` breakdown (pass, fail, warning; not_run not counted), requests accepted and completed per type, daily completions over the last 14 days in Japan time, and the last 10 confirmed payments
- For the last 10, only the type, time finalised, number of valid witnesses and the payment's Explorer URL. Request IDs are not shown, and a link to the result page `/r/{id}` is added only for results the operator featured (the exception above), keeping the rule that only people who know the ID can see a result
- Not shown: the question, answer, location, photos, worker IDs, receiving addresses, requester names, AI review reasons

Operator APIs are used for incident response in 08 §6. All are recorded in audit_events with `actor_type = operator`.

## 5. Webhook (P1)

- Destinations are registered in advance by the operator (`scripts/register-webhook.ts`), and since 2026-10-16 also by requesters themselves (`POST /v1/webhooks`). https only, no IP literals, no sending if DNS resolves to a private, loopback or link-local address, no following redirects, 5-second timeout
- Events: the 7 in `api-contract.md` §11 plus `verification.cancelled` (cancellation, including failed funding), 8 in all. On 2026-10-08 `verification.provisional` (a provisional answer is out) and `verification.challenged` (a challenge was made) were added for optimistic verification (13 §3). On 2026-10-16, `task.*` events were added for general tasks (`docs/architecture/13-marketplace-migration.md` §7.3)
- Signature header: `ProofMarket-Signature: t=<unix seconds>,v1=<hex(HMAC-SHA256(secret, t + "." + body))>`. Receivers discard anything off by 5 minutes or more
- `ProofMarket-Event-Id: evt_...` for de-duplication; retries reuse the same ID
- Up to 6 retries (30 seconds, 2 minutes, 10 minutes, 30 minutes, 1 hour, 2 hours). Webhook failures never touch settlement

Body:

```json
{ "id": "evt_01J9Z8...", "type": "verification.settled", "created_at": "2026-10-09T03:15:02Z", "data": { "verification_id": "ver_01J9Z4K8...", "status": "SETTLED" } }
```

The full result is not in the body; receivers fetch it again with GET (so a leaked signing secret cannot be used to forge results).

## 6. MCP (P1)

`packages/mcp` is an MCP server over stdio that reads the env vars `PROOFMARKET_API_KEY`, `PROOFMARKET_BASE_URL` and `PROOFMARKET_PRINCIPAL_REF` and calls REST through `packages/sdk`.

| Tool | API | Input |
|---|---|---|
| `request_reality_verification` | POST /v1/verifications | The create body. `principal_ref` is optional (filled from `PROOFMARKET_PRINCIPAL_REF`). `idempotency_key` is optional; if omitted, the SHA-256 of the normalised arguments is used. With `wait_seconds` (0-45) it waits after creation until the state changes and also returns `verification` (with `summary`) (01 §4.27) |
| `get_reality_verification` | GET /v1/verifications/{id} | `verification_id`, `wait_seconds` (0-45; waits up to that long for a state change). The description and `note` tell the agent to pass `summary` to the user as is (01 §4.27) |
| `cancel_reality_verification` | POST /v1/verifications/{id}/cancel | `verification_id` |
| `dispute_reality_verification` | POST /v1/verifications/{id}/dispute | `verification_id`, `reason`, `assurance`, `deadline_minutes` (01 §4.12) |

The description of `request_reality_verification` (registered in English as is):

> Ask a real human witness to check a fact about a public physical place (for example, whether a shop is open right now). This is asynchronous: a person must travel to the location, so results typically take 10–60 minutes. This tool returns a verification_id immediately; call get_reality_verification to read the result. Never assume or invent the outcome before the result status is VERIFIED, REJECTED or EXPIRED. Types: PLACE_STATUS_VERIFICATION (answers OPEN / CLOSED / UNCLEAR), QUEUE_LENGTH (NO_QUEUE / SHORT_QUEUE = up to about 5 people / LONG_QUEUE = 6 or more / UNCLEAR, people queuing outside), NOTICE_POSTED (POSTED / NOT_POSTED / UNCLEAR, whether the notice named in the question is posted at the storefront). An API key may allow only some types.

When a tool cannot wait long enough, it returns the current state as is and never pretends to be done (`api-contract.md` §10).

### 6.1 MCP over HTTP (added 2026-10-03)

The stdio version only works on the machine running it. To let AI agents on other people's PCs and phones make requests, the same tools are served over HTTP from the web app.

- The entry is `POST /mcp`: MCP Streamable HTTP, stateless. GET and DELETE return 405
- Authentication is `Authorization: Bearer <API key>`, the same key as REST, with suspension, revocation, rate limits and idempotency judged by the same rules. Without a key, or with an invalid one, 401 with `WWW-Authenticate: Bearer`
- If `principal_ref` is omitted, the key owner's principal is filled in
- The tools match the stdio version. Internally they call the REST handlers in the same process, so the rules live in one place
- `get_reality_verification` waits up to 20 seconds, so this function's execution limit is 60 seconds
- The Claude and ChatGPT mobile apps have no field for an API key and connect with OAuth, added in 6.2
- Added 2026-10-15 (`docs/architecture/` 02 §4.3, the owner's decision): for the ChatGPT Apps SDK, the resource `ui://widget/verification.html` (`text/html+skybridge`) is published, and `_meta` on `request_reality_verification` and `get_reality_verification` points to it with `openai/outputTemplate`. ChatGPT renders this HTML in an iframe and shows the state, summary, answer, AI review and proof link from `window.openai.toolOutput` (the tool's `structuredContent`). The HTML loads no external scripts or images. Other clients such as claude.ai ignore `_meta` and use the JSON as is
- Added 2026-10-15: `list_reality_verifications` (§2.2a) and `confirm: false` on `request_reality_verification` (§2.1b). Added 2026-10-16: tools for general tasks (`create_task`, `get_task`, `list_tasks`, `list_task_applications`, `decide_task_application`, `decide_task_seat`, `cancel_task`, `task_messages`), listed only while `tasks_enabled` is on

### 6.2 OAuth for phone AI apps (added 2026-10-03)

The Claude and ChatGPT apps connect following the MCP authorisation spec (OAuth 2.1). ProofMarket also acts as the authorisation server, and the user enters the API key once when connecting.

| Entry | Role |
|---|---|
| `GET /.well-known/oauth-protected-resource` | Returns `resource` (`<BASE>/mcp`) and the authorisation server (`<BASE>`) (RFC 9728) |
| `GET /.well-known/oauth-authorization-server` | Returns each endpoint, `code_challenge_methods_supported: ["S256"]` and `token_endpoint_auth_methods_supported: ["none"]` (RFC 8414) |
| `POST /oauth/register` | Dynamic client registration (RFC 7591). Public clients only. `redirect_uris` must be https, or `http://localhost` / `http://127.0.0.1`; 1-5 of them. Up to 10 per minute per IP |
| `GET /oauth/authorize` | The consent screen: shows the client's name and the return host, and asks for the API key. If `client_id` or `redirect_uri` is invalid, the error is shown there instead of redirecting |
| `POST /oauth/authorize` | Checks the API key by the REST rules and redirects back with an authorisation code (10 minutes, single use). `code_challenge` (S256) is required |
| `POST /oauth/token` | Handles `authorization_code` (verifying PKCE) and `refresh_token` |

- Access tokens (`pm_oat_…`) last 1 hour and refresh tokens (`pm_ort_…`) 30 days; only hashes are stored. Refresh tokens rotate on every use, and if a used one comes back, every token of that connection is invalidated
- Tokens are bound to the issuing API key: suspending or revoking the key disables them at once. Rate limits, daily limits and policy are shared with the key
- `/mcp` accepts both API keys and access tokens. A 401 carries `WWW-Authenticate: Bearer resource_metadata="<BASE>/.well-known/oauth-protected-resource"`
- When a `resource` parameter (RFC 8707) arrives, it must match `<BASE>/mcp`
- The consent screen sets `frame-ancestors 'none'` so other sites cannot embed it. Consent is recorded in the audit log as `oauth_granted` (the key's first 8 characters and the client name)
- Tables: `oauth_clients` (registered clients), `oauth_codes` (hashes of authorisation codes), `oauth_tokens` (token hashes, expiry, revocation, and `grant_id` grouping one connection)

## 7. x402 V2 (implemented 2026-10-04)

The original plan used it only for topping up the balance (`POST /v1/balance/topup`). On 2026-10-04 it became a window where the request itself is paid with x402 (01 §4.19): with top-ups only, an agent still has to get an API key, losing the benefit of using it without signing up. The rule separating payment from escrow (`architecture.md` §6) is kept: the payment enters the ledger as a TOPUP, and funding the escrow is a separate FUND_TASK transaction as before.

`POST /v1/x402/verifications`

- Body: `POST /v1/verifications` without `principal_ref` (`X402CreateVerificationRequestSchema`)
- Without payment: 402, with the same `PaymentRequired` in the body and the `PAYMENT-REQUIRED` header (base64). `accepts` has one entry:

```json
{
  "scheme": "exact",
  "network": "solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1",
  "amount": "500000",
  "asset": "<BOUNTY_MINT>",
  "payTo": "<operator public key>",
  "maxTimeoutSeconds": 60,
  "extra": { "feePayer": "<operator public key>" }
}
```

- With payment: the client resends the same body with a `PaymentPayload` in `PAYMENT-SIGNATURE` (`payload.transaction` is the partially signed transaction in base64)
  - Success: 201. Header `PAYMENT-RESPONSE` (`success: true`, `transaction` = the transaction signature, `network`, `payer`). The body is the create response plus `api_key` and `payment` (`signature`, `explorer_url`, `network`, `payer`, `amount`) (`X402CreateVerificationResponseSchema`)
  - The same payment resent: 200 with the same verification_id and `api_key: null`
  - Verification or sending failed: 402 with `PAYMENT-REQUIRED` and `PAYMENT-RESPONSE` (`success: false`, `errorReason`). `errorReason` is `invalid_payment_requirements`, `invalid_exact_svm_payload_*` (instructions, compute_price, fee_payer, mint, recipient_mismatch, amount_mismatch, memo), `insufficient_funds` (no source account), `invalid_transaction_state` (sending failed) and so on. An unreadable header is 400 `invalid_payload`
  - Mistakes in the request content: returned before payment in the normal error format (§1.5)
- Header names follow x402 v2's HTTP transport. V1's `X-PAYMENT` is not implemented (REQ-P-007)
- The official `@x402/svm` is not used; verification and sending are our own code in `packages/solana/src/x402.ts`, to fit the existing settlement code on web3.js v1 and Anchor. The checks follow the MUSTs of `scheme_exact_svm.md` (coinbase/x402 main as of 2026-10-04)
- Since 2026-10-16 the amount includes the 15% platform fee

## 8. Error Code List

| Code | HTTP | retryable | Where |
|---|---|---|---|
| `UNAUTHENTICATED` | 401 | false | Everywhere |
| `FORBIDDEN` | 403 | false | Everywhere |
| `CREDENTIAL_SUSPENDED` | 403 | false | requester |
| `PRINCIPAL_MISMATCH` | 403 | false | Creation |
| `WORKER_NOT_ONBOARDED` | 403 | false | worker |
| `INVITE_INVALID` | 403 | false | Registration |
| `VALIDATION_FAILED` | 400 | false | Everywhere |
| `UNSUPPORTED_TASK_TYPE` | 400 | false | Creation |
| `DEADLINE_OUT_OF_RANGE` | 400 | false | Creation |
| `LOCATION_OUT_OF_PILOT_AREA` | 400 | false | Creation |
| `LOCATION_NOT_ALLOWLISTED` | 400 | false | Creation |
| `TASK_POLICY_VIOLATION` | 422 | false | Creation |
| `TASK_AMOUNT_LIMIT_EXCEEDED` | 403 | false | Creation |
| `DAILY_SPEND_LIMIT_EXCEEDED` | 403 | true | Creation (retry the next day) |
| `INSUFFICIENT_BALANCE` | 402 | false | Creation |
| `RATE_LIMITED` | 429 | true | Everywhere |
| `IDEMPOTENCY_KEY_CONFLICT` | 409 | false | Creation, submission |
| `IDEMPOTENCY_IN_PROGRESS` | 409 | true | Creation, submission |
| `PAYMENT_IN_PROGRESS` | 409 | true | x402 (the same payment is being sent) |
| `PAYMENT_ALREADY_USED` | 409 | false | x402 (the payment was used for another request) |
| `VERIFICATION_NOT_FOUND` | 404 | false | requester, worker |
| `TASK_NOT_CANCELLABLE` | 409 | depends | Cancellation |
| `EVIDENCE_ACCESS_REVOKED` | 403 | false | Getting evidence |
| `TASK_NOT_CLAIMABLE` | 409 | false | Claim |
| `NO_OPEN_SLOT` | 409 | true | Claim |
| `DISPUTE_NOT_ALLOWED` | 409 | false | Dispute (no result, past 24 hours, already disputed; 01 §4.12) |
| `CHALLENGE_NOT_ALLOWED` | 409 | false | Challenge to an optimistic verification (not optimistic, no provisional answer yet, window passed, already challenged; 13 §3) |
| `WORKER_NOT_ELIGIBLE` | 403 | false | Claim (trust tier below the request's condition; 01 §4.11) |
| `ALREADY_CLAIMED` | 409 | false | Claim |
| `TASK_EXPIRED` | 410 | false | worker |
| `CLAIM_NOT_ACTIVE` | 409 | false | worker |
| `NONCE_INVALID` | 400 | false | Upload, submission |
| `NONCE_USED` | 409 | false | Submission |
| `NONCE_EXPIRED` | 410 | true | Challenge, upload |
| `UPLOAD_NOT_FOUND` | 404 | false | Submission |
| `ANSWER_INVALID` | 400 | false | Submission |
| `MEDIA_TYPE_UNSUPPORTED` | 415 | false | Upload |
| `MEDIA_TOO_LARGE` | 413 | false | Upload |
| `FEATURE_DISABLED` | 503 | true | Everywhere (operator flags) |
| `INTERNAL_ERROR` | 500 | true | Everywhere |

Codes added later (quotes, webhooks, general tasks) are defined in `packages/core/src/errors.ts` and listed in `packages/core/openapi.json`.

The verdict reason codes returned in the 200 body of the submission API (`EVIDENCE_STALE`, `LOCATION_ACCURACY_TOO_LOW`, `EVIDENCE_OUTSIDE_GEOFENCE`, `MEDIA_TYPE_UNSUPPORTED`, `MEDIA_TOO_LARGE`, `MEDIA_DECODE_FAILED`, `EVIDENCE_REPLAYED`, `EVIDENCE_NEAR_DUPLICATE`) are in 07 §3.
