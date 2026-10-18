# 01. Requirements Definition

Created: 2026-10-02

## 1. Purpose and target outcome

An AI agent asks over a REST API "is this shop open right now?", and receives a JSON answer decided from a photo and location taken on site by a real person; the decision and the payment of the reward are recorded on Solana Devnet. This runs with real people and real shops at submission time on 10/12.

The level met at submission follows the fallback levels in `mvp-plan.md`.

| Level | Content | Treatment |
|---|---|---|
| Level A | REST, one worker, on-site photo, geofence, nonce, Devnet records, structured result | Must have. No work that breaks this |
| Level B | MCP, multiple witnesses and quorum, near-duplicate image detection, webhooks | Target by 10/8 |
| Level C | x402 V2, worker reputation, multiple regions | If time allows |

## 2. Scope

### In scope

- One task type, `PLACE_STATUS_VERIFICATION`
- Answer choices `OPEN | CLOSED | UNCLEAR`
- Evidence: one or more photos, location, time, a nonce tied to the task
- Escrow (locking funds), recording the result (attestation), payment and refund on Devnet
- A smartphone web app for workers (no native app)
- A REST API for requesters; MCP server and webhooks at P1
- A public result page for judges and third parties (no photos)
- A demo agent (a small script that calls REST and branches its next action on the result)

### Out of scope

In addition to the out-of-scope list in `requirements.md` §6, the following are not built:

- A management screen for requesters (the API and public result pages suffice)
- A management screen for the operator (replaced by admin APIs and scripts)
- Real-money operation on Mainnet (disabled as a feature until `legal-checklist.md` is cleared)
- Computing worker reputation scores (only the record is kept)

## 3. Roles

| Role | Who | Authentication | Can do |
|---|---|---|---|
| Requester | An AI agent, or its developer | API key (Bearer) | Create, get and cancel verification requests; get evidence images (P1) |
| Responsible Principal | The person or company responsible for a requester | None (bound when the API key is issued) | The accountable party when the operator issues an API key |
| Worker | An invited human witness | Privy login (email or Google) | Browse, claim, capture, submit and abandon tasks; view payout history |
| Operator | The platform operator | Admin token | Suspend requesters and workers, freeze new tasks, stop settlement, revoke API keys, stop evidence publication |
| Verifier | The verification process inside the server | None (internal) | Check evidence, compute consensus, finalise on chain |
| Public viewer | Judges and third parties | None | View public result pages and Solana Explorer |

An API key is always bound to one Responsible Principal (`users-and-stakeholders.md` §3). No API key is issued without one.

## 4. Decisions on ambiguous points

Operating rules the existing spec left open are set below, judged by two criteria: fairness to workers, and letting the agent branch on the result alone.

### 4.1 Reward amount

`bounty.amount` is the reward per witness. At creation, `amount × required_witnesses` is reserved from the requester's balance and put into the on-chain escrow. A platform fee column exists (`verification_requests.platform_fee_amount`, migration 0027). Since 2026-10-16, a 15% fee is added on top of the bounty and kept only for the witnesses who are paid (`docs/architecture/13-marketplace-migration.md` §6).

### 4.2 What is paid

A submission that passes every check (chapter 07) is called valid. A worker who made a valid submission is paid one share, regardless of whether their answer is the majority or whether the task reached consensus. Submissions that fail checks are not paid.

There are two reasons. If people who honestly answer UNCLEAR or hold a minority view are not paid, there is an incentive to follow the majority and verification loses meaning. And the worker has finished work that met the conditions (corresponding to stating the reward and rejection rules, `legal-checklist.md` §1).

### 4.3 Computing consensus

- Consensus is computed when `required_witnesses` valid submissions are in, or at the deadline
- If the most common answer has `quorum` or more votes and is unique, the result is VERIFIED with that answer
- Otherwise REJECTED (reason `NO_CONSENSUS`)
- If valid submissions have not reached `quorum` by the deadline, EXPIRED (reason `INSUFFICIENT_WITNESSES`)
- UNCLEAR counts as one value like any other answer. If UNCLEAR meets the quorum, the result is "VERIFIED / UNCLEAR"
- No early finalisation on reaching `quorum` in the MVP (what to do with workers already on the way is undecided; P2)

`required_witnesses = quorum = 1` is the default, and P0 works with this setting alone.

### 4.4 Cancellation

A requester can cancel only while there are zero active claims and zero valid submissions. Before funds are locked it ends as CANCELLED; after, it goes through CANCELLED to a full refund and REFUNDED. Cancellation while a worker is on the way is refused (`TASK_NOT_CANCELLABLE`).

### 4.5 Deadlines

| Item | Default | Bounds |
|---|---|---|
| deadline (length from creation) | Set per request | 10 minutes to 24 hours |
| Claim validity | 30 minutes (never beyond the deadline) | Configurable |
| Nonce validity | `freshness.max_age_seconds` (default 300 s) | 60-900 s |
| Submission attempts per claim | 3 | Configurable |

When a submission fails for a reason that is not the worker's fault, such as poor location accuracy, the worker can get a new nonce and retry within the claim's validity. Reusing an identical photo (replay) and a photo nearly identical to another submission (near-duplicate, P1) suggest fraud, so the claim is ended on the spot.

### 4.6 One worker, one vote

A worker can claim the same task only once. Retries are attempts within the same claim and do not add to the witness count (`offchain-data-model.md` §5).

### 4.7 Other decisions

| Item | Decision |
|---|---|
| Starting to accept multiple witnesses | Until PR-14 lands, the env var `MAX_WITNESSES=1` refuses `required_witnesses > 1` with 400 `VALIDATION_FAILED` |
| What replay compares against | Photos of every submission that passed the earlier checks (including those that became INVALID). The app takes a new photo on every retake, so the same bytes arriving again means tampering |
| The "day" in the daily limit | A calendar day in Japan time (Asia/Tokyo) |
| Who can view a request | Only the API key that created it; not even other keys of the same principal |
| Idempotency keys older than 24 hours | The create API still prevents duplicates through the unique constraint on `verification_requests`. The same body returns the existing request with 200; a different body gets 409 `IDEMPOTENCY_KEY_CONFLICT` |
| Storage limits | The bucket itself has `file_size_limit = 8 MiB` and `allowed_mime_types = image/jpeg`, because signed URLs do not enforce the declared size |
| Where requests can be made | Anywhere (§4.15). Location can be omitted for types that do not depend on a place |

