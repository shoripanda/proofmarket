# 10. Migration plan: only compatible changes, in an order that can be rolled back

Written: 2026-10-14

## 1. Purpose

Decide the order in which the designs in chapters 03-09 go in without breaking the existing API or production behaviour, and how to roll back each stage. Following the brief's "do not make changes that break existing features" and "work that needs prior approval", mark the work that needs approval.

## 2. Current state

Production runs on Devnet, and PRs #39-#42 (multi-token and parallel settlement) are unmerged. This design is independent of them, but the migration number (0029) and the touched files in `packages/solana` (`send.ts`, `anchor-adapter.ts`) overlap. The order assumes PRs #39-#42 go in first, with a branch for the case where they do not.

## 3. Requirements

- Each stage can be merged on its own and does not change production behaviour right after merging (it is enabled by a flag or env var)
- Rolling back means reverting code only; no DB migration needs to be undone
- Work that needs approval (production deployment, DB migrations, key changes, program deployment, mainnet transfers) is done by the operator, with the procedure written in the PR description

## 4. Proposed design: stages

| Stage | Content | Effect on production | Rollback |
|---|---|---|---|
| M0 | Merge PRs #39-#42 (under review). Apply migration 0029 first | None unless `ASSETS_ENABLED` is set (USDC only) | Revert code. 0029 is harmless if left |
| M1 | Migration 0030 (chapter 09), applied before the code | None (allows null, adds a flag candidate, adds an index) | Harmless if left |
| M2 | The Signer boundary (05 §4.1), wrapping today's keys with the `memory` backend | None | Revert code |
| M3 | Spending policy (04 §4.3) and the `x402_enabled` flag (08 §4.3). Existing credentials keep their limits, so keys with limits start being checked | **Keys from `/join` and x402 start enforcing 5 USDC and 20 USDC.** Same for operator-issued keys that have limits | The flag via `platform_flags`; limits by setting the credential to null |
| M4 | List API and quotes (04 §4.1-4.2). MCP tools gain `confirm` and `list_reality_verifications` | Only new endpoints and arguments; existing calls unchanged | Revert code |
| M5 | ~~Human-review threshold (07 §4.2)~~ withdrawn on 2026-10-16. The original plan follows | None; only takes effect if the env var is set | Remove the env var |
| M6 | Daily reconciliation and throughput measurement (06 §4.2-4.3) | A once-a-day step added at the end of the tick | Revert code |
| M7 | Replace `packages/sdk/onchain` with the Codama-generated client (02 §4.2) | The public page's check is implemented differently; display unchanged | Revert code |
| M8 | Mainnet preparation: moving the upgrade authority, the treasury cap, a KMS backend (05 §4.2-4.3, 08 §4.2) | **Operator work**, following 12 §10 | Set `SIGNER_BACKEND=memory` for the KMS |
| M9 | The ChatGPT widget, approval in the sample agent (02 §4.3, §4.5) | Optional | Revert code |

Only M3 changes production behaviour. The 5 USDC and 20 USDC written on `/join` and x402 keys are display-only today. From M3, a key with the 5 USDC trial balance is limited to 5 USDC per request and 20 USDC per day. Since the trial balance is 5 USDC, almost no request will actually be stopped (guess). For keys issued by hand, the operator checks the limits in `requester_credentials` before M3 and sets them to null where needed. That check reads the production DB, so the operator does it.

If PRs #39-#42 do not go in, keep M1 numbered 0030 (gaps allowed) and do M2 against main's `send.ts` and `anchor-adapter.ts`. Merging #40-#42 later will conflict, but the Signer change is limited to how `operatorSecretKey` is passed, so resolving it is small.

## 5. Rationale

Enabling through flags and env vars is how `RISING_BOUNTY_ENABLED` and `external_review_enabled` already work, and the operator is used to it. DB migrations are limited to forms that never need undoing because production migrations are run by hand by the operator (`pnpm db:migrate`), and we do not want more steps to undo them.

## 6. Alternatives

- One big PR. Review takes longer and M3's behaviour change gets lost among the rest. One PR per stage
- Doing M8 first. Where keys live is a prerequisite for mainnet, but without the Signer boundary (M2) a new place cannot be plugged in. M2 → M8 is required

## 7. Security considerations

Without checking existing credential limits before M3, keys issued by hand could suddenly stop. Affected requesters receive `TASK_AMOUNT_LIMIT_EXCEEDED`, so the cause is clear, but changing it without notice is avoided. M8's switch to a KMS goes to production only after a round trip equivalent to `devnet-setup` passes on Devnet.

## 8. Implementation issues

- M2-M4 touch `packages/core/src/schemas/api.ts`, so CI checks `pnpm openapi` and the IDL for drift
- M7 needs a decision whether to exclude Codama's output from `biome` or format it after generation (02 §8)
- Each PR description includes "steps needed in production", which the operator copies to the end of `docs/proofmarket-schedule-2026-10.md` (the rule in `docs/agents/README.md`)

## 9. Test strategy

For each stage, run the "test strategy" of chapters 04-09 and pass the three CI jobs and `APP_ENV=demo pnpm build`. For M3, check by eye with `pnpm dev:local` that exceeding a trial key's limit returns a 4xx. M8 is verified on Devnet, and the first production transaction is a small amount (1 USDC or less) sent by the operator.

## 10. Open questions

- The order of M0 and M1 (when PRs #39-#42 are merged)
- How to treat limits on hand-issued keys before M3 (set to null, or keep)
- M8's KMS backend
