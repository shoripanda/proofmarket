# 10. Implementation Plan (Oct 2 to Oct 12)

> English translation. The Japanese version in [`../ja/10-implementation-plan.md`](../ja/10-implementation-plan.md) is authoritative; if they differ, the Japanese version wins.

Created: 2026-10-02

## 1. How We Proceed

Claude Code does the implementation, and the human (hereafter "the owner") prepares accounts, arranges workers and requesters, runs the field tests, and handles the video and the pitch (D-17). Dates are aligned with the milestones in `mvp-plan.md`, and work that would break Level A is pushed back.

At the end of each day, that day's PRs should have passed CI, been merged into main, and be running in the demo environment. Only work that has not been started is carried over to the next day.

## 2. Schedule

| Date | Milestone | Claude Code | Owner |
|---|---|---|---|
| Oct 2 (Fri) | M0 Spec freeze | This set of design documents | Review the design documents and answer the remaining open decisions (Chapter 00) |
| Oct 3 (Sat) | Foundation | PR-01 to 03 | Accounts and API keys for Privy, Supabase, Vercel, and Helius. Decide the pilot region |
| Oct 4 (Sun) | M1 End-to-end path | PR-04 to 06 | Run one task through on their own smartphone (no chain) |
| Oct 5 (Mon) | M2 Verification | PR-07 and 08 | Ask 2 workers and 2 requesters and lock in the dates. Pick 3 to 5 shops |
| Oct 6 (Tue) | Solana program | PR-09 and 10 | Put Devnet SOL and USDC into the operator. Try the verification failure patterns on site |
| Oct 7 (Wed) | M3 Solana integration | PR-11 and 12 | Confirm transactions in the Explorer. First draft of the demo script |
| Oct 8 (Thu) | M4 Agent integration | PR-13 and 14 (if Level A has no problems) | Try MCP from Claude Desktop and similar clients |
| Oct 9 (Fri) | M5 Real use | Bug fixes, polish of reason messages and screens | 3 or more real-use runs, fill in the record sheet |
| Oct 10 (Sat) | M5 Real use / M6 preparation | Fixes, update README and architecture diagram, aggregate from the record sheet | Remaining real-use runs (5 or more in total), pitch materials |
| Oct 11 (Sun) | M6 Deliverables | Check demo data, check links | Pitch video and technical demo video (each under 3 minutes), screenshots |
| Oct 12 (Mon) | Submission | Fix bugs found after submission | Submit, check all links |

## 3. PR Breakdown

| PR | Content | Depends on | Done when |
|---|---|---|---|
| PR-01 | Monorepo foundation (pnpm, Next.js, `packages/*`, Biome, Vitest, CI, gitleaks, `.gitignore`) | — | CI is green. An empty `/v1/health` responds in the demo environment |
| PR-02 | DB schema and migrations, seed, ID generation, error format | PR-01 | `pnpm db:migrate` applies to Supabase. U-ERR-01 |
| PR-03 | State transition table and policy rules in `packages/core` | PR-01 | U-SM-ALL, U-SM-CAN, U-POL-* |
| PR-04 | requester API (create, get, cancel), API key authentication, idempotency, limits, shop allowlist, `scripts/issue-api-key.ts` and `register-place.ts` | PR-02, 03 | I-IDEM-01 and 02, I-LIM-01, I-RACE-03, I-CRT-05 and 06 |
| PR-05 | worker authentication (Privy), registration, list, detail, claim, challenge, abandon, screens W-01 to 05 | PR-02, 03 | From login to claim on a real device |
| PR-06 | Upload, submission, minimal verification (nonce, geofence, freshness), screens W-06 and 07, development payment stub | PR-04, 05 | M1 done condition (a person runs one task through) |
| PR-07 | Full set of checks (media, replay, reason messages), image processing, audit_events, outbox (lease-based) and tick | PR-06 | I-layer tests for D2 to D6, I-OUT-01 |
| PR-08 | Consensus computation, result assembly, evidence bundle and root | PR-07 | U-CON-*, U-JCS-01 |
| PR-09 | Anchor program (all instructions) and LiteSVM tests | PR-01 | All of layer P |
| PR-10 | Devnet deployment, IDL, `scripts/devnet-setup.ts` | PR-09 | Config exists on Devnet |
| PR-11 | Settlement Adapter and outbox jobs (FUND / FINALIZE_AND_SETTLE / REFUND), startup safety checks | PR-08, 10 | I-FLOW-01 and 04, I-RPC-01 and 02, I-IDEM-03, I-FUND-01, I-SET-02 to 05, D8 to D10 |
| PR-12 | Public result page, payment history (W-08), `scripts/demo-agent.ts` | PR-11 | M3 done condition (visible in the Explorer) |
| PR-13 | MCP server and `packages/sdk` | PR-04 | Create and get from an MCP client |
| PR-14 | Multiple witnesses (`MAX_WITNESSES` set to 5), dHash, Webhook | PR-11 | I-FLOW-02 and 03, I-WH-01 |

The development payment stub (PR-06) runs only in local and preview, and startup fails if it is enabled in the demo environment. We leave no room for stub results to get mixed into the demo.

## 4. Decisions When Behind Schedule

| Situation | Decision |
|---|---|
| Level A is not working as of Oct 8 | Stop PR-13 and 14, and everyone goes back to Level A |
| Privy integration blocks us for more than a day | Switch to having workers enter their own payout address (after checking with the owner) |
| Not enough USDC from the Circle faucet | Switch to our own test mint (Chapter 06 Section 6) |
| `getUserMedia` does not work on iOS | Switch to `<input capture>` and attach the `fallback_capture` flag |
| The program does not work on Devnet by the end of Oct 7 | As an emergency measure, record the evidence root with SPL Memo and send directly from the treasury to the worker. Escrow goes away, and protection against double payment and refund exclusivity relies only on the DB unique constraint (`settle_xor_refund` in Chapter 04 Section 3.14) and the I-SET-03 and 04 tests. We explain it exactly that way in the submission |
| Not enough workers | Secure 2 through the owner and acquaintances, and report the numbers as they are without padding the count |

## 5. What to Write Separately at Submission

Following Section E of `acceptance-criteria.md`, the submission description keeps the following four separate.

- What was implemented
- What was confirmed by tests (test IDs and results)
- Pilot results (the count and median from the record sheet; no simulated runs included)
- Future work (legal review needed for Mainnet, early finalization, reputation, distributed verification, etc.)