### 4.8 Additional task types (2026-10-04)

The MVP still centres on `PLACE_STATUS_VERIFICATION`. Two types are added that can be checked with the same capture, verification and settlement, and ask only about what is visible from outside a shop. Only types allowed by the API key's `allowed_task_types` are accepted; the default remains `PLACE_STATUS_VERIFICATION` only.

| type | Asks | Answers |
|---|---|---|
| `QUEUE_LENGTH` | How many people are queuing outside | `NO_QUEUE`, `SHORT_QUEUE` (up to about 5), `LONG_QUEUE` (6 or more), `UNCLEAR` |
| `NOTICE_POSTED` | Whether a notice named in the question (such as a temporary closure) is posted at the shop front | `POSTED`, `NOT_POSTED`, `UNCLEAR` |

Not added: stock requires going inside, which conflicts with the capture rules (do not enter). Prices cannot be answered with choices. Crowding mostly means photographing people, so it waits until bystanders are handled. Queues also show people, so workers are told to shoot from behind so faces do not appear.

### 4.9 Result reuse (2026-10-04)

If a result for the same shop was finalised a little earlier, return it without sending anyone. This avoids sending workers to the same shop repeatedly and cuts the requester's cost and wait.

- Adding `reuse: { "max_age_seconds": 60-3600 }` to the request body looks for a reusable result before creating
- Only requests whose original requester set `allow_reuse: true` (default false) can be reused, so a paid-for result is never handed to someone else without the owner knowing
- Conditions: same registered shop, same `type`, same answer choices, result VERIFIED, finalised within `max_age_seconds`. `NOTICE_POSTED` is excluded because the question changes which notice is meant
- If found, return 200 with `reused: true`, the original `verification_id` and the public result (the same fields as 05 §4). No new request, no balance movement (free during the pilot)
- If not found, create the request normally

### 4.10 Receiving rewards in yen (2026-10-04, preparation only)

To let workers who do not use wallets take part, we want a way to receive rewards in yen. Real-money payment does not start until `legal-checklist.md` §3 (holding and transferring funds) and §7 (withholding tax, invoices) are settled (README Hard constraints). Only two things are built now:

- A statement CSV: workers can export their monthly rewards — date (Japan time), request ID, amount, status, transaction URL — for tax checks later
- A wish to receive yen: workers can register "I'd like to receive yen" (`workers.yen_payout_interest_at`). No bank details are collected. The operator watches the count and contacts them first when ready

When paying in yen, the first choice is to delegate payment to a licensed provider; the operator holding requesters' funds and paying out is avoided.

### 4.11 Worker trust tiers (2026-10-04)

Decide each worker's trust tier from their submission record so requesters can set conditions. No scores; four tiers whose reasons can be explained.

| Tier | Condition (records over the last 90 days) |
|---|---|
| restricted | Has a submission rejected for a reused photo (`EVIDENCE_REPLAYED`) or a near-identical photo (`EVIDENCE_NEAR_DUPLICATE`) |
| new | Fewer than 3 valid submissions |
| trusted | 10 or more valid submissions, and 90% or more agreement on multi-witness requests (with at least 3 comparable requests) |
| standard | Otherwise |

- Agreement is the share of VERIFIED multi-witness requests where the worker's answer matched the final answer. Minority answers are still paid (§4.2), so agreement does not affect pay
- Requesters can add `worker_requirements: { "min_tier": "standard" | "trusted" }`. Workers below it do not see the task, and claims get 403 `WORKER_NOT_ELIGIBLE`
- A restricted worker cannot take requests finalised by one person (`required_witnesses = 1`); requests cross-checked by several people are allowed
- Workers can see their tier and the reason on the earnings screen, and can appeal to the operator (worker terms §5)

### 4.12 Disputes and rechecks (2026-10-04)

A requester who disagrees with a result may dispute once, within 24 hours of finalisation. A dispute creates a new "recheck" request at the same place, of the same type, with the same question.

- `POST /v1/verifications/{id}/dispute`. Body: `reason` (up to 500 characters, optional), `assurance` (default `{ "level": "standard" }`), `deadline_minutes` (10-1440, default 60)
- The recheck is created as an ordinary request (same balance, limits, policy checks and fund locking), paid for by the requester who disputed
- Payments to the original request's workers are not undone; work that met the conditions is paid (§4.2). Nobody is penalised automatically
- GET on the original request shows `recheck` (the recheck's ID, status, answer, and whether it matched); GET on the recheck shows `recheck_of`
- If the recheck's answer differs, record it in audit_events so the operator can review the submissions on the original

### 4.13 Reports from shops (2026-10-04)

Let registered shops report "temporarily closed today" or "open as usual" themselves, passed to requesters as reference information.

- The operator issues each shop a secret link (`/store/<token>`). No login. Only the link's hash is stored, and the operator can revoke it
- A report is "closed today" (CLOSED_TODAY) or "open as usual" (OPEN_AS_USUAL), with an expiry (default end of the day, Japan time). The shop's note (up to 200 characters) is visible only to the operator
- Not used for verdicts; results are still decided by people on site. GET on a request carries a separate `store_report` field (content and time), not included in `result_hash`
- Not shown to workers, so they answer what they see without being swayed

### 4.14 Requester console (2026-10-04)

The API alone makes it hard to see what is going on, so requesters get a browser screen, `/console`, for their API key.

- Log in by pasting the API key once. After the server checks it, a session is kept in a cookie JavaScript cannot read (httpOnly, SameSite=Strict, 12 hours). The API key itself is not left in the browser
- Shows: key details (prefix, limits, allowed types, status), balance and today's spend, deposit address and deposit history (15 §4.3, added 2026-10-11), recent requests, webhook delivery status, recurring checks. Since 2026-10-16, a "Tasks" page (`/console/tasks`) shows general tasks
- Actions: issuing a deposit address, stopping recurring checks, logging out, and (for tasks) accepting applicants and approving, sending back or rejecting deliveries. Issuing or re-creating keys is done by the operator
- POSTs are accepted only when the Origin is this site

### 4.15 Extending to work that needs a person's hands (2026-10-04)

By the owner's decision, the scope that was limited to checks in front of shops widens. The goal is "letting an AI ask a person for physical work it cannot do itself"; checking with a photo is one example. Reading books or paper documents, examining physical objects and asking by phone can also be requested. No new safety rules are added in this section (the owner's instruction); the existing banned-word check stays.

