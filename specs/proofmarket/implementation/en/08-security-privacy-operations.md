# 08. Security, Privacy, and Operations Design

> English translation. The Japanese version in [`../ja/08-security-privacy-operations.md`](../ja/08-security-privacy-operations.md) is authoritative; if they differ, the Japanese version wins.

Created: 2026-10-02

For each threat in `privacy-security.md`, this chapter maps which mechanism in which component stops it.

## 1. Threats and Countermeasures

### 1.1 Malicious Requester

| Threat | Countermeasure | Where implemented |
|---|---|---|
| Requests for stalking or surveillance | Allowlist of task types, banned words in the question text, answer choices fixed to OPEN/CLOSED/UNCLEAR, bounding box of the target region | Checks 5, 7, 10, 14 in Chapter 05 Section 2.1 |
| Sending a worker to a dangerous or private place | Allowlist of public shops registered by the operator (rejected unless within 30 m), radius of 500m or less, the worker can abandon at any time | Check 10a in Chapter 05 Section 2.1, Chapter 01 Section 4.4 |
| Hiding dangerous instructions in free text | Question text of 280 characters or fewer, banned words, shown as plain text on the worker screen (not interpreted as HTML) | `packages/core/src/policy` |
| Mass submission of tiny tasks | Per-API-key rate limit, per-task cap, daily cap, and balance | Chapter 04 Sections 3.2 and 3.19 |
| Refusing to pay for legitimate work | The requester has no authority to approve. Payment is automatic once verification passes | Chapter 01 Section 4.2 |
| Use with no accountable party | An API key is always tied to a principal. Issuance is by script only | Chapter 04 Section 3.2 |

### 1.2 Malicious Worker

| Threat | Countermeasure |
|---|---|
| Old photo | In-app camera only, time limit from nonce issuance |
| Photo from a different place | Geofence and accuracy limit (stated explicitly that spoofing cannot be detected) |
| Reusing the same photo | SHA-256 unique constraint (across all tasks), dHash (P1) |
| Multiple accounts | Invitation-only, one worker per Privy account, unique constraint on `payout_pubkey` |
| Collusion | Multiple witnesses (P1). The 1 witness of the MVP cannot prevent it, and this is shown honestly in the result as `witnesses.valid = 1` |

### 1.3 Malicious Evidence Files

| Threat | Countermeasure |
|---|---|
| Huge files | Rejected at 8 MiB when the signed URL is issued. The server also checks the size before reading |
| Corrupt images and polyglots | First-byte check, sharp's `limitInputPixels`, only the derived image is exposed externally |
| Metadata | Dropped by re-encoding. The original EXIF is encrypted and kept for 30 days |
| Prompt injection via text in the image | The AI check of the image (optional) accepts only enumerated values and is not used for pass/fail. Text from the image is never passed into the context of a privileged agent |

### 1.4 Attacks on the API

| Threat | Countermeasure |
|---|---|
| API key theft | Stored as SHA-256, revocation API, rate limit, daily cap |
| Replay and abuse of idempotency keys | Chapter 05 Section 1.4. A different body returns 409 |
| Webhook spoofing | HMAC signature and timestamp; the body carries no result and the receiver re-fetches with GET |
| SSRF via callback URL | Pre-registration only, https only, no sending to private addresses, no redirects |
| Viewing someone else's request | 404 for anyone other than the owner |
| Phishing that imitates the OAuth consent page | The consent page lives only on our domain, shows the client name and redirect host, and tells users not to enter a key for a connection they did not start. `frame-ancestors 'none'` |
| Open redirect through OAuth | Exact match against registered `redirect_uri`; invalid requests are never redirected |
| Theft of OAuth tokens | 1-hour access tokens, stored as hashes; refresh tokens rotate and a reuse revokes the whole grant |
| XSS | React's default escaping. `dangerouslySetInnerHTML` is not used. CSP is set |

### 1.5 Attacks on Payment

| Threat | Countermeasure |
|---|---|
| Double payment | On-chain state (Chapter 06 Section 3.1), unique constraint on `payment_records`, outbox `dedupe_key` |
| Wrong recipient or mint | settle checks the ATA and mint, mint allowlist in Config |
| Refund after payment, payment after refund | refund only from Funded, settle only from Finalized |
| Key abuse | operator and verifier are separate. The admin key is not kept on the server. Does not start against a Mainnet RPC |
| Key leakage to the client | `server-only` on modules that read keys. CI checks that built client JS contains no key-shaped strings |

## 2. Keys and Secrets

- Use disposable Devnet-only keys (`privacy-security.md` Section 7). Never use the same keys on Mainnet
- Keys, API keys, and `.env*` go into `.gitignore`, and gitleaks runs in pre-commit and CI (`acceptance-criteria.md` A6)
- Logs may contain up to the first 8 characters of an API key, the Privy user ID, and the `verification_id`; they must not contain tokens, plaintext nonces, coordinates, or keys. The logger has a masking rule
- The requester's API key and the Solana signing keys are managed by separate mechanisms

## 3. Policy Check of Request Content

Rules are listed with IDs in `packages/core/src/policy/rules.ts`, and the response says which rule caused the rejection. The rule version is recorded per request as `policy_rule_version`.

