# ProofMarket

**Whatever your AI agent cannot do itself, ask a person — and get the answer back with proof.**

ProofMarket is a reality-verification network for AI agents. An agent asks a question about the physical world ("Is this shop open right now?", "Transcribe the notice at the entrance", "Phone the clinic and ask whether they take walk-ins"). A person nearby, or at home, does the work, submits photo evidence and an answer, and gets paid in USDC on Solana the moment the evidence passes automated checks and an AI review. The agent receives a machine-readable result, a public proof page and an on-chain attestation.

Built for the Colosseum **Crypto World's Fair** hackathon (October 2026).

| | |
|---|---|
| Live site | https://proofmarket.fun ( [English](https://proofmarket.fun/en) ) |
| Try it in the browser | https://proofmarket.fun/try |
| Developers (MCP / x402 / REST) | https://proofmarket.fun/en/developers |
| Public map and open dataset | https://proofmarket.fun/map · https://proofmarket.fun/data |
| Live numbers | https://proofmarket.fun/stats |
| Solana program (Devnet) | `A9frCat4fv1rKRKF4sAg6WT8LaUwm4CvJ1JZb81kgC2s` |

## Why Solana

Every verified answer ends in **one Solana transaction** that records the hash of the evidence and the result and pays the worker from escrow. The bounty is locked in an Anchor-program escrow when the request is created, so the person doing the work knows the money is there, and the agent knows nothing is paid unless the checks pass. Agents without an account pay per request over **x402** (USDC on Solana; the operator co-signs as fee payer, so the agent needs no SOL). Workers get a Privy embedded wallet and never see a seed phrase.

## Three ways in

1. **MCP** — a remote MCP server with OAuth 2.1 (dynamic client registration + PKCE). Works as a custom connector in claude.ai and ChatGPT, and with `claude mcp add` in Claude Code. Seven tools: `request_reality_verification`, `get_reality_verification`, `cancel_…`, `dispute_…`, `watch_…`, `list_…_watches`, `stop_…_watch`.
2. **x402** — `POST /v1/x402/verifications`, no sign-up, paid per request with Devnet USDC.
3. **REST** — `POST /v1/verifications` with an API key; OpenAPI at [`packages/core/openapi.json`](packages/core/openapi.json).

Seventeen request types, from "at a place, choose an answer" (shop status, queue length, crowd, parking, stock) through "at a place, number / text" (price, sign transcription, site report) to "anywhere" (document transcription, document Q&A, product inspection, phone inquiry, measurement, custom tasks).

## What happens to a request

```
agent asks ──► bounty escrowed on Solana ──► a person acts (photo + answer)
   ──► checks: geofence · freshness · task nonce · replay · duplicate · AI vision review
   ──► one transaction: result hash recorded + worker paid ──► result with proof page and badge
```

Raw photos and GPS stay off-chain and are never public. Only hashes, state and settlement go on-chain. Free-text answers are visible to the requester alone; verified facts about public places can be published to the map and the open dataset (CC BY 4.0) when the requester opts in.

## Repository layout

```
apps/web/               Next.js 16 — worker PWA, /v1 API, MCP endpoint, public pages (/r, /map, /data, /try)
packages/core/          domain logic, zod schemas, OpenAPI (no DB, no chain — fast unit tests)
packages/db/            Drizzle + PostgreSQL (Supabase in prod, PGlite in tests), SQL migrations
packages/solana/        Anchor client, escrow / settle transaction builders
packages/mcp/           MCP server (Streamable HTTP, OAuth 2.1)
packages/sdk/           TypeScript SDK for requesters
programs/proofmarket/   Anchor program (escrow, settle, refund, attest)
scripts/                operations: review runner, x402 sample agent, devnet setup, seeding
specs/proofmarket/      requirements, API contract, data models, security — the source of truth
docs/                   pitch materials, submission report (ja), operating notes
```

## Running it locally

Requires Node 24, pnpm 12, and (for the program) Rust + Anchor 1.2.

```bash
pnpm install
pnpm dev:local        # web app on http://localhost:3917 with PGlite (no Solana or Supabase needed)
pnpm test             # vitest across packages
pnpm lint && pnpm typecheck
pnpm build            # Next.js production build
pnpm program:test     # cargo test -p proofmarket (LiteSVM)
```

Try the sample agent against production (it lists the 17 types and dry-runs without paying):

```bash
pnpm --filter @proofmarket/scripts run run x402-agent.ts --list-types
pnpm --filter @proofmarket/scripts run run x402-agent.ts --base-url https://proofmarket.fun --dry-run \
  --type SIGN_TRANSCRIPTION --question "Transcribe the opening-hours notice at the entrance"
```

Secrets are never kept in the repository. Local runs read them from `~/.config/proofmarket/`; see [`specs/proofmarket/implementation/ja/11-code-skeleton.md`](specs/proofmarket/implementation/ja/11-code-skeleton.md).

## Documents

- Product concept: [`docs/proofmarket-concept-2026-10-02.md`](docs/proofmarket-concept-2026-10-02.md)
- Specifications (read order in its README): [`specs/proofmarket/`](specs/proofmarket/README.md)
- Implementation design (ja source, en translation): [`specs/proofmarket/implementation/`](specs/proofmarket/implementation/)
- Pitch deck, video scripts, worker recruiting: [`docs/pitch/`](docs/pitch/)
- Report for the university (ja): [`docs/submission/`](docs/submission/)
- Rules for AI coding agents working in this repository: [`AGENTS.md`](AGENTS.md)

## 日本語

ProofMarket は、AI エージェントが自分ではできないことを人に頼み、証拠つきの答えを受け取るための仕組みです。店が開いているかの確認から、掲示の書き起こし、電話での問い合わせ、街ぐるみの調査まで、人が現地や自宅で作業し、写真と答えを出します。検査と AI の判定を通ったものだけが Solana 上の 1 つの取引で記録され、同時に報酬が支払われます。

本番は https://proofmarket.fun 、体験ページは https://proofmarket.fun/try 、worker 向けの入口は https://proofmarket.fun/join です。仕様の正本は `specs/proofmarket/`、動かし方は上の「Running it locally」を見てください。

## License

Source code: MIT. Open dataset at `/data`: CC BY 4.0.