**Task types (17)**

| Group | type | Answer shape | Place |
|---|---|---|---|
| On site, choice | `PLACE_STATUS_VERIFICATION`, `QUEUE_LENGTH`, `NOTICE_POSTED` (existing) | Choice | Required |
| On site, choice | `CROWD_LEVEL`, `SEAT_AVAILABILITY`, `PARKING_AVAILABILITY`, `STOCK_CHECK` | Choice | Required |
| On site, number | `PRICE_CHECK` | Number | Required |
| On site, text | `SIGN_TRANSCRIPTION` (signs, notices, menus), `SITE_REPORT` (report on the scene) | Text | Required |
| Anywhere | `DOCUMENT_TRANSCRIPTION` (books, paper documents), `DOCUMENT_QA` (read and answer), `PRODUCT_INSPECTION` (examine an object), `PHONE_INQUIRY` (ask by phone), `CUSTOM_TASK` (other work) | Text | Optional |
| Anywhere | `MEASUREMENT` | Number | Optional |
| Anywhere | `CUSTOM_CHOICE` (the requester defines the choices) | Choice (2-6, up to 40 characters each) | Optional |

The authoritative definitions are `TASK_TYPE_SPECS` in `packages/core/src/domain/enums.ts`. Newly issued API keys can use every type; the operator can narrow them with `set-task-types.ts`.

**Answer shapes**

- `answer_schema` is one of `{ "type": "enum", "values": [...] }`, `{ "type": "number", "unit", "min", "max" }` or `{ "type": "text", "max_chars" }`; each type accepts only its shape
- Numbers also accept forms such as `1,280`, stored as `1280`. Out of range is `ANSWER_INVALID`
- Text is stored with surrounding whitespace removed, up to 4000 characters

**Place**

- Refusals by the registered-shop allow list (REQ-X-T-104) and the target-area rectangle (REQ-X-T-101) are dropped; any location can be requested
- If the location is within 30 m of a registered shop, `place_id` is recorded as before. Result reuse (§4.9) and shop reports (§4.13) work only for requests with a `place_id`
- If the operator set a rectangle on the API key (`allowed_bbox`), locations outside it are refused
- Requests without a place skip the geofence check (`not_run`) and do not ask for the worker's position. They appear in workers' lists regardless of distance

**Verdicts**

- Choices and numbers are decided by the existing majority rule (§4.3). Numbers are compared after normalising their format
- Text almost never matches word for word, so there is no majority vote: when `quorum` valid submissions are in, the result is VERIFIED and all texts are returned in `answers`, oldest first
- Text bodies are never put in the public evidence bundle or on Solana. The bundle contains the SHA-256 of each submission's text, and the result's `answer` is the SHA-256 of the first text. `answers` is excluded from the result_hash calculation (only the requester can see the text)
- Transcriptions and calls take time, so the upper bound of `freshness.max_age_seconds` becomes 3600 seconds. The question limit becomes 1000 characters so titles and pages can be written

### 4.16 AI review of the content (2026-10-04)

Raised by the owner. The requesting agent cannot do the on-site work itself, so it cannot check whether the photo and answer it receives match the request. Unless the system checks the content, records the verdict and returns it, the result cannot be trusted. So Claude compares each submission's photo and answer with the request.

- Runs as `vision_consistency` after every machine check (nonce, time window, photo format, reuse, near-duplicates, location) has passed
- Claude receives: the type, the request text, the answer shape, the answer and downscaled photos with EXIF stripped. The default model is `claude-opus-5-5` (changeable with the env var `REVIEW_MODEL`)
- Three verdicts. `pass` (as requested) passes. `fail` (clearly not as requested, e.g. a summary where a transcription was asked for, a requested item missing, photo and answer contradicting) fails, the reason is shown to the worker, and they can retry within the same claim (`EVIDENCE_MISMATCH`, up to 3 attempts). `uncertain` (photo too blurry to read; something a photo cannot show, like a phone call) passes with a `warning`
- If Claude's API is down, workers are not blocked: it passes with a `warning` (`verdict: "unavailable"`), and the result says so
- The requester receives, per passing submission, the verdict, reason and what was seen in the photo (`result.reviews`). The verdict status goes into result_hash and the evidence bundle as `checks.vision_consistency`. The reason text is visible only to the requester and excluded from hashing
- If `ANTHROPIC_API_KEY` is not set, this review does not run (`not_run`)

### 4.17 Review by Claude Code on the operator's Mac (2026-10-04)

By the owner's instruction, the §4.16 review is done without an API contract, using Claude Code on the owner's subscription. Subscription credentials cannot be used from the server, so the review runs on the owner's Mac.

