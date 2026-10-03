# 05. API Design (REST / MCP / Webhook)

> English translation. The Japanese version in [`../ja/05-api-design.md`](../ja/05-api-design.md) is authoritative; if they differ, the Japanese version wins.

Created: 2026-10-02

This chapter adds the details needed for implementation without changing the external contract in `api-contract.md`. Items that were added are marked "Added".

## 1. Common Items

### 1.1 Endpoint list

| Method | Path | Caller | Priority | Notes |
|---|---|---|---|---|
| POST | `/v1/verifications` | requester | P0 | Idempotency-Key required |
| GET | `/v1/verifications/{id}` | requester | P0 | |
| POST | `/v1/verifications/{id}/cancel` | requester | P0 | |
| GET | `/v1/verifications/{id}/evidence` | requester | P1 | Added. Signed URL for the derived image |
| GET | `/v1/worker/me` | worker | P0 | Added |
| POST | `/v1/worker/onboarding` | worker | P0 | Added. Invite code and consent |
| GET | `/v1/worker/tasks` | worker | P0 | |
| GET | `/v1/worker/tasks/{id}` | worker | P0 | Added |
| POST | `/v1/worker/tasks/{id}/claim` | worker | P0 | |
| POST | `/v1/worker/claims/{claim_id}/challenge` | worker | P0 | Added. Issue / reissue a nonce |
| POST | `/v1/worker/claims/{claim_id}/uploads` | worker | P0 | Added. Signed upload URL |
| POST | `/v1/worker/tasks/{id}/evidence` | worker | P0 | Idempotency-Key required |
| POST | `/v1/worker/claims/{claim_id}/abandon` | worker | P0 | Added |
| GET | `/v1/worker/claims/{claim_id}` | worker | P0 | Added. Decision result and reason |
| GET | `/v1/worker/payouts` | worker | P1 | Added |
| GET | `/v1/public/verifications/{id}` | Anyone | P1 | Added. Only fields that may be made public |
| POST | `/v1/public/removal-requests` | Anyone | P2 | Added. Requests to remove or stop showing a photo (04 §3.21). 5 per minute per IP |
| POST | `/v1/public/participation-requests` | Anyone | P2 | Added. Sign-up for workers and API keys (04 §3.20). 5 per minute per IP |
| POST | `/v1/admin/flags` | operator | P0 | Added |
| POST | `/v1/admin/{credentials|workers}/{id}/suspend` | operator | P0 | Added |
| POST | `/v1/admin/credentials/{id}/revoke` | operator | P0 | Added |
| POST | `/v1/admin/verifications/{id}/evidence/revoke-access` | operator | P0 | Added |
| POST | `/v1/admin/verifications/{id}/feature` | operator | P2 | Added. `{"featured": true}` lists it on the top page, false removes it. Tasks without a result cannot be featured |
| POST | `/v1/admin/jobs/{id}/requeue` | operator | P0 | Added. Returns a DEAD outbox job to PENDING |
| POST | `/api/internal/tick` | pg_cron | P0 | Added. Treated as not publicly exposed (shared secret) |

### 1.2 Authentication

| Caller | Header | Verification |
|---|---|---|
| requester | `Authorization: Bearer pm_test_<key_prefix>_<secret>` | Compare SHA-256(secret) with `requester_credentials.secret_hash`. `status = active` and `revoked_at is null`. The principal must also be active |
| worker | `Authorization: Bearer <Privy access token>` | Verify the access token with `@privy-io/node`, then look up the worker by `privy_user_id`. Identity tokens are not accepted |
| operator | `Authorization: Bearer <ADMIN_TOKEN>` | Constant-time comparison |
| cron | `X-Internal-Secret: <INTERNAL_CRON_SECRET>` | Constant-time comparison |

Solana secret keys and signatures are not used for API authentication (`api-contract.md` Authentication).

### 1.3 Common headers (Added)

| Header | Direction | Content |
|---|---|---|
| `Idempotency-Key` | Request | 1 to 255 characters. Required for creation and evidence submission |
| `X-Request-Id` | Response | For matching against logs |
| `RateLimit-Limit` / `RateLimit-Remaining` / `RateLimit-Reset` | Response | Rate limit with a 1-minute window |
| `Idempotent-Replayed: true` | Response | When a stored response is returned |

### 1.4 Idempotency implementation

