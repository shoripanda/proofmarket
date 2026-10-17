# 12. Studying RentAHuman, and a design to move ProofMarket toward it (2026-10-16)

This answers the owner's request: "I want it to be like rentahuman.ai. Read the whole site, find out what system and code it runs on, and work out a design for ProofMarket." **Design only; no code was changed.** Implementation starts once the owner answers the decisions in §8.

## 1. Conclusion

RentAHuman's strength is not technical depth but **how widely it opens the door for agents to find it and connect**, and **general requests (bounties) for anything**. Its settlement and verification are weaker than ProofMarket's (on-chain escrow, machine checks of place and freshness, Claude review).

So the foundation stays as it is (Next.js, Supabase, Solana, Privy). We add three things:

1. **The door**: llms-full.txt, agents.json, a public location for the OpenAPI, an npm MCP package, an MCP Registry listing, a "paste one line" connect page, and API keys issued by an email code. Each is small and pays off a lot.
2. **General tasks**: next to today's "verification" (fixed shapes, machine-checked), allow free-form "tasks": choosing people from applicants, a conversation per task, several seats, templates.
3. **The requester decides payment**: per request, choose between "pay automatically when AI review passes" (today) and "pay when the requester approves". No step where operator staff judge (in line with #49).

## 2. What was studied

Fetched and read on 2026-10-16 (kept in a scratch folder, not in the repository):

- Machine-facing files: `robots.txt`, `llms.txt` (13 KB), `llms-full.txt` (27 KB), `agents.json`, `openapi.json` (OpenAPI 3.1, 71 operations), `/api/stats`, `/api/humans`, `/api/bounties`
- 84 human-facing pages: the top page, `/for-agents`, `/docs` (MCP tool catalog and REST reference, 115 KB), `/docs/escrow`, `bounties`, `webhooks`, `x402`, `mpp`, `taste-runs`, `humanizations`, `send-money`, `partners`, `github-human-qa`, 10 pages under `/docs/integrations/*`, 21 under `/docs/use-cases/*`, 13 under `/answers/*`, 8 under `/earn-with-ai/*`, `/qa`, `/taste`, `/services/*`, the terms and the privacy policy
- The breakdown of `sitemap.xml` (46,696 URLs)
- HTTP headers (including the CSP) and strings embedded in the HTML
- package.json and the bundled SKILL.md of npm `rentahuman-mcp` 3.12.1 (updated 2026-10-15)
- The public repositories of the `rentahuman-ai` GitHub organisation (`skills`, `line-waiting-cli`)
- Press coverage (the launch story, and reports of payout problems)

The server source is not public. Part of §3's stack is inferred from headers, the CSP, the terms and npm dependencies; inferences are marked "inferred".

## 3. How RentAHuman is built

### 3.1 Company and scale

- Run by RawLabs, Inc. (dba RentAHuman.ai), under Californian law. Its own pages show Y Combinator backing.
- Launched in early February 2026. Its author, Alexander Liteplo, is a crypto engineer, reported to have built it quickly by running Claude agents in a loop.
- `/api/stats` (2026-10-16): 853,724 registered people, 32,615 connected agents, 17,511 bounties in total, 5.8 million site visits. Few bounties relative to people.

### 3.2 Technology

| Layer | What it uses | Evidence |
|---|---|---|
| Frontend | Next.js (App Router, RSC), the Geist font | `x-matched-path`, `/_next/static/immutable/`, `vary: rsc` |
| Delivery | Vercel (iad1) behind Cloudflare | `x-vercel-id`, `server: cloudflare`, `cf-ray` |
| Auth, DB, storage | Firebase (Auth, Firestore, Storage, Cloud Functions) | CSP connect targets; the terms say "Firebase (authentication and database)"; 20-character Firestore-style IDs |
| Deposits | Stripe Checkout, MPP (Stripe's Machine Payments Protocol; cards and Link), x402 (USDC on Base, early access) | docs, CSP |
| Payouts | Whop ("Withdraw to bank") and Stripe Connect identity verification | String keys in the HTML, `apollo.elements.whop.com` |
| Analytics and monitoring | PostHog, Sentry, Cloudflare Web Analytics | CSP |
| Bot protection | Cloudflare Turnstile, reCAPTCHA | CSP |
| Maps | OpenFreeMap tiles | CSP |
| Language | Switches to Japanese automatically for visitors from Japan | Pages fetched from Japan were in Japanese |
| MCP (local) | npm `rentahuman-mcp`: `@modelcontextprotocol/sdk`, Effect, `@x402/*`, viem. Creates a local Ed25519 key and signs actions with it | npm dependencies, llms-full.txt |
| MCP (remote) | `https://rentahuman.ai/api/mcp`, OAuth or `X-API-Key`, a smaller tool set | llms.txt |

### 3.3 The door (how agents find it and connect)

This is the most polished part.

1. **Directions in robots.txt.** It tells crawlers, as comments, where llms.txt, agents.json, the OpenAPI and MCP installation are. Only `Claude-User` and `Perplexity-User` are allowed into `/api/` (agents acting on a user's instruction calling the API is the intended use).
2. **Two levels: llms.txt and llms-full.txt.** The short one gives directions and rules; the long one gives setup per client, the rules to follow and skills. Tool names and prices are left out in favour of "read `tools/list` and the docs every time", so nobody relies on a stale copy.
3. **One-line connection.** On `/for-agents/setup`, choose your agent and get one line: "read llms-full.txt and set it up; my key is rah_…". If signed in, the key is filled in on the spot.
4. **Sign-up without a browser.** `POST /api/agents/signup` with an email sends a 6-digit code, and `/verify` returns an API key once. No CAPTCHA. There is also a path where paying 10 dollars over x402 is the sign-up and becomes the balance.
5. **Every distribution channel.** npm, the MCP Registry, a Claude Code plugin marketplace (`rentahuman-ai/skills`, 7 skills), OpenClaw's ClawHub, a ChatGPT remote connector, and guides for Meta Muse, Instinct and others.
6. **Public discovery API without a key.** Anyone can search people and bounties.

### 3.4 The bounty flow

```
dryRun for a preview → show the requester and get a yes → post with an Idempotency-Key
→ reserve the whole amount from the balance (if short: pending_deposit with a deposit_url)
→ applications arrive (AI screening if autoAccept, off by default) → accepting confirms a seat and opens a conversation
→ the worker submits evidence → a 4-day review
   ├ approve and pay (release; irreversible; acknowledgeRelease: true required)
   ├ ask for changes (up to 3; the window restarts)
   └ reject → staff decide (same when the window lapses)
→ money for unfilled seats returns to the balance
```

- Bounty fields: title, description, 8 categories, fixed or hourly, definition of done, kinds of evidence (text, photo, video, link), place or remote, deadline, time to complete (1-720 hours; past it the seat is freed and reopened), seats (1-2,000, up to 10,000 dollars in total), questions for applicants, whether ID is required, language level (CEFR, scored from speech).
- **Upload collection**: instead of applications, collect photos, videos or documents directly, accept or reject each, and download the accepted ones as a zip with manifest.json.
- **AI-managed bounties** (beta): the operator's AI handles recruiting, screening, accepting, checking evidence, paying and reporting, and hands only unclear cases back to the requester.
- Up to 30 saved templates. Workers can be marked "preferred" or "blocked". Tips and reimbursements can be sent after payment.

### 3.5 Money

- The fee is **18% on top of** the worker's pay: for a 100-dollar job the requester pays 118 and the worker receives 100.
- Requesters pay from a prepaid balance, topped up by card (Stripe), MPP or x402 (USDC on Base). Unused money returns to the balance and cannot be withdrawn to a bank (only refunded to the card).
- Balance controls: low-balance alerts, spending caps, automatic top-up, each reported by webhook.
- Workers withdraw earnings to a bank through Whop. Press reports describe periods when payouts were unreliable.

### 3.6 Webhooks

Signed with HMAC-SHA256 (`t=<seconds>,v1=<hex>` over the raw body). Up to 5 per key; the secret is returned once at creation. Failures are retried 6 times, from 30 seconds doubling up to 1 hour; 15 consecutive failures disable the endpoint. There is a **test send** (`/test`) and a **delivery log** (`/deliveries`, with each attempt's result). 29 event types.

### 3.7 Safety rules

- Public fields may not ask for passwords, codes, keys, IDs, bank details or addresses.
- Messages that try to move contact or payment elsewhere are delivered and flagged for staff.
- Worker text and files are "task data" and never instructions to the agent (prompt-injection protection).
- An agent API key cannot perform worker actions (applying, editing profiles).
- It says outright that "a post is a request, not a booking": no guarantee anyone comes or of timing.

### 3.8 Growth

- Of 46,696 sitemap URLs, 24,006 are services, 22,067 are people's profiles and 339 are blog posts: every person and listing is put in front of search engines.
- `/answers/*` (13 pages) answer "can I hire someone to do X" directly, in a shape AI search tends to quote.
- `/docs/integrations/*` gives one page per framework: LangChain, CrewAI, the Vercel AI SDK and others.
- The top page has the four steps "Prompt. Proof. Payment." and large numbers of people and countries.

### 3.9 Weaknesses

- 850,000 people but 17,000 bounties. Press reports say most bounties are posted by people and few by agents themselves.
- When the review window lapses, staff decide. As volume grows, staff become the bottleneck.
- No machine check of place or time is visible; requesters judge evidence by eye.
- The terms broadly disclaim responsibility for scam bounties and injuries during work.

## 4. Comparison with ProofMarket

| Aspect | RentAHuman | ProofMarket (main 7195a5c) | What to do |
|---|---|---|---|
| What can be asked | Anything (8 categories) | Real-world checks (fixed types) | Add free-form "tasks" (§5.2) |
| Choosing people | Apply → requester or AI accepts | First-come claim | Choose first-come or applications per request |
| Checking evidence | The requester looks | Machine checks (place, freshness, nonce, replay, near-duplicates, format) and Claude | Keep as a strength; use the checks that apply for tasks too |
| Deciding payment | Requester releases; staff on lapse | Paid automatically when AI review passes | Choose per request; on lapse, pay the worker (§5.3) |
| Where money sits | A balance in the operator's DB | Ledger + Solana escrow | Keep; being verifiable on chain is a strength |
| Deposits | Card, MPP, x402 (Base) | Solana Pay, x402 (Solana), manual | Card deposits after legal review (§8 D4) |
| Payouts | To a bank via Whop | USDC to an embedded wallet | Keep |
| Fee | 18% on top | No explicit rate (the rest goes to treasury) | Decide on an on-top fee (§8 D3) |
| Conversation | Per bounty | None | Add for tasks |
| Public worker profiles | Yes (rate, skills, city) | None | Only for those who opt in (§8 D5) |
| Agent door | The six in §3.3 | llms.txt (56 lines), REST, MCP (OAuth), x402 | Do all of §5.1 first |
| Webhooks | Test send, delivery log, auto-disable | Signed delivery | Add test send and delivery log |
| Spending brakes | Caps, alerts, auto top-up | Caps (checked since #44) | Add alerts |

## 5. Design

### 5.1 Open the door (Phase A)

The cheapest and most effective. Existing features are untouched.

| Item | Content | Where |
|---|---|---|
| Rewrite llms.txt | What it does, rules, links to each document; no prices or tool names, pointing to `tools/list` and the docs instead | `apps/web/public/llms.txt` |
| llms-full.txt | Setup per client (Claude Code, Desktop, Codex, ChatGPT, Cursor), the order of a request, rules, how to write your own skill | same |
| agents.json | A machine-readable summary of capabilities | `apps/web/public/agents.json` |
| A public OpenAPI location | `/openapi.json` and `/.well-known/openapi.yaml` (just serve the definition CI already checks) | Route handler |
| Directions in robots.txt | Point to the locations above in comments; allow `/v1/` for `Claude-User` | `app/robots.ts` |
| An npm MCP package | Publish `packages/mcp` as `proofmarket-mcp`, run with `npx -y proofmarket-mcp` and the key in an env var | `packages/mcp` |
| MCP Registry | List it in the official registry | `server.json` |
| A Claude Code plugin | `proofmarket-skills`: how to write a request, how to follow results (webhooks or polling), how to dispute | separate repository |
| One-line connection | Rework `/connect` into "choose your agent → copy one line", with the key filled in when signed in | `app/(site)/connect` |
| Sign-up by email code | `POST /v1/agents/signup` → 6-digit code → `/verify` returns the key once. Trial balance on the same rules as today's `/join` | new route handlers, table `signup_codes` |
| dryRun and confirm | Add `dry_run: true` to request creation, returning the estimate and total. In MCP, show the dry run, then post with `confirm: true` | `/v1/verifications`, MCP tools |
| Webhook test send and log | `POST /v1/webhooks/{id}/test`, `GET /v1/webhooks/deliveries` | reuse the existing outbox delivery |

### 5.2 Give requests a kind (Phase B)

Add `kind` to the request table, with two values:

- `verification` (today's checks): answer choices, geofence, nonce, number of witnesses, machine checks, Claude's verdict. Unchanged.
- `task` (new): title, description, definition of done, evidence wanted (photo, video, text, link, file), place or remote OK, deadline, time to complete, seats, questions for applicants.

States of a task are below. They live in a separate table from the verification state machine (chapter 03), while the funding axis (FUNDED, SETTLED, REFUNDED) is shared.

```
OPEN ──apply──> APPLIED ──accept──> ASSIGNED ──deliver──> SUBMITTED
                                       │                    ├ approve ───────────> RELEASED
                                       │                    ├ changes (≤3) ─────> ASSIGNED
                                       │                    ├ reject ────────────> REJECTED (the seat's money returns to the task)
                                       │                    └ window lapses ─────> RELEASED (pay the worker)
                                       └ time to complete lapses ─> seat freed, back to OPEN
```

- Selection per request: `first_come` (today's claim) or `application` (choose from applicants). `application` can have `auto_accept` (AI screening, unclear cases go to the requester).
- On chain, a seat is treated like today's "witness". Calling `finalize_verification` and `settle` per seat should need no program change (using chapter 05's recipient record per seat). To check: whether one Task PDA can pay seats separately; if not, one PDA per seat.
- For tasks too, photos get the time, place, replay and near-duplicate checks, shown to the requester "for reference".
- Conversation: tables `conversations` and `messages`, opened on acceptance. Worker text is marked as "data" when passed to the agent. Text that looks like contact details or an off-platform payment is flagged (delivered and recorded).
- Upload collection can reuse today's public dataset (`/v1/public/dataset`).

### 5.3 The requester decides payment (with Phase B)

Each request gets a `release_mode`:

| Value | Behaviour | Suits |
|---|---|---|
| `auto` | Pay when machine checks and Claude's verdict pass (today) | The default for verifications |
| `manual` | Do not pay until the requester calls `release`; `acknowledge_release: true` required | The default for tasks |

- The default review window for `manual` is 72 hours; when it lapses, **pay the worker**. No step where operator staff decide. Say up front that silence means payment.
- Accept a rejection as the requester's decision, with a reason required. Show each requester's rejection rate to workers, and lower the per-request limits of requesters who reject a lot. This keeps things balanced without the operator in between.
- Keep verification disputes (create a recheck request) as they are.
- State in MCP and llms-full.txt that "release only when the requester explicitly says so" (the same rule as RentAHuman).

### 5.4 Finding people (Phase C)

- Public worker profiles (only for those who choose to publish): display name, city or ward at most, skills, languages, completed count, rating. Photo optional.
- `GET /v1/public/workers` (no key; filter by city and skill) and MCP `search_workers`.
- "Preferred" and "blocked" per requester.
- Ratings: the requester gives one per seat after completion.
- A public list of open tasks at `/tasks` (no key), readable by workers and search engines.

### 5.5 Growth pages (alongside Phase C)

- `/answers/*`: one page per kind of check ("can someone check whether a shop is open", "can someone see whether it is on the shelf"), written to be quoted by AI search.
- `/docs/integrations/*`: one page each for Claude, the OpenAI Agents SDK, LangChain, the Vercel AI SDK and Cursor.
- City pages (Tokyo first) and the pages of workers who opted in, added to the sitemap.
- Large numbers on the top page (people, cities, completed) from `/v1/public/stats`.

### 5.6 What stays

- Next.js, Vercel, Supabase, Drizzle, Privy, the Anchor program. No reason to move to Firebase.
- Workers never signing transactions, the three-key split, the outbox and tick.
- Machine checks and Claude's verdict for verifications. RentAHuman has neither, so show them for tasks too.

## 6. Data to add

| Table | Main columns | Use |
|---|---|---|
| `signup_codes` | email_hash, code_hash, expires_at, attempts | Sign-up by email code |
| `tasks` (or `kind` on the existing table) | kind, selection_mode, release_mode, seats, completion_criteria, evidence_types, remote_ok, completion_window_hours | Tasks |
| `applications` | task_id, worker_id, answers, status | Applications |
| `seats` | task_id, worker_id, status, submitted_at, review_deadline, revisions | Progress per seat |
| `conversations` / `messages` | task_id, seat_id, sender, body, flags | Conversation |
| `worker_profiles` | worker_id, public, display_name, city, skills, languages | Public profiles |
| `requester_worker_prefs` | requester_id, worker_id, kind (prefer / block) | Preferred and blocked |
| `reviews` | seat_id, rating, comment | Ratings |
| `webhook_deliveries` | endpoint_id, event_id, attempts_log, status | Delivery log |
| `task_templates` | requester_id, name, body | Templates |

Migrations follow chapter 10 (add columns → write → read → remove the old path).

## 7. Order of work

| Phase | Content | Rough size | Prerequisite |
|---|---|---|---|
| A | The door in §5.1 | 3-4 PRs | None |
| B | Tasks, applications, seats, conversation, `release_mode` | 5-7 PRs, 2-3 migrations | D1, D2 |
| C | Public profiles, search, ratings, public task list, growth pages | 4-5 PRs | D5 |
| D | Card deposits, showing the fee | 2 PRs | D3, D4 and legal |

A can start today. B onwards waits for answers to §8.

## 8. Decisions for the owner

The owner answered on 2026-10-16: D1 widen; D2 pay the worker after **24 hours**; D3 15% on top; D4 no card deposits; D5 only those who opt in; D6 verifications and tasks side by side. The design for the move is [chapter 13](13-marketplace-migration.md). The table below is kept as the recommendation made before the answers.

| # | Question | Recommended | Why |
|---|---|---|---|
| D1 | Widen what can be asked from "verification" to general tasks? | Widen, keeping verification as the flagship | Needed to move toward RentAHuman; machine-checked verification is a differentiator |
| D2 | When a task's review window lapses, which way? | Pay the worker (72 hours) | Compatible with having no staff judgement (#49). Workers will not come if silence means no pay |
| D3 | How to charge? | On top of the pay, 10-15% | Workers see exactly what they receive. RentAHuman takes 18% |
| D4 | Allow topping up by card? | Decide after legal review | Selling prepaid balances in Japan may count as a prepaid payment instrument under the Payment Services Act; check in `docs/legal` first |
| D5 | Publish worker profiles? | Only for those who choose; city or ward at most | Helps growth, but location must be handled carefully (as with location encryption in chapter 08) |
| D6 | Keep the name "verification"? | Put verification and task side by side | Renaming the API would break existing users |

## 9. Sources

- https://rentahuman.ai/llms.txt, https://rentahuman.ai/llms-full.txt, https://rentahuman.ai/robots.txt, https://rentahuman.ai/agents.json, https://rentahuman.ai/openapi.json
- https://rentahuman.ai/docs, /docs/escrow, /docs/bounties, /docs/webhooks, /docs/x402, /for-agents, /earn-with-ai/get-paid, /terms
- https://www.npmjs.com/package/rentahuman-mcp (3.12.1)
- https://github.com/rentahuman-ai/skills
- Press: [HackerNoon](https://hackernoon.com/lite/ai-agents-are-now-hiring-humans-rentahuman-and-the-inversion-of-work), [Mischa Dohler](https://mischadohler.com/when-ai-agents-hired-me-inside-rentahumans-real-world-hustle/), [Let's Data Science](https://letsdatascience.com/news/rentahuman-connects-ai-agents-with-human-gig-workers-322499c6)
