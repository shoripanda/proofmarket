# 13. Distinctive features and a beginner's path (designed 2026-10-08)

Ideas A-G and "a path that does not rely on text" from `docs/pitch/07-landscape-and-edge.md`, broken down to a level that can be built without hesitation. The authoritative requirement is 01 §4.26 (which points here). The build order and the "done" criterion per PR are at the end. Nothing not written here gets built.

## 0. Ground rules

- **One DB change.** Migration `0023_edge_features` holds every column and table used in this document (§8). Later PRs add no migrations
- **One Solana program upgrade** (v1.1, §1), with the admin key as upgrade authority. Other features do not touch the program
- **Pictures and sound over text.** Each new screen gets its meaning across with three things — a one-line heading, a picture (icon or animation) and audio — with explanatory text as support (§7). Jargon can be swapped for "plain words" (Solana → a record no one can alter, USDC → digital dollars, escrow → held in trust, MCP → AI's connection point, x402 → pay on the spot)
- **Existing checks, verdicts and records do not change.** New features are added before or after them
- **API compatibility.** Existing fields are never removed; every new field is optional (omitting it behaves as before)

## 1. A bounty that rises with urgency (rising bounty)

**Request**: `bounty` gains `max_amount` (optional) and `ramp_minutes` (10-1440, defaulting to the time until the deadline). `amount` is the starting amount and `max_amount` the ceiling. The reward rises linearly from creation and reaches the ceiling after `ramp_minutes`. Without `max_amount` it is fixed as before.

**How the price is set**: the worker list shows "now" and "up to". **The amount at the moment of the first claim** becomes the request's fixed amount, the same for everyone afterwards (a multi-person request never has different amounts per person, because there is one `amount_per_witness` on chain). The claim row records `reward_amount`.

**Funds**: at creation, `max_amount × people` is reserved and escrowed on chain at `max_amount`. Once the fixed amount is known, the difference `(max − fixed) × people` returns to the requester's balance.

**Program v1.1**: `FinalizeVerificationArgs` gains `amount_per_witness: Option<u64>`. When given, check `≤ task.amount_per_witness` and overwrite `task.amount_per_witness`; `settle` pays that amount and the rest returns to the treasury (the account holding requester balances) as before. When omitted, as before. Nothing else changes. LiteSVM tests gain "pay a lower amount" and "refuse a higher one". Deploy with `anchor build` → `solana program deploy --program-id A9fr…` (admin key). Until deployed, `RISING_BOUNTY_ENABLED=false` makes the API refuse `max_amount` with 400.

**API**: `bounty` in `GET` returns `max_amount`, `ramp_minutes` and `current_amount` (now, or the fixed amount once fixed). The worker list and details return `reward.current`, `reward.max` and `reward.rises_until`.

**Screen**: in the worker list, a rising request shows "↑" next to the amount and a small rising band. In details: "Now 0.42 → up to 0.60 USDC (maximum in 12 minutes)". No sound.

## 2. Facts other programs can read (on-chain facts)

The on-chain Task account (PDA `["task", task_id_hash]`, `task_id_hash = SHA-256("proofmarket:task:v1:" + verification_id)`) already has `outcome`, `evidence_root`, `result_hash`, `recipients` and `finalized_at`. What is missing is "how to read it" and "how to check it".

- **SDK**: `verifyOnChain(verificationId, result, rpcUrl)` derives the PDA, reads the account, compares with `result_hash(JCS(result without the excluded fields))` and returns `{ matches, task_account, finalized_at, outcome }`. It reads the account bytes directly instead of bundling Anchor's IDL (no new dependency)
- **Public API**: `GET /v1/public/verifications/{id}/onchain` returns the PDA address, `result_hash`, `evidence_root`, `outcome`, `finalized_at`, the Explorer URL and snippets showing how to read it in Rust and TypeScript. No auth, cached 60 seconds
- **Proof page `/r/{id}`**: a "read it from a program" section with the PDA address, how `result_hash` is built, 10 lines of Rust reading it with `anchor_lang::AccountDeserialize`, and 10 lines of TypeScript with `@solana/web3.js`. For beginners, one sentence — "this answer is kept as one line in a ledger no one can rewrite" — and a picture of a ledger
- **Docs**: `docs/onchain-facts.md` (English), with examples of automatic insurance payouts and switching a booking

## 3. Optimistic verification

**Request**: `assurance: { level: "optimistic", challenge_minutes: 10-120 }`. Treated as 1 person with quorum 1, plus a challenge window.

**Flow**:

1. When the first VALID submission arrives, the task stays `SUBMITTED`, records `provisional_at`, and returns a provisional result to the requester (`result.provisional: true`, `result.challenge.until`). Webhook `verification.provisional`
2. During the window, **anyone with an API key** (including the original requester) may call `POST /v1/verifications/{id}/challenge`. The bond is `bounty × 2` (a two-person recheck), reserved from the caller's balance. Only one challenge is accepted. Whatever the challenge says, it creates a recheck by the same mechanism as §4.12 (two agreeing, same place, same question). Webhook `verification.challenged`
3. If the window passes without a challenge, it finalises normally (VERIFYING → VERIFIED → recorded as Verified on chain, worker paid)
4. If the recheck **agrees** with the provisional answer, the challenge is `UPHELD` (the provisional answer was right). The original request is final as VERIFIED. The recheck's cost comes out of the bond, and the rest is added to the original worker's pay (the on-chain amount is unchanged; the addition comes from the account holding requester balances in the worker's next payout; `payout_adjustments` in §8)
5. If the recheck **disagrees**, the challenge is `OVERTURNED`. The original request is final as REJECTED (reason `CHALLENGED`), recorded on chain as `NoConsensus` with the original worker as recipient (their checks and review passed, so they are paid; the same thinking as §4.12). The recheck's cost is charged to the requester and the bond is returned in full. The requester uses the recheck's result (`result.recheck`)

**The verdict logic does not change.** What changes is "when it becomes final" and "who can call a halt".

**Decided during implementation (2026-10-08, owner F)**:

- **Choices and numbers only.** Agreement compares answer strings, like `matches_original` in §4.12. Text answers from different people never match as strings, so any challenge would always overturn them. optimistic on a text request is 400 (`optimistic_not_for_text`); also 400 for x402 requests (a throwaway key cannot be charged for a recheck)
- **The recheck belongs to the original requester; the bond pays for it.** The recheck's RESERVE row is on the challenger's key. Even when a third party challenges, the private question and place stay hidden. Ledger movements are as in the table in 05 §2.3a. RELEASE / REFUND now go back to the key that paid the RESERVE (for ordinary requests that is the requester, so nothing changes)
- **The final time is the provisional time.** When finalising without a challenge or as UPHELD, `finalized_at` is set to `provisional_at`, so `result_hash` is the same for the provisional and final result
- **When the recheck decides nothing, UPHELD** (expiry, or the two people disagreeing): there is no evidence to overturn the provisional answer. Any unused part of the bond returns to the challenger's key
- **`challenge.state` has five values**: open, closed (window ended without a challenge), challenged, upheld, overturned. closed was added so the proof page can say "none were made"
- **One migration was added (0024)**: only adds `CHALLENGED` to the constraint on `verification_results.outcome_reason`. Tables and columns are as in 0023
- Transition T19 (VERIFYING → REJECTED, `CHALLENGE_OVERTURNED`) was added (03 §2.2)

**How beginners see it**: the proof page says "One person checked. For 30 minutes anyone could challenge it (no one did)", with an hourglass picture.

## 4. Senses index

Form fields gain `type: "scale"` with `min` and `max` (1-5 or 1-10) and `labels` (words for both ends, e.g. "quiet" and "loud"). The worker screen shows 5 or 10 circles with words only at the ends.
Aggregation: with 3 or more valid submissions on the same request, return `result.aggregate[key] = { median, min, max, n }` (verdicts stay as for text; no majority vote).
Example: `/developers` has a request "three people measure a shop's atmosphere" (four scales — smell, noise, cleanliness, brightness — with `assurance: { level: "high" }`).

## 5. People attesting to an agent's actions (attestation)

A request can carry `attestation: { subject: "agent_action", description: "..." }` (optional, up to 200 characters). The checks and verdict are the same; the wording changes.

- Workers see "What to check: an AI agent says it did '…'. Go and see whether it is true"
- The proof page heading becomes not "a person checked" but "A person confirmed: '…'" (the description is quoted so it reads both as "did …" and as a noun). The result returns `attestation` as is
- The MCP request tool's description gains one sentence on this use (delivered, installed, cleaned)

## 6. Help for workers (browser only)

Built only with what phone browsers already have, to avoid adding API contracts.

- **Read aloud**: a "Listen" button on the request details and capture screens reads the question and acceptance criteria with `speechSynthesis` (ja-JP / en-US)
- **Answer by voice**: a "Speak" button on text answer fields transcribes with `SpeechRecognition` (shown only in supporting browsers), to be checked before sending
- **Capture guidance**: if there are acceptance criteria, they are overlaid on the camera as a checklist (split at sentence ends, up to 4 lines), together with the type's `howTo`
- **Sound and vibration**: when a submission is sent, sent back, or has a result — a short sound (synthesised with Web Audio, no files) and `navigator.vibrate`. Can be turned off in settings

## 7. A beginner's path (sight and sound)

**Site**

- "Understand it in 30 seconds" on the top page: an enlarged `FlowDiagram` with narration matching its 6 scenes (Japanese and English mp3s made with Kokoro in `public/audio/`), one line of captions, one play button
- "Plain words": the `<Term>` component wraps jargon and swaps it for the words in the table above. **On 2026-10-16 the header toggle was removed and plain words are always on** (the owner: "the plain-words toggle is not needed"). A choice saved earlier in `localStorage` as `pm.plain` is no longer read
- One picture per section of `/how-it-works` (SVG line drawings: camera, checks, two people agreeing, ledger), with a heading and one sentence
- `/workers` rebuilt as "three pictures and three sentences": register → nearby requests → capture, answer and get paid

**Worker app**

- A three-screen introduction on first use only (picture, one sentence, audio): "see nearby requests", "capture and answer", "get paid". Can be skipped
- A "Listen" button next to each screen's heading, using the read-aloud of §6
- No jargon. USDC amounts come with a yen estimate (a fixed display rate; no exchange)

**/try**

- A toggle that reads the agent's "thought" bubbles aloud with `speechSynthesis`, off by default (autoplaying sound is disliked). **Removed on 2026-10-16** together with autoplay, at the owner's request

**The agent connection path `/connect` (2026-10-13)**

Connecting meant going back and forth across four pages: top → `/developers` (15,000 characters) → `/join` (whose first choice was worker) → the AI's settings. The screen that handed over the key only had steps for Claude Code and REST, sending claude.ai and ChatGPT users back to `/developers`, and there was no step to check the connection worked. References: rentahuman.ai's `/for-agents/setup` (numbered steps stacked on one page, with the issued key dropped into the text to paste), Timee's "four steps to start working" (one verb and one sentence per step) and Storesight (one kind of button to press).

- `/connect` (English `/en/connect`) finishes on one page. **1 Get a key** (issued by email address; the same API as 01 §4.28 with `role = requester`; those who have one paste it) → **2 Pick your AI** (six cards: claude.ai, ChatGPT, Claude Code, Codex, Cursor and similar, your own; only the chosen AI's steps are shown, numbered, with the key from step 1 already in the commands and config, each with a copy button) → **3 Check it is connected** (one sentence to send to the AI, "list ProofMarket's tools", and a sample first request). Below: "if it does not connect" (collapsible by symptom) and "what's next" (`/developers`, `/pricing`, the requester console)
- Claude Code and Codex get a "just paste one line" step first: a sentence asking the agent to read `llms.txt` and set itself up. `llms.txt` gained a "Setup instructions for agents" section
- The key lives only in React state, never in `localStorage` or similar; it disappears when the tab closes
- Navigation: a "Connect your agent" button always on the right of the header (worker login demoted to an outlined button). The top page's hero button and the agent card in "Which one are you?" go to `/connect`. A "three steps to connect" band on the top page. `/developers` opens with a box pointing to `/connect`, and its "connect from each AI" section moved to `/connect`, keeping only references. `/join` is for workers only; `?role=requester` redirects to `/connect` with 307. The "no key?" links on the consent screen and the requester console login also go to `/connect`
- The screen consistently says "API key" (no other term). The step text does not mention MCP or OAuth; they go in notes

## 8. Migration `0023_edge_features`

```
verification_requests
  bounty_max_amount        numeric(20,6)  null   -- §1
  bounty_ramp_minutes      integer        null   -- §1
  bounty_final_amount      numeric(20,6)  null   -- §1 fixed at the first claim
  challenge_minutes        integer        null   -- §3
  provisional_at           timestamptz    null   -- §3
  attestation              jsonb          null   -- §5 { subject, description }
claims
  reward_amount            numeric(20,6)  null   -- §1 the amount at claim time
verification_challenges (new)                    -- §3
  id, verification_id, challenger_credential_id, bond_amount, recheck_verification_id,
  state text (OPEN|UPHELD|OVERTURNED), created_at, resolved_at
payout_adjustments (new)                         -- §3 additions to pay
  id, worker_id, verification_id, amount, reason text, created_at, paid_at null
```

RLS enabled on every table (`migrations.test.ts` checks).

## 9. Build order and "done" criteria

| PR | Content | Done when |
|---|---|---|
| 1 | Migration 0023. §1's API, ledger and worker display. Program v1.1 (build, LiteSVM tests, deploy to devnet). `RISING_BOUNTY_ENABLED` | Create a rising request; a claim partway records the fixed amount and the difference returns to the balance. On-chain settle pays the fixed amount |
| 2 | §2 SDK, public API, the proof page section, docs | `verifyOnChain` returns `matches: true` on a production result. The proof page shows the PDA and how to read it |
| 3 | §5 attestation, §4 scale and aggregate, examples | The wording changes from request → worker screen → proof page. The median of three people's scale answers is returned |
| 4 | §6 read aloud, answer by voice, capture guidance, sound | Works on iPhone Safari and Android Chrome (checked by hand) |
| 5 | §7 site path (30 seconds, plain words, pictures, /workers), worker first-run introduction, /try read-aloud | The flow can be followed with text hidden (checked with screenshots) |
| 6 | §3 optimistic verification | No challenge → final; challenge → recheck → agreement UPHELD, disagreement OVERTURNED. Bond and costs move as in the table |
| 7 | A **simple version** of location proof without revealing location: public surfaces (proof page, map, dataset) round locations to about 1 km (6-character geohash) with `location_privacy: "coarse"`, and a salted SHA-256 of the exact location goes into the evidence bundle. No zero-knowledge proof | Public surfaces show only the rounded location, and the requester's GET shows the exact one |

Each PR passes `pnpm typecheck`, `biome ci`, the web and core tests and `next build` locally, and is merged once CI is green. PR 1 alone is merged only after the user has applied the migration to production.