1. Insert an `IN_PROGRESS` row into `idempotency_keys` with `(scope, endpoint, SHA-256(key))`
2. If the insert succeeds, perform the processing, store the response, and set the row to `COMPLETED` (in the same transaction as the processing)
3. If a row already exists:
   - `request_hash` differs → `409 IDEMPOTENCY_KEY_CONFLICT`
   - `COMPLETED` → return the stored response as is
   - `IN_PROGRESS` → `409 IDEMPOTENCY_IN_PROGRESS` (`retryable: true`)

`request_hash` is the SHA-256 of the body JSON normalized with RFC 8785. Differences in key order or whitespace are treated as the same request.

For the creation API, the unique constraint on `verification_requests` remains even after the `idempotency_keys` row is deleted at 24 hours. With the same key and the same body, the existing request is returned with 200; if the body differs, 409 `IDEMPOTENCY_KEY_CONFLICT` is returned.

Idempotency of creation is protected twice. In addition to the mechanism above, `verification_requests` has `unique (credential_id, idempotency_key_hash)`, and furthermore the on-chain Task PDA cannot be created twice with the same `task_id_hash`.

### 1.5 Error format

Follow the format in Section 8 of `api-contract.md`. Stack traces, SQL, internal IDs, and secrets are not returned.

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

The request body is as in Section 1 of `api-contract.md`. The following checks are performed from top to bottom, and the first one that fails is returned.

