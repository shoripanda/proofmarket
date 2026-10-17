# Owner C: a public results page `/stats`, and rewording the site's headline copy

Branch: `feat/stats-and-copy` / worktree: `../Solana-idea-c` / DB migration: none

## Why
Judges look at numbers. Show, in a form anyone can check, how many requests were actually completed by people and how much was paid on Solana. The X posts will use this page too. At the same time, align the site's headline with the direction decided today: "return the results of human work in a form the requesting AI can trust".

## What to build
1. **Results page** `apps/web/app/(site)/stats/page.tsx` (rendered on the server; match the components and look of the existing `(site)` pages), and `GET /v1/public/stats` returning the same numbers (no auth, cached for about 60 seconds).
2. **Numbers shown** (from the DB; nothing personal)
   - Completed requests (VERIFIED and SETTLED), total requests
   - Workers who have made a valid submission, requesters
   - Total USDC paid to workers (confirmed payouts)
   - Median time from request to result
   - Breakdown of AI content checks (pass / sent back / undecided), from `vision_consistency` in `evidence_checks`
   - Requests per type
   - Completions per day over the last 14 days (a plain SVG or CSS bar chart; no chart library)
   - The last 10 finalized results: only links to the existing public result page `/r/<id>` and to Solana Explorer. **No request text, answers, photos or locations** (`specs/proofmarket/privacy-security.md`)
3. **Links**: a link to `/stats` in the site header or footer, and a small "results" section on the home page (three big numbers).
4. **Rewording the headline**: align the headings and opening text of the home page (`app/(site)/page.tsx`), how it works (`how-it-works`) and developers (`developers`) with this direction:
   - In one line: an AI hands people the work it cannot do itself — on-site checks, paper records, physical objects, phone calls — and receives the result **after AI has checked its content**. Results and payments stay on Solana, where anyone can check them later.
   - What sets it apart: an AI content check on every submission, agreement among several people, results recorded on Solana and payment through escrow.
   - Mention x402 (requesting without sign-up, built by owner A) only after A's PR is merged. If written earlier, do not say "coming soon"; wait for A's merge.
   - No empty words such as "innovative" or "democratize" (the Red Flag Word List in `docs/colosseum-hackathon-playbook-2026-09-16.md`).
   - The developer page's x402 section is written by A and the connection-steps section by E. Do not touch those two.

## Do not touch
- How requests, submissions and verdicts work. The DB structure.
- The developer page's x402 section (A) and connection-steps section (E).

## Done when
- PGlite tests: the numbers are correct, and private fields (request text, answers, locations, worker IDs, payout addresses) are not returned.
- `APP_ENV=demo pnpm build` passes.
- The README's "Finishing" is satisfied and the PR is merged.
