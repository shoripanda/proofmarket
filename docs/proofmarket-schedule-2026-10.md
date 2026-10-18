# ProofMarket schedule to submission (Crypto World's Fair)

Last updated: 2026-10-04 16:10 JST
Deadline: 2026-10-12 (submission to Colosseum). Development does not stop after submission (progress is shown until the interview).

This file is the shared schedule for everyone working, people and agents alike. Update "Status" when starting and finishing work.
The reasoning behind the decisions is in `docs/colosseum-hackathon-winners-2024-2026.md` and `docs/colosseum-hackathon-playbook-2026-09-16.md`.

## Direction (decided 2026-10-04)

1. **The headline is "return the results of human work in a form the requesting AI can trust".** "AI hires humans" alone overlaps with RentAHuman, Taskin and NeedaHuman (`specs/proofmarket/competitor-differentiation.md`). The difference is three things: an AI content check (01 §4.16–4.17), agreement among several people, and results recorded on Solana.
2. **Any AI can use it without signing up.** With x402, an agent can pay Solana USDC on the spot and request.
3. **The first entry point is "information in Japan that exists only on paper and on site"** (paper records, notices in shops, things only learned at a counter or by phone). Note: awaiting the owner's final confirmation
4. **Show results in numbers.** Targets by judging: 10–20 workers, 50–100 completed requests, a few trials by outside AI developers.
5. Finish one task before moving to the next. Use whatever is finished for promotion (X).

## Work until 19:00 JST today (10/4)

The owner opens one terminal session per workstream and has each read `docs/agents/README.md` and its brief. Agents do not start sub-agents of their own (they use a lot of tokens).

| Owner | Work | Brief | Status |
|---|---|---|---|
| — | Put this schedule and the briefs in the repository | — | Done |
| A | x402: an endpoint for paying USDC and requesting without an API key, and a sample agent that pays and requests | `docs/agents/A-x402.md` | Done (feat/x402, awaiting production rollout) |
| B | Up to 4 evidence photos | `docs/agents/B-multi-photo.md` | Done (no DB migration) |
| C | A public results page `/stats`, and rewording the site's headline | `docs/agents/C-stats-and-copy.md` | Done (no production steps; x402 mentioned after A merges) |
| D | Pitch materials, scripts for 3 videos, X posts, worker recruiting copy (documents only) | `docs/agents/D-pitch-materials.md` | Done |
| E | Checking connections from Claude and ChatGPT to the production MCP / API, and a connection-steps page | `docs/agents/E-agent-clients.md` | Steps page done. Real checks on claude.ai and ChatGPT await the owner (`docs/agent-clients-check-2026-10-04.md`) |
| Main | Carry out every owner's "steps needed in production" together (Supabase migrations, reinstalling launchd, etc.) | — | Waiting |

## 10/5–10/12

| Dates | Work | Owner |
|---|---|---|
| 10/5–10/10 | Recruit workers (acquaintances, universities, X). Issue invite codes with `issue-invite.ts` | Owner (Claude prepares recruiting copy and guides) |
| 10/5–10/10 | Run real requests every day (regularly from the sample agent). Publish the numbers on `/stats` | Claude |
| 10/5–10/9 | Have outside AI developers try it (hand over the x402 / MCP steps) | Owner |
| 10/7–10/11 | Finish the pitch deck; record and edit the 3 videos | Owner (voice, appearance), Claude (scripts, screen-recording plan, editing material) |
| Daily | Post development progress on X (Build in Public) | Owner (Claude drafts) |
| 10/12 | Submit | Owner |

## What only the owner can decide

- Confirming the first entry point (direction 3)
- The founder's story (why this problem)
- Who could be asked to be workers
- Voice and appearance in the pitch video

## Running environments

- Production: https://proofmarket.fun (the old https://proofmarket-rosy.vercel.app redirects; merging to GitHub main publishes automatically)
- Database: Supabase (migrate with `DATABASE_URL=<Session pooler> pnpm db:migrate`)
- Solana: Devnet (program `A9frCat4fv1rKRKF4sAg6WT8LaUwm4CvJ1JZb81kgC2s`)
- AI content check: launchd `com.proofmarket.review-runner` on the owner's Mac (every 2 minutes, `scripts/review-runner.ts`)
- Secrets live only in `~/.config/proofmarket/`. Never in the repository or chat

## Steps needed in production (each owner adds theirs)

- B (4 photos): no DB migration. After the merge, bring main up to date with `git -C ~/Solana-idea pull`. launchd runs `scripts/review-runner.ts` from `~/Solana-idea` as is, so no reinstall is needed. Until the pull, the old runner judges only the first photo (`image_url`)
- A (x402): apply migration 0019 (`x402_wallets`, `x402_payments`, both with RLS) to Supabase. No new Vercel env vars (it uses the existing `OPERATOR_SECRET_KEY`, `BOUNTY_MINT`, `SOLANA_RPC_URL`, `SOLANA_EXPECTED_GENESIS_HASH`). x402 fees come from SOL in the operator's wallet, so watch the balance
- A (x402): after rollout, check with a real Devnet transaction: `pnpm --filter @proofmarket/scripts run run x402-fund-agent.ts --amount 1` (1 USDC from the treasury to the sample agent) → `pnpm --filter @proofmarket/scripts run run x402-agent.ts --base-url https://proofmarket-rosy.vercel.app`. Success is a 402, a payment transaction, and a 201 with a verification_id
