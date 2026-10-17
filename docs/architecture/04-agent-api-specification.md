# 04. Agent API specification: the three routes exist; add a list, quotes and a spending policy

Written: 2026-10-14 / The authoritative sources are `specs/proofmarket/implementation/en/05-api-design.md` and `packages/core/openapi.json`; this chapter designs only the differences

## 1. Purpose

Design the six operations required by section 4.1 of the brief (create a request, list, check status, get the deliverable, approve, check payment status), plus authentication, API key management, rate limiting, permissions and idempotency, against the existing API.

## 2. Current state

Agents have three ways in, all entering the same service layer (`createVerification`, `handleGet` and so on).

| Route | Authentication | Use |
|---|---|---|
| REST `/v1/verifications` | API key (`pm_test_<prefix>_<secret>`) | SDK and scripts |
| MCP `/mcp` (Streamable HTTP) | OAuth 2.1 (dynamic client registration, PKCE); access tokens `pm_oat_` last 1 hour | claude.ai, ChatGPT and Claude Code connectors; 8 tools |
| x402 `/v1/x402/verifications` | The payment itself (no API key) | Agents with their own wallet |

How the six operations map:

| Brief | Implementation | Rating |
|---|---|---|
| Create a request | `POST /v1/verifications`, `/batch` (up to 50), `/v1/schedules` (recurring checks) | Implemented |
| List requests | None. Only `GET /v1/verifications/{id}` and `GET /v1/schedules`; MCP `list_reality_verification_watches` covers watched ones only | Missing |
| Check status | `GET /v1/verifications/{id}`, with status, result, `settlement` and `recheck` | Implemented |
| Get the deliverable | `GET /v1/verifications/{id}/evidence` (5-minute signed URLs to derived images) | Implemented |
| Approve the deliverable | None. Every submission that passes is paid (D-08). Instead, `POST .../dispute` (once, within 24 hours) | Missing (by design) |
| Check payment status | `settlement` in GET (status, signature, explorer_url) | Implemented |

Authentication, idempotency (three layers: `Idempotency-Key` with an RFC 8785 body hash, a unique constraint on `verification_requests`, and Task PDA uniqueness), rate limits (a 1-minute window per credential; 30 per IP for x402; 5 per minute and 3 per day for `/join`) and permissions (`allowed_task_types` and `allowed_bbox` per credential) are implemented; details are in spec chapter 05.

## 3. Requirements

Do not change existing routes or response shapes. Add the following three, each as an optional argument or a new endpoint:

1. A list API for requests
2. A two-step flow: a "quote" that returns the cost first, then a confirm (in both MCP and REST)
3. Checking the spending policy, and a response that reports the result

No "approve" action is added; section 7 explains why.

## 4. Proposed design

### 4.1 List API: `GET /v1/verifications`

Returns the authenticated credential's requests, newest first. Arguments: `status` (one or more), `created_after`, `limit` (default 50, max 200) and `cursor` (a ULID boundary). Response: `{ verifications: [summaries of GetVerificationResponse], next_cursor }`. A summary is limited to `verification_id`, `status`, `settlement.status`, `bounty`, `created_at`, `deadline` and `result.status` (if any); no photo URLs or free-text answers. MCP gains `list_reality_verifications` with the same arguments.

When a principal has several credentials, the list returns only that credential's requests. A list across the whole principal is what the requester console (`/console`) is for; it is not added to the API.

### 4.2 Quote, then confirm

Move eve-pay's pattern — "show the terms → approve → fetch the terms again and compare → execute" — into ProofMarket's create API. Adding `"mode": "quote"` to the create body returns the following without reserving any balance:

```json
{
  "quote_id": "01J...",
  "bounty": { "asset": "USDC", "amount": "0.5", "required_witnesses": 1 },
  "total": "0.5",
  "balance_after": "4.5",
  "policy": { "checked": ["task_type", "location", "deadline", "spend_limit"], "ok": true },
  "expires_at": "2026-10-14T10:05:00Z",
  "reuse": null
}
```

To confirm, send the same body with `"quote_id"`. The server checks that the body hash matches the quote and refuses otherwise with `409 QUOTE_MISMATCH`. A quote expires after 5 minutes. The existing `Idempotency-Key` still applies, and creating without a quote works as before.