| Rule ID | Content | Corresponding prohibition (REQ-T-002) |
|---|---|---|
| `TYPE_ALLOWLIST` | Rejects anything other than `PLACE_STATUS_VERIFICATION` | General |
| `PERSON_TRACKING` | Words such as "whether so-and-so is there" (「誰々がいるか」), "follow" (「後をつける」), "face" (「顔」), "lives at" (「住んでいる」) | Tracking or identifying individuals |
| `PRIVATE_RESIDENCE` | "Home" (「自宅」), "address" (「住所」), "apartment" (「アパート」), "apartment unit" (「マンションの部屋」), etc. | Private residences |
| `TRESPASS` | "Go inside" (「中に入って」), "back door" (「裏口」), "no entry" (「立入禁止」), etc. | Trespassing |
| `WEAPONS_DRUGS` | Words for weapons, drugs, and regulated items | Weapons and drugs |
| `SEXUAL` | Words for sexual services | Sexual content |
| `PROFESSIONAL_JUDGMENT` | Words asking for a diagnosis, legal judgment, or investment judgment | Professional judgment |
| `HARASSMENT` | Words for threats and harassment | Harassment |
| `DANGER` | "In a typhoon" (「台風の中」), "railway tracks" (「線路」), "roof" (「屋根」), etc. | Dangerous actions |
| `EVASION` | "Police" (「警察」), "avoiding surveillance cameras" (「監視カメラを避けて」), etc. | Evading law enforcement or access control |
| `MINORS` | "Children" (「子ども」), "elementary school students" (「小学生」), "in front of a school" (「学校の前」), etc. | Children and minors (`privacy-security.md` Section 4) |
| `COVERT_RECORDING` | "Without being noticed" (「気づかれずに」), "secret photo" (「隠し撮り」), etc. | Covert recording |
| `IMPERSONATION` | "Pretending to be a customer" (「客のふりをして」), "posing as a store clerk" (「店員を装って」), etc. | Impersonation |

Word lists are kept in both Japanese and English. Banned-word matching is done after Unicode normalization (NFKC) and lowercasing.

Keyword matching has gaps, so the MVP supplements it with three things. First, the locations a request can target are limited to public shops registered by the operator (REQ-X-T-104). Second, the choices are fixed, so the only thing a worker does is "photograph the storefront and answer with one of 3 choices." Third, it is a closed pilot used only by invited requesters. The question text is free text written by the requester, so it is never passed to any place that interprets it as a system instruction (such as an LLM prompt) (REQ-T-003).

## 4. Privacy

| Data | Reason for collecting | Who can see it | Retention |
|---|---|---|---|
| Worker email address | Login | Privy and the operator | While the account exists |
| Worker payout address | Payment | The operator. It appears in on-chain transfers and is the same value across tasks, so it can be linked in an Explorer (Chapter 00 G-11) | While the account exists |
| Current location during list search | Sort by nearest | No one (rounded to about 100 m on the client before sending, and not stored) | Not stored |
| Location at submission | Geofence check | Operator only (encrypted) | 30 days |
| Photo (original) | Verification, incident investigation | Operator only | 30 days |
| Photo (derived) | Showing evidence to the requester (P1) | The requesting requester and the operator | 30 days |
| Verification result and hashes | Audit | The requester, public page (partial) | 1 year |

There is no API that returns a worker's location, home, or movement history to a requester (REQ-PR-002). However, the payout address is public on-chain, so the privacy policy and the worker terms state clearly that "the reward payout address, and which task a payment was received for, can be seen by anyone on the public blockchain," and consent is obtained. The privacy policy and worker terms are prepared in Japanese, and consent is obtained at first registration (REQ-X-W-101).

## 5. Monitoring and Logging

- Logs are one JSON line each. They include `level`, `msg`, `request_id`, `verification_id`, `actor_type`, and `duration_ms`
- The `event_type` values of audit_events are the 13 types in `architecture.md` Section 7, plus `submission_rejected`, `claim_abandoned`, and `operator_action`
- Within the tick, count the following and emit a warning log when a threshold is exceeded: outbox jobs that became DEAD, payments left PENDING for more than 10 minutes, the operator's SOL balance, and drift between the treasury balance and the ledger

## 6. Responding to Failures and Incidents

This maps the "must be able to do" list in `privacy-security.md` Section 8 to the means.

| Action | Means | Estimated time |
|---|---|---|
| Stop a requester | `POST /v1/admin/credentials/{id}/suspend` | 1 minute |
| Stop a worker | `POST /v1/admin/workers/{id}/suspend` (in-progress claims become EXPIRED) | 1 minute |
| Stop new tasks | `POST /v1/admin/flags { "key": "tasks_create_enabled", "value": false }` | 1 minute |
| Stop payments | Likewise, set `settlement_enabled` to false. Chain jobs in the outbox wait | 1 minute |
| Revoke an API key | `POST /v1/admin/credentials/{id}/revoke` | 1 minute |
| Identify affected requests | A SQL query that searches audit_events by `actor_ref` is prepared in `docs/runbook.md` | 10 minutes |
| Stop evidence disclosure | `POST /v1/admin/verifications/{id}/evidence/revoke-access`; for everything, set `public_evidence_enabled` to false | 1 minute |
| Rerun a DEAD job | Fix the cause, then `POST /v1/admin/jobs/{id}/requeue` | 5 minutes |
| A key leaked | Replace operator / verifier with `update_config`, update the Vercel environment variables, and move the old key's Devnet funds | 30 minutes |

Even when `settlement_enabled` is set to false, verification and result retrieval continue. Tasks that are VERIFIED wait with settlement left PENDING, and are processed in order after it is re-enabled.

## 7. To Resolve Before Going to Production

The following are not handled in the MVP and must be resolved before Mainnet and real funds (`legal-checklist.md`).

- How the platform holding prepaid balances and escrow is treated under the Payment Services Act and crypto-asset-related regulations (D-05)
- Disclosure of worker reward terms (the Act on Fair Transactions for Freelancers and Business Operators, etc.) and the tax treatment of payments
- Handling of third parties captured in photos, and the procedure for responding to deletion requests
- Production values for retention periods
