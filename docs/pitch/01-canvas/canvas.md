# ProofMarket Hackathon Canvas

Written: 2026-10-04 / Submission: 2026-10-12 (Colosseum, Crypto World's Fair)
Based on: `specs/proofmarket/project-brief.md`, `problem.md`, `competitor-differentiation.md`, `implementation/en/01-requirements-definition.md` §4.15–4.17, and "Direction" in `docs/proofmarket-schedule-2026-10.md`

**Anything in [brackets] is for the owner to fill in.** Copy numbers from `/stats`. No guessed numbers.

## In one line

Return the results of human work in a form the requesting AI can trust.

AI agents cannot check things on site, read paper records or ask by phone themselves. ProofMarket asks people to do it, checks the photos and answers that come back against the request, and records the result and payment on Solana. The requesting agent receives an answer whose content has been checked, as JSON, and moves straight on to its next step.

## Lean section

### Problem

Agents can ask people for work, but have no way to check whether what comes back matches the request. Looking at a photo and judging "is this really that shop" or "are all the requested items there" takes more than an agent that was not there has to go on. In the end, a human staff member checks it, or it is used unchecked.

Today's options (RentAHuman, Taskin, NeedaHuman and others) solve "you can ask a person". Checking the content and returning it in machine-readable form is left to the requester.

### First narrow user

- **Requesters**: developers building agents that deal with information about Japan, e.g. agents for travel and restaurant bookings, real estate, or procurement research
- **Workers**: invite-only workers joining the trial in Tokyo
- **First entry point**: information in Japan that exists only on paper and on site — notices in shops, paper records, things learned only at a counter or by phone. It is not on the web, so no agent can reach it however smart it is
  - [Awaiting owner confirmation: is this the entry point?]

### Current alternatives

| Alternative | What it lacks |
|---|---|
| Web search, maps | Stale or missing, especially for small shops and government counters in Japan |
| Services for asking people (RentAHuman, Taskin, NeedaHuman etc.) | You can ask people. Checking the result against the request, and cross-checking several people, is the requester's job |
| Asking acquaintances or staff | Fast but does not last. Records and payments are manual |

### Unique value

1. **The content of every submission is checked**: submissions that pass mechanical checks (nonce, time, location, photo reuse) are further checked by Claude against the request text, answer and photos. If they differ from the request, the worker gets it back with a reason and can fix it on the spot
2. **Agreement among several people**: the same request goes to two or more people and is finalized only when answers agree. The agent chooses how many
3. **Results and payments stay on Solana**: the reward goes into escrow when the request is made; on finalization the result hash is recorded and the worker paid. Requesters and third parties can check it later in Explorer
4. **Request without signing up**: with x402, an agent pays USDC from its own wallet and requests on the spot (being built by owner A on 10/4; it goes into materials once merged)

Others also let you "ask a person". The difference is returning the result in a state where it can be used as is.

### Why now

- Agents now book, buy and procure on their own, so there are more moments when real-world facts need checking
- MCP lets any agent call tools, and x402 lets agents pay on the spot
- Models that read photos and text and judge them against the request in tens of seconds per item have become available

### Why crypto

- The requesting agent and the worker do not know each other. With the reward in escrow up front, the worker can act without worrying about being paid
- The result hash stays in a public ledger, so third parties can confirm the operator did not rewrite results afterwards
- Agents have no bank account or credit card. With USDC, a wallet is enough to pay

### Why Solana

- A request's reward is tens to hundreds of yen. Fees have to be smaller than that
- Escrow, result record and payment should finalize per request in seconds
- There is a Solana version of the x402 spec (the exact scheme), and USDC circulation is large

### Entry point for growth

1. Paper and on-site information in Japan, starting in Tokyo (where workers are easiest to gather)
2. Be where agent developers are: an MCP server, a REST API, an x402 endpoint
3. Add request types on the same checking mechanism (17 now: shop opening, queues, stock, prices, transcribing signs, paper records, phone calls and more)
4. Add regions. Worker trust levels (4 tiers) let strangers be trusted with work

### MVP (running as of 10/4)

- REST API and MCP server (with OAuth): create, get, cancel and dispute requests
- A mobile web app for workers: sign-in (email or Google), invite codes, request list, on-the-spot capture, sending answers, reward statements
- Mechanical checks: nonce, acceptance window, location, detection of reused and near-identical photos
- Content checks and send-backs by Claude (up to 3 attempts)
- Agreement among several people (majority; for text answers, everyone's are returned)
- Escrow, result recording, payment and refund on Solana Devnet
- Public result pages (no photos), webhooks, result reuse, reports from shops, requester screens
- Being added on 10/4: the x402 endpoint (A), up to 4 photos (B), the results page `/stats` (C)

### Numbers measured during the hackathon

Published on `/stats`. Targets from direction 4 of `docs/proofmarket-schedule-2026-10.md`.

| Number | Target (by judging) | Actual |
|---|---|---|
| Workers with a valid submission | 10–20 | [worker count] |
| Completed requests | 50–100 | [completed count] |
| Total USDC paid to workers | — | [total paid] |
| Median time from request to result | — | [median minutes] |
| Sent back by the AI check, and later fixed and passed | — | [sent back] / [passed after resubmission] |
| Outside agent developers who tried it | A few | [outside developers] |

## Matty Taylor's six questions

### 1. Was the opportunity found through lived experience or obsessive curiosity?

[Owner writes] Answering these fills it in:

- Have you had research you asked an AI for get stuck because of on-site or paper information? What was it?
- Why did you think "checking the result of a request" matters more than "asking a person"? What event triggered it?
- Why do you want to keep working on this problem after the hackathon?

### 2. Can you build, fix and prioritize at an elite pace?

Facts that answer it: the spec was fixed on 10/2, and by 10/4 the API, MCP, worker app, Solana program and AI checks were in production. Request types went from 1 to 17. Commit and PR counts can be checked on GitHub.

[Owner adds: one thing you fixed after using it yourself]

### 3. Is now the time?

The three points of "Why now" above: agents have started taking real-world actions, MCP and x402 are in place, and judging photos and text has become cheap and fast.

### 4. Is there a credible distribution path / usage loop?

Honest answer: not proven yet. What exists is the entry point "any agent can call it without signing up" through MCP and x402.

Loop hypothesis: more requests → more worker income draws more people → shorter waits → more requests. Result reuse (returning a shop's recent result without sending anyone) lowers requesters' cost as volume grows.

To confirm during the hackathon: 10–20 workers, 50–100 completions, a few outside developers trying it. Results: [fill in actuals]

### 5. Is it creating a crypto-native market that can grow large?

A market where agents pay for themselves passes through neither card-company review nor invoices. Agents paying people in USDC and checking the result on a ledger only works with wallets. Each request is small, but it runs as many times as there are agents.

There is no well-founded number for market size yet, so none goes into the materials.

### 6. Is there the tenacity to see it through?

[Owner writes] Development and running requests continue after submission until the interview (top of the schedule). Anything beyond that should be in the owner's own words.