In MCP, `confirm: false` on `request_reality_verification` returns only the quote, and calling again with `quote_id` confirms. The tool description says plainly that "omitting `confirm` reserves the balance", giving agent runtimes (Claude's approval features, Eve's `approval`) a place to stop for a person. The x402 window is unchanged: its 402 response already acts as the quote (with a preview).

### 4.3 Spending policy

Check the credential's `max_task_amount` and `daily_spend_limit` at creation, just before the balance check in `createVerification`, and report excess with the existing error codes `TASK_AMOUNT_LIMIT_EXCEEDED` and `DAILY_SPEND_LIMIT_EXCEEDED`. Both columns become nullable, null meaning "no limit" (migration 0030, chapter 09). The decision in PR #14 to drop the limits is preserved by making null the default. Keys issued by `/join` and x402 keep today's 5 USDC and 20 USDC.

The daily total counts RESERVE entries in `requester_ledger` per UTC day, net of RELEASE and REFUND. A monthly limit per principal is not added this time because the ledger is per credential (section 10).

### 4.4 API key management

Keys are issued three ways — `scripts/issue-api-key.ts`, automatically by `/join`, and per payment by x402 — and revoked or suspended through `/v1/admin/credentials/{id}/revoke` and `/suspend`. Missing is **rotation by the requester**: add `POST /v1/credentials/rotate` (replace the authenticated key's secret, the old one expiring after a 24-hour grace period). The `pm_test_` prefix would be issued in the same form on mainnet, so add `pm_live_` and accept both in the regex in `lib/auth/requester.ts`.

### 4.5 Permissions

`allowed_task_types` (which of the 17 types are allowed) and `allowed_bbox` per credential already exist, and MCP and x402 go through the same checks. Webhook destinations are pre-registered and https only. Finer permissions (read-only keys and so on) have not been asked for and are not added.

## 5. Rationale

The quote is a `mode` in the create body rather than a separate endpoint to keep a single check path; x402's preview already works this way (try the create, roll it back). The list uses cursors because ULIDs sort by time, so the `created_at` boundary can be used directly.

## 6. Alternatives

- Adding approve actions (`POST .../approve` and `/reject`). If requesters can stop payment, the threat of refusing to pay for legitimate work (08 §1.1) returns. Keep D-08 and handle complaints through disputes
- Putting the spending policy in the program (limits in Config). Per-requester limits exist only in the off-chain credential, so they stay out of the program. A cap on the treasury total is a separate matter (chapter 05)
- GraphQL or streaming lists. Nobody has asked

## 7. Security considerations

A quote response contains the balance, so it is returned only to the authenticated credential. `quote_id` is an unguessable ULID, and attaching another credential's `quote_id` returns `404`. The list API follows the existing rule of returning `404` to non-owners. The 24-hour grace on rotation keeps automation using the old key from stopping; `revoke` remains immediate.

Not having an "approve" action is the flip side of the brief's "risk of irreversible payments decided by AI alone": withholding approval from requesters protects witnesses. A proposal to add human review by bounty amount was withdrawn on 2026-10-16. Requesters choose their level of assurance through `assurance.level` and the number of witnesses (07 §4.2).

## 8. Implementation issues

- `openapi.json` is generated from zod, so regenerate with `pnpm openapi` after changing a schema (CI checks they match)
- Changing MCP tool descriptions changes what both claude.ai and ChatGPT show; keep the wording in line with the `/developers` page
- The list API needs an index on `verification_requests` `(credential_id, created_at desc)`

## 9. Test strategy

Add to `apps/web/test/requester-api.test.ts`: list (empty, cursor continuation, other people's requests never appear), quote (nothing reserved, expiry, 409 for a different body) and negative tests for the spending policy (per-request excess, daily excess, null means no limit). For MCP, add one `confirm: false` round trip to `mcp-http.test.ts`.

## 10. Open questions

- Whether to add a monthly limit per principal (needs a change to the ledger's unit)
- How much worker-side information (number of witnesses etc.) to show in the list API
- When to switch to the `pm_live_` prefix (naturally, with the move to mainnet)