- With the flag `external_review_enabled` on, submissions that passed every machine check wait in `CHECKING`. The worker screen shows "Checking the content" and polls every 15 seconds. No further submission on the same claim (`REVIEW_PENDING`)
- On the owner's Mac, launchd runs `scripts/review-runner.ts` every 2 minutes. It receives pending submissions from `GET /v1/admin/reviews` (request text, answer, downscaled photo URLs valid for 10 minutes), has `claude -p` judge them (Read only, structured output) and returns verdicts with `POST /v1/admin/reviews/{submission_id}`, authenticated with the operator's admin token
- The server decides pass/fail by the same rules as §4.16 (`fail` is `EVIDENCE_MISMATCH`, rejected with retry; `uncertain` passes with `warning`)
- A claim with a pending submission does not expire, and the request's deadline waits up to 30 minutes after it entered review. Verdicts arriving later are recorded but not counted
- A submission waiting more than 30 minutes is treated like "the API is down" in §4.16 (`verdict: "unavailable"`, passes with a `warning`), so neither the worker's finished work nor the requester's deadline depends on the operator's Mac being up (changed 2026-10-06; it used to fail). The requester can tell from `result.reviews` and `checks.vision_consistency` that it passed without a content review
- If the Mac is down, reviews are delayed; submissions older than 30 minutes pass unreviewed, so §4.16 does not apply while it is down
- If `ANTHROPIC_API_KEY` is set, the in-server review of §4.16 takes priority and submissions are not held

### 4.18 Multiple photos (2026-10-04)

Until now a submission had one photo. Some requests can only be checked with two or more, such as "the shop front and the price tag" or "a book's cover and the text page". AI review (§4.16, §4.17) also judges better with more photos. A submission can now carry up to 4 photos.

- The worker creates one upload per photo. One challenge (nonce) allows up to 4 uploads; the 5th is 400 `VALIDATION_FAILED` (`reason: "upload_limit"`)
- A submission's `evidence` has 1-4 entries, each a PENDING upload of the same claim and challenge. Listing the same upload twice is 400 `VALIDATION_FAILED`
- Per-photo checks (format, reuse, time, near-duplicates) run on every photo. One failing photo fails the whole submission with that photo's reason; `machine_details.photo` records which photo (counting from 1). Putting the same photo twice in one submission also fails as reuse
- The location check runs once per submission (one location per submission)
- `evidence_objects` has one row per photo. The evidence bundle's `evidence_sha256` lists all hashes in the order sent
- The requester's `GET /v1/verifications/{id}/evidence` returns every photo; a worker's photos share one `witness_ref` and come in the order sent
- AI review receives every photo. The external review list (§4.17) returns all URLs in `image_urls`; so the older review-runner running every 2 minutes does not break, the first URL also goes in `image_url` for now
- The order sent is kept by making IDs ULIDs that increase monotonically within a process (no DB migration needed)

### 4.19 Requests over x402 (2026-10-04)

Until now nobody could request anything until the operator issued an API key by hand. With x402, any agent with a Solana wallet can pay in USDC and make a request without signing up or a contract. This answers the judging question "can other AIs build it in?" and makes the reason for Solana clear (an agent can pay small amounts instantly with its own key).