| # | Check | On failure |
|---|---|---|
| 1 | API key is valid | 401 `UNAUTHENTICATED` / 403 `CREDENTIAL_SUSPENDED` |
| 2 | `tasks_create_enabled` flag | 503 `FEATURE_DISABLED` |
| 3 | Rate limit | 429 `RATE_LIMITED` |
| 4 | JSON schema (types, required fields, no extra fields) | 400 `VALIDATION_FAILED` |
| 5 | `type` is among the task types allowed for the API key | 400 `UNSUPPORTED_TASK_TYPE` |
| 6 | `principal_ref` matches the API key's principal | 403 `PRINCIPAL_MISMATCH` |
| 7 | `answer_schema.values` is a subset of `OPEN`, `CLOSED`, `UNCLEAR` and has 2 or more entries | 400 `VALIDATION_FAILED` |
| 8 | `deadline` is at least 10 minutes and at most 24 hours from now | 400 `DEADLINE_OUT_OF_RANGE` |
| 9 | `radius_m` is 25 to 500 and `freshness.max_age_seconds` is 60 to 900 | 400 `VALIDATION_FAILED` |
| 10 | Location is inside the target area (the API key's bounding box, or `PILOT_BBOX` if none) | 400 `LOCATION_OUT_OF_PILOT_AREA` |
| 10a | Location is within 30 m of an active point in `places` | 400 `LOCATION_NOT_ALLOWLISTED` |
| 11 | `evidence_requirements.photo` and `task_nonce` are true (cannot be turned off in the MVP) | 400 `VALIDATION_FAILED` |
| 12 | `1 ≤ quorum ≤ required_witnesses ≤ MAX_WITNESSES` (1 until PR-14, 5 afterward). `assurance` either gives the counts directly or picks `{ "level": "fast" | "standard" | "high" }` (added 2026-10-04): fast = 1 witness, standard = 2 agreeing, high = 2 of 3. The level is replaced by counts before storage; GET returns the level matching the counts | 400 `VALIDATION_FAILED` |
| 13 | `bounty.asset = "USDC"`, `network = "solana-devnet"`, `amount > 0`, at most 6 decimal places | 400 `VALIDATION_FAILED` |
| 14 | Policy check of the question text (Chapter 08, Section 3) | 422 `TASK_POLICY_VIOLATION` (with `details.rule_id`) |
| — | Here, lock the `requester_credentials` row with `FOR UPDATE` (protects 15 to 17 from concurrent execution) | — |
| 15 | Total ≤ `max_task_amount` | 403 `TASK_AMOUNT_LIMIT_EXCEEDED` |
| 16 | Today's (Japan-time calendar day) reserved total + total ≤ `daily_spend_limit` | 403 `DAILY_SPEND_LIMIT_EXCEEDED` |
| 17 | Balance ≥ total | 402 `INSUFFICIENT_BALANCE` |

If all checks pass, in the same transaction, write the request creation (CREATED), the balance reservation (RESERVE), the audit_events `request_created`, and the outbox `FUND_TASK`. The response is 201.

```json
{
  "verification_id": "ver_01J9Z4K8T3W6Q2M5N7P0R4S8V1",
  "status": "CREATED",
  "created_at": "2026-10-09T03:00:00Z",
  "funding": { "status": "PENDING" }
}
```

### 2.2 GET /v1/verifications/{id}

A request that belongs to another API key returns 404 `VERIFICATION_NOT_FOUND`, so even its existence is not leaked. There are no side effects.

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

### 2.3 POST /v1/verifications/{id}/cancel

Accepted under the conditions of T14 and T15 in Chapter 03. No body is needed. On success it returns 200 with the current state (`CANCELLED`), and moves on to `REFUNDED` once the refund is done. If the conditions are not met, it returns 409 `TASK_NOT_CANCELLABLE`. If the request is already CANCELLED / REFUNDED, it returns the same content with 200 (calling it any number of times gives the same result).

### 2.4 VerificationResult

This adds extra fields to the shape in Section 7 of `api-contract.md`.

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

- `rejected_submissions` counts the submissions that failed the decision, per reason code (Added). `checks` aggregates only valid submissions, so information about failed submissions is returned here (REQ-V-009)
- `result_hash` is computed by normalizing this JSON after removing `result_hash`, `consensus_ratio`, `attestation`, `settlement`, and `verified_at` (Chapter 07, Section 5.2). `consensus_ratio` can be derived from `answer_counts`, so it is not included
- `status` is the outcome (`VERIFIED`, `REJECTED`, `EXPIRED`). `reason` is `NO_CONSENSUS` or `INSUFFICIENT_WITNESSES`
- When there are multiple witnesses, `checks` aggregates the decisions of all valid submissions per item. If even one is `warning`, the result is `warning`
- The values of `settlement.status` are `PENDING`, `SUBMITTED`, `SETTLED`, `REFUNDED`, and `FAILED_RETRYING`. It does not become `SETTLED` or `REFUNDED` until finalized is confirmed on-chain. The internal `settlement_status = CONFIRMED` is shown as `SETTLED` for a payment and as `REFUNDED` for a full refund
- In the MVP, finalize and settle are combined into one transaction, so `attestation.signature` and `settlement.signature` have the same value (Chapter 06, Section 4)
- No confidence percentage is shown (`acceptance-criteria.md` A4)
- `witness_ref` is a sequence number within the task. The worker's ID and public key are not returned

### 2.5 GET /v1/verifications/{id}/evidence (P1)

For the valid submissions of the requester's own request, returns signed URLs (valid for 5 minutes) of the derived images with EXIF removed. If the `public_evidence_enabled` flag is false, or for a request whose disclosure the operator has stopped, it returns 403 `EVIDENCE_ACCESS_REVOKED`. Coordinates are not returned.

## 3. Worker API

### 3.1 POST /v1/worker/onboarding

```json
{ "invite_code": "PM-7KQ2-XA9D", "consents": { "worker_terms": "2026-10-03", "safety_rules": "2026-10-03", "privacy_notice": "2026-10-03" } }
```

Consumes the invite code, fetches the embedded wallet address from the Privy user information, and stores it in `workers.payout_pubkey`. The address is not accepted from the client. Failure is 403 `INVITE_INVALID`. If an unregistered worker calls any other worker API, it returns 403 `WORKER_NOT_ONBOARDED`.

### 3.2 GET /v1/worker/tasks?lat=&lng=&radius_km=

`radius_km` is 1 to 20, default 5. The client rounds the current location to 3 decimal places (about 100 m) before sending it. The URL remains in the hosting access logs, so the exact location is not put in the query. The server also does not store the location it receives (REQ-PR-001).

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

The requester's name, principal, and API key are not returned (Section 4 of `api-contract.md`).

### 3.3 POST /v1/worker/tasks/{id}/claim

No body is needed. Lock the task row and check `claims_enabled`, the task state, the deadline, open_slots > 0, and that the same worker has no existing claim.

```json
{
  "claim_id": "clm_01J9Z5...",
  "status": "CLAIMED",
  "expires_at": "2026-10-09T03:45:00Z",
  "challenge": { "challenge_id": "chl_01J9Z5...", "nonce": "q8V3... (32 random bytes, base64url)", "expires_at": "2026-10-09T03:20:00Z" }
}
```

Failures are 409 `TASK_NOT_CLAIMABLE`, `NO_OPEN_SLOT`, `ALREADY_CLAIMED`, and 410 `TASK_EXPIRED`.

### 3.4 POST /v1/worker/claims/{claim_id}/challenge (Added)

The client calls this when the worker arrives on site and opens the capture screen. It sets the existing ISSUED challenge to SUPERSEDED and returns a new nonce. The validity period is `min(freshness_max_age_seconds, remaining time of the claim, remaining time until the deadline)`. If the claim is not ACTIVE, it returns 409 `CLAIM_NOT_ACTIVE`.

### 3.5 POST /v1/worker/claims/{claim_id}/uploads (Added)

```json
{ "challenge_id": "chl_01J9Z5...", "content_type": "image/jpeg", "byte_size": 1834221 }
```

```json
{ "upload_id": "upl_01J9Z6...", "upload_url": "https://<project>.supabase.co/storage/v1/object/upload/sign/evidence-raw/...", "expires_in_seconds": 120, "max_bytes": 8388608 }
```

`content_type` must be `image/jpeg` only (the client converts to JPEG before sending; Chapter 07). Any other value returns 415 `MEDIA_TYPE_UNSUPPORTED`. If `byte_size` exceeds 8 MiB, it returns 413 `MEDIA_TOO_LARGE`. If the challenge is not ISSUED, it returns 409 `NONCE_INVALID`; if it has expired, 410 `NONCE_EXPIRED` (fetch a new nonce).

### 3.6 POST /v1/worker/tasks/{id}/evidence

The body is as in Section 6 of `api-contract.md`. `challenge.nonce` is sent in plaintext, and the server takes its SHA-256 and compares it.

If a preliminary check fails, the error is returned without recording the submission. The remaining attempts are not reduced either.

| Check | Error |
|---|---|
| Authentication, claim ownership, claim is ACTIVE | 403 `FORBIDDEN` / 409 `CLAIM_NOT_ACTIVE` |
| Task is accepting submissions and before the deadline | 410 `TASK_EXPIRED` |
| The nonce matches this claim's ISSUED challenge | 400 `NONCE_INVALID` / 409 `NONCE_USED` |
| The upload is PENDING for this claim, and `upload.challenge_id` matches the challenge of the nonce being used | 404 `UPLOAD_NOT_FOUND` / 400 `NONCE_INVALID` |
| `answer` is among the choices | 400 `ANSWER_INVALID` |

The nonce's validity period is not checked here. A timeout is recorded as `EVIDENCE_STALE` by the next decision, `freshness`, and counts as 1 attempt (because the nonce was valid when the upload URL was obtained).

If the preliminary checks pass, the submission is recorded and the decision in Chapter 07 is performed. The pass or fail of the decision is returned in the 200 body, not as an HTTP error.

```json
{
  "submission_id": "sub_01J9Z7...",
  "state": "INVALID",
  "reason_code": "EVIDENCE_OUTSIDE_GEOFENCE",
  "reason_message_ja": "店舗から 140 m 離れた位置で撮影されています。店舗の 80 m 以内に近づいて撮り直してください。",
  "retryable": true,
  "attempts_remaining": 2,
  "claim_state": "ACTIVE",
  "checks": { "task_nonce": "pass", "freshness": "pass", "geofence": "fail", "media_schema": "not_run", "replay": "not_run", "duplicate": "not_run" }
}
```

The `reason_message_ja` value is a Japanese UI string shown to the worker and is kept in Japanese. In English: "The photo was taken 140 m away from the shop. Move within 80 m of the shop and take it again."

### 3.7 Other

- `POST /v1/worker/claims/{claim_id}/abandon`: If the claim is ACTIVE, sets it to ABANDONED. Otherwise returns the current state as is
- `GET /v1/worker/claims/{claim_id}`: The claim's state, the decision for each submission, the reason, and the task's result (when the worker's own submission is valid)
- `GET /v1/worker/payouts`: The tasks for which the worker was paid, the amounts, the states, and Explorer URLs

## 4. Public API and Operator API

`GET /v1/public/verifications/{id}` returns the VerificationResult in Section 2.4 with the following removed: per-submission information other than the breakdown in `checks`, the question text, the location, and evidence URLs. It assumes that only people who know the ID can view it, and no list API is built.

As an exception, the site's top page (S-01) lists only results the operator has marked as featured (added 2026-10-04). The operator decides each one with `POST /v1/admin/verifications/{id}/feature`, so a requester's task never appears there without their knowledge. The listed fields are a subset of the public result above: answer, status, witness counts, consensus ratio, verified time, settlement status and Explorer URL. There is still no list API; the page reads them on the server.

The operator API is used for the incident response in Chapter 08, Section 6. All calls are recorded in audit_events with `actor_type = operator`.

## 5. Webhook (P1)

- Destinations are pre-registered by the operator (`scripts/register-webhook.ts`). https only, direct IP addresses are not allowed, nothing is sent if the DNS-resolved address is private, loopback, or link-local, redirects are not followed, and the timeout is 5 seconds
- Events are the 7 types in Section 11 of `api-contract.md` plus `verification.cancelled` (a cancellation, including cancellation caused by a funding failure), for 8 types in total
- Signature header: `ProofMarket-Signature: t=<unix seconds>,v1=<hex(HMAC-SHA256(secret, t + "." + body))>`. The receiver discards anything that is off by 5 minutes or more
- `ProofMarket-Event-Id: evt_...` is attached for deduplication. Resends use the same ID
- Resends are made up to 6 times (30 seconds, 2 minutes, 10 minutes, 30 minutes, 1 hour, 2 hours). A webhook failure never affects settlement in any way

Body:

```json
{ "id": "evt_01J9Z8...", "type": "verification.settled", "created_at": "2026-10-09T03:15:02Z", "data": { "verification_id": "ver_01J9Z4K8...", "status": "SETTLED" } }
```

The body does not include the whole result. The receiver fetches it again with GET (so that the result cannot be forged even if the signing key leaks).

## 6. MCP (P1)

`packages/mcp` is an MCP server that runs over stdio. It reads the environment variables `PROOFMARKET_API_KEY`, `PROOFMARKET_BASE_URL` and `PROOFMARKET_PRINCIPAL_REF` and calls REST through `packages/sdk`.

| Tool | Corresponding API | Input |
|---|---|---|
| `request_reality_verification` | POST /v1/verifications | The body of the creation API. `principal_ref` is optional (filled in from the `PROOFMARKET_PRINCIPAL_REF` environment variable). `idempotency_key` is optional; if omitted, the SHA-256 of the normalized JSON of the arguments is used |
| `get_reality_verification` | GET /v1/verifications/{id} | `verification_id`, `wait_seconds` (0 to 20. If specified, waits up to that many seconds for the state to change before returning) |
| `cancel_reality_verification` | POST /v1/verifications/{id}/cancel | `verification_id` |

Description text of `request_reality_verification` (registered as is, in English):

> Ask a real human witness to check a fact about a public physical place (for example, whether a shop is open right now). This is asynchronous: a person must travel to the location, so results typically take 10–60 minutes. This tool returns a verification_id immediately; call get_reality_verification to read the result. Never assume or invent the outcome before the result status is VERIFIED, REJECTED or EXPIRED.

If the tool could not wait long enough, it also returns the current state as is and does not pretend the verification is complete (Section 10 of `api-contract.md`).

### 6.1 MCP over HTTP (added 2026-10-03)

The stdio server only works on the machine that runs it. To let AI agents on other people's computers and phones place requests, the web app exposes the same tools over HTTP.

- Endpoint: `POST /mcp`, MCP Streamable HTTP, stateless. GET and DELETE return 405
- Auth: `Authorization: Bearer <API key>`. Same keys as REST; suspension, revocation, rate limits and idempotency follow the REST rules. A missing or invalid key returns 401 with `WWW-Authenticate: Bearer`
- When `principal_ref` is omitted it is filled with the key owner's principal
- The three tools are the same as the stdio server. They call the REST handlers in the same process, so the rules live in one place
- `get_reality_verification` may wait up to 20 s, so the function's max duration is 60 s
- The Claude and ChatGPT phone apps have no field for an API key and connect with OAuth instead; that is added in 6.2

### 6.2 OAuth for phone AI apps (added 2026-10-03)

The Claude and ChatGPT apps connect through the MCP authorization spec (OAuth 2.1). ProofMarket also acts as the authorization server; the user enters their API key once when connecting.

| Endpoint | Role |
|---|---|
| `GET /.well-known/oauth-protected-resource` | Returns `resource` (`<BASE>/mcp`) and the authorization server (`<BASE>`) (RFC 9728) |
| `GET /.well-known/oauth-authorization-server` | Returns the endpoints, `code_challenge_methods_supported: ["S256"]` and `token_endpoint_auth_methods_supported: ["none"]` (RFC 8414) |
| `POST /oauth/register` | Dynamic client registration (RFC 7591). Public clients only. `redirect_uris` must be https, or `http://localhost` / `http://127.0.0.1`; 1 to 5 of them. 10 per minute per IP |
| `GET /oauth/authorize` | Consent page. Shows the client name and the redirect host and asks for the API key. An invalid `client_id` or `redirect_uri` is shown as an error on the page and never redirected |
| `POST /oauth/authorize` | Checks the API key with the REST rules and redirects back with an authorization code (10 minutes, single use). `code_challenge` (S256) is required |
| `POST /oauth/token` | Handles `authorization_code` (PKCE verified) and `refresh_token` |

- Access tokens (`pm_oat_…`) last 1 hour, refresh tokens (`pm_ort_…`) 30 days. Only hashes are stored. Refresh tokens rotate on every use; if a used one comes back, every token of that grant is revoked
- Tokens are bound to the issuing API key. Suspending or revoking the key stops them immediately. Rate limits, daily limits and policy are shared with the key
- `/mcp` accepts either the API key or an access token. A 401 carries `WWW-Authenticate: Bearer resource_metadata="<BASE>/.well-known/oauth-protected-resource"`
- When the `resource` parameter (RFC 8707) is present it must equal `<BASE>/mcp`
- The consent page sends `frame-ancestors 'none'`. Each grant is audited as `oauth_granted` (key prefix and client name)
- Tables: `oauth_clients` (registered clients), `oauth_codes` (authorization code hashes), `oauth_tokens` (token hashes, expiry, revocation, and `grant_id` grouping one connection)

## 7. x402 V2 (Stretch)

x402 is used only for deposits into the balance and is kept separate from the per-task escrow (Section 6 of `architecture.md`).

- `POST /v1/balance/topup` (Added): If there is no payment, it returns 402 with a `PAYMENT-REQUIRED` header. When the client resends with `PAYMENT-SIGNATURE`, the server verifies and settles the payment, returns `PAYMENT-RESPONSE`, and records a TOPUP in `requester_ledger`
- The scheme is `exact`, and the network is CAIP-2 `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` (Devnet)
- The server uses `@x402/core` and `@x402/svm`. The V1 `X-PAYMENT` header is not implemented (REQ-P-007)
- Before implementing, check the latest specification at `https://solana.com/docs/payments/agentic-payments/x402`

## 8. Error Code List

| Code | HTTP | retryable | Where it occurs |
|---|---|---|---|
| `UNAUTHENTICATED` | 401 | false | All |
| `FORBIDDEN` | 403 | false | All |
| `CREDENTIAL_SUSPENDED` | 403 | false | requester |
| `PRINCIPAL_MISMATCH` | 403 | false | Creation |
| `WORKER_NOT_ONBOARDED` | 403 | false | worker |
| `INVITE_INVALID` | 403 | false | Onboarding |
| `VALIDATION_FAILED` | 400 | false | All |
| `UNSUPPORTED_TASK_TYPE` | 400 | false | Creation |
| `DEADLINE_OUT_OF_RANGE` | 400 | false | Creation |
| `LOCATION_OUT_OF_PILOT_AREA` | 400 | false | Creation |
| `LOCATION_NOT_ALLOWLISTED` | 400 | false | Creation |
| `TASK_POLICY_VIOLATION` | 422 | false | Creation |
| `TASK_AMOUNT_LIMIT_EXCEEDED` | 403 | false | Creation |
| `DAILY_SPEND_LIMIT_EXCEEDED` | 403 | true | Creation (can be retried the next day) |
| `INSUFFICIENT_BALANCE` | 402 | false | Creation |
| `RATE_LIMITED` | 429 | true | All |
| `IDEMPOTENCY_KEY_CONFLICT` | 409 | false | Creation, submission |
| `IDEMPOTENCY_IN_PROGRESS` | 409 | true | Creation, submission |
| `VERIFICATION_NOT_FOUND` | 404 | false | requester, worker |
| `TASK_NOT_CANCELLABLE` | 409 | Depends on the situation | Cancellation |
| `EVIDENCE_ACCESS_REVOKED` | 403 | false | Evidence retrieval |
| `TASK_NOT_CLAIMABLE` | 409 | false | Claim |
| `NO_OPEN_SLOT` | 409 | true | Claim |
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
| `FEATURE_DISABLED` | 503 | true | All (operator flag) |
| `INTERNAL_ERROR` | 500 | true | All |

The reason codes for decisions that the submission API returns in the 200 body (`EVIDENCE_STALE`, `LOCATION_ACCURACY_TOO_LOW`, `EVIDENCE_OUTSIDE_GEOFENCE`, `MEDIA_TYPE_UNSUPPORTED`, `MEDIA_TOO_LARGE`, `MEDIA_DECODE_FAILED`, `EVIDENCE_REPLAYED`, `EVIDENCE_NEAR_DUPLICATE`) are in Chapter 07, Section 3.