- The window is `POST /v1/x402/verifications`. The body is the same as `POST /v1/verifications` minus `principal_ref` (ignored if sent). No API key or Idempotency-Key needed
- Without a payment, return HTTP 402 with x402 v2's `PAYMENT-REQUIRED` header: scheme `exact`, network `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1` (Devnet), asset `BOUNTY_MINT`, amount `bounty.amount × required_witnesses` in base units (plus the platform fee since 2026-10-16). Both `payTo` and the fee payer `extra.feePayer` are the operator's key (the treasury owner)
- Before returning 402, try creating the request once and roll it back (a preview). Requests refused for policy, deadline, limits and so on are refused with 400 etc. before payment. If a shared result can be returned through `reuse`, it is returned without payment
- With `PAYMENT-SIGNATURE`, the operator verifies as its own facilitator, meeting every MUST in coinbase/x402 `scheme_exact_svm.md`: the instruction sequence (2 Compute Budget, TransferChecked, optionally up to 3 Memo or Lighthouse), the fee payer appearing in no instruction's accounts, a Compute Unit price of at most 5 lamports, the destination being `payTo`'s ATA, mint and decimals, and an exact amount. Address lookup tables, Token-2022, multisig and ATA creation are also refused (being stricter than the spec is allowed)
- On success, sign as fee payer with the operator key, send, and wait for `confirmed`; then create the request. The amount received goes into the ledger as a TOPUP, from which the normal create (`createVerification`) RESERVEs. Funding the escrow (FUND_TASK) is still a separate transaction (following the rule in `architecture.md` §6 that separates "payment" from "escrow of the reward")
- One principal per paying wallet (display name `x402:<first 8 characters of the public key>`). A new API key is issued per payment and returned once in the response; it is used to read `GET /v1/verifications/{id}`. Its limits were 5 USDC per request, 20 USDC per day and 30 per minute (limits default to none since 2026-10-15, §4.29)
- One payment (the fee payer's signature = transaction ID) can never create two requests. Payments are recorded in `x402_payments` keyed by transaction ID. A confirmed payment arriving again returns the same verification_id (without the API key). A different body gets 409 `PAYMENT_ALREADY_USED`; while sending, 409 `PAYMENT_IN_PROGRESS`. If still sending after 120 seconds it is treated as stuck and may be resent; its presence on chain is checked first, so nobody pays twice
- If sending fails, no request is created and 402 with `PAYMENT-RESPONSE` (`success: false`) is returned. If creation is refused after payment (for example a flag changed after the preview), the amount stays as balance on a new key, returned in the error details
- The wallet need not hold SOL; the operator pays fees. The window allows 30 per minute per IP
- MCP tool descriptions include a sentence pointing to this window. MCP itself does not take payments
- The sample agent is `scripts/x402-agent.ts`: it receives 402, builds and signs the transaction, resends and waits for the result. It can request any of the 17 types (2026-10-05), building the answer shape from the type rules (`TASK_TYPE_SPECS`) with a sample question per type; without a type it requests the location-free `CUSTOM_TASK`. It stops before sending if a type that needs a place has none, or `CUSTOM_CHOICE` has no choices, and does not stop on network errors while waiting. Test USDC comes from Circle's faucet, or the operator sends it from the treasury with `scripts/x402-fund-agent.ts`

### 4.20 Work from home (2026-10-05)

Requests that do not depend on a place (the 7 "anywhere" types in §4.15) can be done without going out. To let people who find it hard to go out — older people, those with childcare or caregiving at home, people with disabilities — work, there is an entry that works without location. Until now the list could not be seen at all without allowing location.

- The worker list has two modes, "Nearby" and "From home"; the choice is remembered on the device (not on the server)
- "From home" shows only place-less requests, by nearest deadline. It does not ask for location and sends none to the server (`GET /v1/worker/tasks?scope=anywhere`)
- When location is unavailable in "Nearby", the worker is pointed to "From home" instead of an error
- Notifications can be registered without choosing any area; then only place-less requests arrive
- Claiming, capture, submission, verdicts and rewards are the same as other requests. Trust tiers (§4.11) still apply
- The public site's worker page explains work from home

### 4.21 A link proving a person checked (2026-10-05)

When an agent answers its user, it should be able to show "this is a fact a person checked, not an AI guess". The user can see for themselves when, how many and how it was checked.

- A request with a result gets `result.proof` with the public result page URL (`url`), a badge image URL (`badge_url`) and ready-to-paste Markdown (`markdown`)
- The public result page (`/r/{id}`) is readable by non-technical people. From the top: whether it was verified, what kind of check (type), the answer, when it was checked and how long ago, how many people, which checks passed, the Solana record
- The badge is `/r/{id}/badge.svg`: "checked by a person", the answer and the time in one line; "checking" if there is no result yet
- As before, only fields without the question, location, photos or worker information are public. The type (`type`) becomes public. Text answers are not shown; it says "text answer (only the requester can see it)"
- The page is not indexed (`noindex`); only people who know the ID see it
- Fixed at the same time: the public result was returning text answers (`answers`) and AI review records (`reviews`). Both are requester-only (§4.15, §4.16), so they were removed from the public result

### 4.22 A shared map of checked facts (2026-10-05)

Results such as "the lift at this station is working" or "this shop is open" help people other than the requester. Results the requester permits go on a map anyone can view for free, so one request helps others going to the same place, such as wheelchair or pushchair users.

- With `publish: true` in the request body, a VERIFIED result goes on the public map. Default false, so a paid-for result and the requester's own question are never published without their knowledge
- Published: the question, the request's place (the coordinates the requester gave), the registered shop's name if any, the type, the answer, the time checked and the number of people. Not published: photos, worker information, the worker's exact position
- Only for requests with a place whose answer is a choice or a number. Setting it on a place-less or text request is 400 `VALIDATION_FAILED` (text answers are requester-only)
- The map shows results checked within 72 hours, so old facts are not presented as current; every entry shows when it was checked and how long ago. For several results with the same place, type and question, only the newest is shown
- Screen `/map`, API `GET /v1/public/map` (no auth, cached about 60 seconds, up to 200). The public result page (§4.21) also shows the question and place for requests that permitted publication
- Requests where the operator revoked evidence access (`evidence_access_revoked`) appear neither on the map nor with their question on the result page; this is how removal requests (the rules page) are handled
- A separate permission from `allow_reuse` (§4.9): reuse means "hand the result to other requesters", publication means "anyone can see it"

Separately from whether to publish, how precise the published location is can be chosen with `location_privacy` (13 §9 PR 7, 2026-10-08). The default `"exact"` shows the request's coordinates as they are. `"coarse"` rounds them on the result page, map and dataset to the centre of a 6-character geohash cell (about 1.2 km × 0.6 km) with `location_precision_m: 1200`. The shop name is not shown because it would give the place away. The map draws a faint circle instead of a pin, labelled "approximate location (about 1 km)". The requester's `GET` returns the exact location. `"coarse"` on a place-less request is 400 `VALIDATION_FAILED` (`reason: "needs_location"`). The rounded value is not stored; it is computed when shown.

### 4.23 Watch requests (2026-10-05)

Requests such as "tell me when the lift is fixed" or "tell me when it's back on the shelf": keep checking until the answer is the desired value, then stop and notify. It removes the requester's need to keep going or asking. Built as an extension of recurring checks (§4.14, 04 §3.23); each run's request, balance and payment are unchanged.

- Recurring checks gain a second way to run: `every_minutes` (every 15-1440 minutes), as an alternative to the existing `times_jst` and `days_jst`
- `max_runs` (1-200) caps the number of runs; reaching it stops the schedule (`stopped_reason: "max_runs"`). Paying only for what is used is unchanged
- `stop_when` sets the condition to stop: `{ "answer": "OPEN" }` or `{ "answer_in": ["OPEN", "UNCLEAR"] }` for choices, `{ "number": { "min": 1 } }` or `{ "number": { "max": 300 } }` for numbers. Not allowed for text requests. A value not among the choices is 400
- The condition is checked when a created request's result becomes VERIFIED (each tick, within a minute). If it matches, the schedule stops with `stopped_reason: "condition_met"` and `matched_verification_id`; otherwise the next run waits
- Notification is the matching request's `verification.verified` webhook and `stopped_reason` in the schedule list (`GET /v1/schedules`). No new webhook type
- MCP gains three tools: `watch_reality_verification` (start), `list_reality_verification_watches` (list), `stop_reality_verification_watch` (stop). Watches and recurring checks share a table, so the list shows both
- The limit of 10 concurrent recurring checks per API key is unchanged

### 4.24 Publishing human-checked real-world data (2026-10-07)

Results permitted for publication (`publish: true`, §4.22) not only stay on the map for 72 hours but can be taken by anyone in machine-readable form: a collection of "observations checked on site by people, with time and place, recorded on Solana" for training and evaluating AI and Physical AI. One paid request is useful beyond the map.

- `GET /v1/public/dataset` (JSON, up to 1000, newest first) and `GET /v1/public/dataset.jsonl` (one per line). No auth. Cached about 60 seconds
- Each item: type, question, answer (choice or number), place (the coordinates the requester gave), the registered shop's name if any, number of people, time finalised, evidence hash (`evidence_root`), result hash (`result_hash`), the Solana transaction (signature, Explorer URL), the proof page URL
- Not included: photos, text answers, worker information, worker positions (as on the map)
- No time limit (the map's 72 hours serve on-the-spot guidance; old data still has value as observations). Requests whose evidence access the operator revoked are excluded
- Licence CC BY 4.0 (credit ProofMarket and the proof URL). The `/data` page explains the terms and how to download

### 4.25 Requesters decide the shape of the work (2026-10-08)

An extension prompted by the owner. The "content" of a request (the question) was free, but we decided its "shape": one answer per request, a deadline within 24 hours, one place, no field for acceptance conditions, and no way to send the same request to many places at once. This section lets requesters decide the shape too. The 17 types are demoted to "examples you can request today", and the framing becomes "lend agents a person's body and senses" (`docs/pitch/06-business-scale.md`). No safety rules are added (as before).

**1. Multi-field answers (`answer_schema.type = "form"`)**

- Types answered in text (`SITE_REPORT`, `SIGN_TRANSCRIPTION`, `DOCUMENT_*`, `PRODUCT_INSPECTION`, `PHONE_INQUIRY`, `CUSTOM_TASK`) accept `{ "type": "form", "fields": [...] }` with 1-8 fields. Each field has `key` (lowercase letters, digits and `_`, up to 32), `label` (up to 80), `type` (`enum` / `number` / `text`, shaped like a single answer) and `required` (default true)
- The worker screen shows an input per field. The answer is stored as one JSON object in field order (e.g. `{"open":"OPEN","price":1280,"note":"..."}`). Unknown keys, missing required fields or values of the wrong shape are `ANSWER_INVALID`
- Verdicts are as for text answers (no majority vote; VERIFIED when `quorum` valid submissions are in; everyone's answers returned in `answers`; only SHA-256 in the public bundle and on Solana). `answer_kind` stays `text` in the DB, with `fields` in `answer_spec`. Not on the map or in the public dataset
- AI review (§4.16) receives the fields as the answer shape; a missing field is a reason to send it back

**2. Acceptance criteria (`acceptance_criteria`)**

- A request can carry up to 500 characters of `acceptance_criteria`: the conditions under which the requester accepts it, such as "the price tag must be readable", "the shop name must be visible", "as written, not a summary"
- Workers see it under the question in the request details and on the capture screen. Claude's review receives it as `<acceptance_criteria>` next to the question (untrusted input, like the question). GET returns it too

**3. Deadlines for place-less work**

- Requests without a place can have a deadline up to 7 days (168 hours) ahead; on-site requests stay within 24 hours. This is for work such as ordering a book or waiting until a phone line is open
- The 30-minute claim and the time window (`freshness`) are unchanged; even with a far deadline, the flow after starting is the same

**4. Batch requests (`POST /v1/verifications/batch`)**

- Takes a `template` (a normal request body without `question` and `location`) and `items` (1-50, each with `location`, `question` or both), overlays each item on the template and checks and creates it as a normal request. For retail shelf audits (the same question to 50 shops) and AI data collection (different questions to the same place)
- All or nothing (one transaction). A failure response gives the item's position in `details.index`
- One idempotency key is accepted and suffixed with `#<number>` per item to use the existing idempotency mechanism. Balance, daily limit and per-request limit are checked on the total (the checks accumulate item by item)
- MCP: `request_reality_verifications_batch`. SDK: `createVerificationBatch`

**Not added in this section**

- Submissions without photos (phone requests etc.): the location, time and reuse checks assume photos, and removing them leaves no way to verify. To be designed in another section
- Work that lends hands (receiving, handing over, being present): needs state transitions and time-based pay. "Change 4" in `docs/pitch/06-business-scale.md`

### 4.26 Distinctive features and a beginner's path (2026-10-08)

Following the competitor research (`docs/pitch/07-landscape-and-edge.md`), seven features no one else has, and a path that does not rely on text, are added. The authoritative design is `13-edge-features.md`: a bounty that rises with urgency (program v1.1), facts other programs can read, optimistic verification (a challenge window and bond), a senses index, attestation of agent actions, in-browser help for workers (read-aloud, voice answers, sounds), rounding of public locations, and a "pictures and sound" path on the site and the worker app. DB changes are gathered in one migration, 0023.

### 4.27 Delivering verdicts to users (2026-10-09)

Even when a worker's submission has been checked by AI and the answer finalised, the agent's user learns nothing unless the agent comes to read it. Remove the situation where only those who ask "what happened?" learn the verdict.

- `GET /v1/verifications/{id}` returns `summary: { ja, en }`: one human-readable paragraph with the current state (waiting for someone to claim, on the way, AI checking n, n sent back, provisional answer, final, reason for rejection, expired), the answer, AI review's verdict and reason, payment status and the proof link. `witness_progress` gains `checking` (submissions AI is checking) and `returned` (submissions sent back as not matching the request)
- `GET` accepts `?wait=0-45` and waits up to that many seconds until the state changes or a result arrives (long polling; counts as one call for rate limiting). MCP `get_reality_verification`'s `wait_seconds` also goes to 45. `request_reality_verification` gains `wait_seconds` to wait for changes right after creation
- MCP tool descriptions and the `note` in responses instruct the agent: "tell the user right after requesting. While the user waits, keep calling with `wait_seconds=45` and tell the user whenever `summary` changes. When there is a result, tell them the answer, AI review's verdict and reason (`result.reviews`) and the proof link before being asked." MCP has no way for the server to write into the agent's conversation, so behaviour is set through tool descriptions
- Acceptance: tests pin the Japanese and English `summary` for each state. `wait` returns at once on a change and after the given seconds otherwise. MCP `request_reality_verification` with `wait_seconds` returns `verification` (with `summary`)

### 4.28 Handing over the API key on the spot (2026-10-09)

When a requester signed up at `/join`, nothing could happen until the operator issued a key by hand. There was no email either, so applicants received nothing. Outsiders cannot use the service if they must wait for the operator to be free. The key is now issued on the spot and shown on the screen, and the agent setup can be finished there.

- A requester sign-up creates a principal and API key immediately, puts in a 5 USDC trial balance (Devnet test funds; 10 requests at the usual 0.5 reward) and returns the key in the response (`{ ok, delivery: "screen", api_key, principal_ref, trial_balance, emailed }`). `principal_ref` is the ID to include in the body when creating requests over REST (filled in automatically in MCP). The screen shows the key and `principal_ref`, the Claude Code command, the MCP config file and REST examples with the key filled in. The key is visible only this once; the DB keeps only its hash
- If `RESEND_API_KEY` and `MAIL_FROM` are set, a copy is emailed (in the sign-up page's language, default Japanese). If sending fails the key is not revoked (it was already shown)
- To curb abuse, at most 3 keys per day from the same source (an IP hash), counted per UTC day using `rate_limit_counters` with a daily window; the existing 5 per minute stays. IPs are not stored
- Worker sign-ups still get an invite code from the operator (`delivery: "operator"`)
- The sign-up row keeps an HMAC of the lowercase address (`contact_hash`) and the issued key (`credential_id`), so the operator can match sign-ups with keys (migration 0026)
- Acceptance: the returned key authenticates and has a balance of 5. The key works even if email fails. A 4th from the same source is refused for the rest of the day. Workers still get no key

### 4.29 Spending limits and quotes (2026-10-15)

The design in `docs/architecture/` (04 §4.2-4.3, 08 §4.1) was implemented following the owner's decision of 2026-10-15.

- An API key's `max_task_amount` (per request) and `daily_spend_limit` (per day) are **no limit (null) by default**, keeping the judgement of PR #14 that "within the balance, spend freely". They are checked only when the operator sets values on a key, and excess is refused with 403. Keys issued by `/join` and x402 also have no limit; the brakes are the trial balance and the payment itself
- A window to check the cost before creating: REST `POST /v1/verifications/quote`, MCP `confirm: false` on `request_reality_verification`. Nothing is reserved; it returns `quote_id`, `total`, `balance_after` and the expiry (5 minutes). To confirm, send the same body with `quote_id`. This gives agent runtimes (Claude's approval features, Eve's approval) a place to show the cost to a person before proceeding
- A request list, `GET /v1/verifications`, and MCP `list_reality_verifications` are added; MCP has 10 tools
- A flag to stop just the x402 window, `x402_enabled` (default on). While stopped it returns 503 `FEATURE_DISABLED` and no payment terms
- Acceptance: a key without limits stops only at its balance. A key with limits stops on per-request and daily excess, clearing the next day (Asia/Tokyo). A quote changes neither balance nor requests, and refuses a different body, another key, expiry and reuse. The list never shows other keys' requests

### 4.30 General tasks next to verifications (2026-10-16)

By the owner's decisions D1-D6 (`docs/architecture/12-rentahuman-benchmark.md` §8), general tasks are offered next to verifications: applications or first come, seats, deliveries the requester approves (or that are paid automatically 24 hours after delivery), conversations, and a 15% fee on top. The requirements are REQ-T-001 to REQ-T-008 in `specs/proofmarket/requirements.md` §7, and the design and its implementation status are in `docs/architecture/13-marketplace-migration.md`. Hidden behind the `tasks_enabled` flag until the legal items in `legal-checklist.md` §10 are decided.


## 5. Business flow

### 5.1 Normal case (1 witness)

```text
Requester            ProofMarket API / Jobs              Worker (phone)            Solana Devnet
   | POST /v1/verifications ->|                              |                          |
   |<- 201 CREATED ------------|                              |                          |
   |                          |-- initialize_task ------------------------------------->|
   |                          |<- confirmed: FUNDED -> OPEN ----------------------------|
   |                          |<----- GET /v1/worker/tasks ---|                          |
   |                          |<----- POST claim -------------|                          |
   |                          |<----- POST challenge (on site)|                          |
   |                          |--- nonce ------------------->|                          |
   |                          |<----- photo upload, submit ---|                          |
   |                          | checks -> valid -> VERIFIED   |                          |
   |                          |-- finalize_verification + settle ---------------------->|
   |                          |<- finalized: SETTLED ----------------------------------|
   | GET /v1/verifications/{id} (polling) or webhook                                    |
   |<- VerificationResult -----|                              |                          |
```

### 5.2 Main failure cases

| Event | Behaviour |
|---|---|
| Nobody claims it | EXPIRED at the deadline, full refund, REFUNDED |
| Submission outside the geofence, stale, or invalid nonce | The submission becomes INVALID and the reason is shown to the worker. They can retry while attempts remain |
| Reuse of an identical photo, or a nearly identical photo | The submission becomes INVALID and the claim REJECTED. The slot returns for other workers |
| RPC is down | The result stays VERIFIED with settlement.status PENDING, retried until recovery. Never claims SETTLED |
| The webhook destination is down | The result can be fetched by polling. Resending never causes double settlement |
| Resent with the same Idempotency-Key | The same response as the first time; 409 if the content differs |

## 6. Functional requirements

IDs: existing `requirements.md` IDs are used as is; requirements added for implementation start with `REQ-X-`. Priorities mean the same as before (P0 = required for submission).

### 6.1 Requester

| ID | Requirement | Priority | Existing |
|---|---|---|---|
| REQ-A-001 | Create verification requests over REST | P0 | Same |
| REQ-A-003 | A request includes question, location, radius, deadline, choices, evidence requirements, reward, witness count and principal | P0 | Same |
| REQ-A-004 | Idempotency-Key prevents double creation and double locking | P0 | Same |
| REQ-A-005 | Get status and result by ID | P0 | Same |
| REQ-A-006 | Cancel under the rules of §4.4 | P0 | Same (rules made concrete) |
| REQ-A-002 | Create, get and cancel over MCP | P1 | Same |
| REQ-A-007 | Specify witness count and quorum | P1 | Same |
| REQ-X-A-101 | At creation, check balance, per-request limit, daily limit, rate limit and region, refusing with fixed error codes when exceeded | P0 | Concretises REQ-T-004 |
| REQ-X-A-102 | An authenticated requester can get evidence images of their own requests (derived images without EXIF) through signed URLs valid for 5 minutes | P1 | Concretises REQ-R-003 |
| REQ-X-A-103 | Receive state changes through signed webhooks | P1 | api-contract §11 |

### 6.2 Worker

| ID | Requirement | Priority | Existing |
|---|---|---|---|
| REQ-X-W-101 | Only people with an invite code can register. At first login, consent to the terms and safety rules is obtained, and version and time are recorded | P0 | Closed pilot (legal-checklist §9) |
| REQ-W-001 | Before claiming, see reward, distance, deadline, requirements and cautions in the list and details | P0 | Same |
| REQ-W-002 | Claim only by an explicit action | P0 | Same |
| REQ-X-W-102 | The nonce is obtained when starting to capture on site | P0 | Concretises REQ-W-003 |
| REQ-W-003 | Submit answer, photo, location, nonce and device time | P0 | Same |
| REQ-W-004 | Can abandon at any time without penalty | P0 | Same |
| REQ-W-005 | Show why a check failed in Japanese that says what to fix | P1 | Same |
| REQ-X-W-103 | See own payout history with links to Explorer | P1 | New |
| REQ-X-W-104 | Workers are not made aware of wallets, SOL or signing | P0 | REQ-P-005 raised to P0 (achievable with D-04) |

### 6.3 Verification

REQ-V-001 to 009 of `requirements.md` are met as they are. Conditions and reason codes per check are in chapter 07.

| ID | Requirement | Priority |
|---|---|---|
| REQ-X-V-101 | Checks run cheapest first; the first failing check and its reason code are recorded, and the rest are `not_run` | P0 |
| REQ-X-V-102 | Accepting several submissions to one task and computing consensus happen serially under a lock on the task row | P0 |

### 6.4 Settlement and Solana

REQ-P-001 to 007 of `requirements.md` are met.

| ID | Requirement | Priority |
|---|---|---|
| REQ-X-P-101 | For each task, send the transactions for locking funds (initialize_task), finalising the result (finalize_verification), and payment (settle) or refund (refund) to Devnet, and record the signatures | P0 |
| REQ-X-P-102 | settle and refund are mutually exclusive by on-chain state; each succeeds only once | P0 |
| REQ-X-P-103 | On a send failure, read on-chain state before resending. If the state has already advanced, do not resend; only correct the record | P0 |
| REQ-X-P-104 | The platform pays fees and the cost of creating workers' receiving accounts (ATAs) | P0 |
| REQ-X-P-105 | Sending to Mainnet is prohibited by code configuration (the RPC URL and genesis hash are checked at startup). The only exception is when the three conditions of 15 §4.1 hold (REAL_FUNDS_ENABLED, LEGAL_SIGNOFF, keys different from Devnet's) (`apps/web/lib/cluster.ts`) | P0 |

### 6.5 Results and publication

| ID | Requirement | Priority |
|---|---|---|
| REQ-R-001 to 003 | As in `requirements.md` | P0 |
| REQ-X-R-101 | The public result page `/r/{verification_id}` shows the answer, witness count, check results, evidence root and Explorer link; no photos, coordinates or question text | P1 |
| REQ-X-R-102 | A public verification API returns the canonicalised evidence bundle so anyone can recompute the root and check it against the on-chain value | P2 (Stretch: live public result verifier) |

### 6.6 Safety and policy

REQ-T-001 to 004 of `requirements.md` are met; the implementation is in chapter 08.

| ID | Requirement | Priority |
|---|---|---|
| REQ-X-T-101 | ~~Refuse requests whose location is outside the target-area rectangle~~ Dropped in §4.15. Refuse only when the API key has its own rectangle | P0 |
| REQ-X-T-102 | The question is at most 1000 characters (§4.15), and requests containing banned words (Japanese and English) are refused. The ID of the rule used is recorded | P0 |
| REQ-X-T-103 | The operator can stop new creation, claims and settlement immediately and separately | P0 |
| REQ-X-T-104 | ~~Refuse a request unless its location is within 30 m of a public shop registered by the operator (`places`)~~ Dropped in §4.15. Within 30 m, `place_id` is just recorded | P0 |

### 6.7 Demo agent

| ID | Requirement | Priority |
|---|---|---|
| REQ-X-D-101 | `scripts/demo-agent.ts` creates a request over REST, polls until there is a result, and prints "proceed with the booking" for `OPEN`, "look for another shop" for `CLOSED` and "ask a person" for `UNCLEAR` | P0 |
| REQ-X-D-102 | The same can be done over MCP from an MCP client such as Claude | P1 |

## 7. Non-functional requirements

| Area | Requirement |
|---|---|
| Performance | API responses excluding chain processing within 1 s at p95. From submission to verdict within 10 s. From VERIFIED to SETTLED within 60 s normally |
| Availability | Enough to work for the demo and real use on 10/9-10/10. A production SLA is out of scope (REQ-N-006) |
| Consistency | Getting state has no side effects and can be called any number of times (REQ-N-005). Every state transition happens in a DB transaction, with the audit event written in the same transaction |
| Devices | iOS Safari 17 or later, the latest two versions of Android Chrome. Camera and location permission required |
| Language | The worker screens are built in Japanese first, with English added at P1. API error messages are in English |
| Retention | Original photos and exact locations: 30 days. Derived images: 30 days. Verdicts, hashes, audit logs and payment records: 1 year (production periods to be set after legal review). Deleted by a daily job when due |
| Monitoring | Structured logs always carry `verification_id`. The events of `architecture.md` §7 are kept in audit_events |
| Cost | Fit within Devnet and the free tiers of each service. Keep AI image review to about 1 yen per item |
| Secrets | Secret keys and API keys never appear in the repository, logs or client bundles (REQ-N-003). gitleaks runs in CI |

## 8. Assumptions and dependencies

- The free tiers of Privy, Supabase, Vercel and a Devnet RPC (Helius etc.) are available
- Devnet USDC can be obtained from Circle's faucet (if not enough, switch to our own test mint; chapter 06)
- At least two test workers and public shops in the pilot area are available
- The "real use" shown to judges comes from real requesters and workers, including acquaintances, and counts are not inflated (`kpi.md`)
