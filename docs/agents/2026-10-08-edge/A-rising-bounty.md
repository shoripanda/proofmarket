# Owner A: a reward that rises with urgency (design §1)

Branch: `feat/rising-bounty`. Worktree: `~/proofmarket-a`.

## What to build

1. **Solana program v1.1** (`programs/proofmarket/`)
   - Add `amount_per_witness: Option<u64>` to `FinalizeVerificationArgs`. With `Some(a)`, require `a > 0 && a <= task.amount_per_witness` (new error such as `AmountIncrease`), set `task.amount_per_witness = a`, then proceed as before. With `None`, as before
   - `settle` does not change (it uses `task.amount_per_witness`, so it pays the final amount automatically and the remainder goes to the treasury)
   - Add 2 tests to `programs/proofmarket/tests/program_tests.rs`: "finalize with a lower amount → settle pays the lower amount and the remainder returns to the treasury" and "an attempt to raise it is rejected"
   - Verify locally as the failure log says: `CARGO_PROFILE_DEV_DEBUG=0 CARGO_INCREMENTAL=0 cargo test -p proofmarket`. Build with `cargo build-sbf --manifest-path programs/proofmarket/Cargo.toml --tools-version v1.57` (failure log). Check first with `df -h /System/Volumes/Data` that 8 GB or more is free
   - The IDL changes, so after `anchor build` update the IDL in `packages/solana` (grep for whether it lives in `packages/solana/src` or `idl/`), and let `finalizeAndSettle` in `anchor-adapter.ts` pass `amountPerWitness?: bigint` (add an optional `amountPerWitness` to `FinalizeAndSettleInput`)
   - **Deploying to devnet** comes last and is run by the owner with `!` (a production-grade operation, so do not run it yourself): `solana program deploy target/deploy/proofmarket.so --program-id ~/.config/proofmarket/proofmarket-program-keypair.json -u devnet -k ~/.config/proofmarket/admin.json`. Admin has 3.5 SOL. Afterwards confirm the Data Length changed with `solana program show A9frCat4fv1rKRKF4sAg6WT8LaUwm4CvJ1JZb81kgC2s -u devnet`

2. **API and ledger** (`apps/web`)
   - Add `max_amount` (Amount, optional) and `ramp_minutes` (10–1440, optional; defaults to the minutes until the deadline) to `CreateVerificationRequestSchema.bounty`. `max_amount < amount` is 400
   - `requester-service.createVerification`: the reservation and FUND_TASK use `max_amount` (or `amount` if absent) × witnesses. Store `bountyMaxAmount` and `bountyRampMinutes`. Unless the env var `RISING_BOUNTY_ENABLED` is true, refuse `max_amount` with `VALIDATION_FAILED` (`reason: "disabled"`) (a safety valve before deployment; add it to `apps/web/lib/env.ts`)
   - Put a "current amount" function `currentBounty(task, now)` next to `packages/core/src/domain/money.ts`: `amount + (max − amount) × min(1, elapsed minutes / ramp)`, rounded to 6 decimals. Once fixed (`bountyFinalAmount` set), that amount
   - Claim creation in `worker-service`: on the first claim (the request has 0 claims) store `bountyFinalAmount = currentBounty(now)` and return the difference `(max − final) × witnesses` to `requester_ledger` as a `RELEASE` row (follow an existing `entry_type` if there is one; otherwise add `RESERVE_RELEASE` and exclude it from the `startOfSpendDay` totals). Record `rewardAmount` on the claim row
   - `settlement-jobs`: pass `bountyFinalAmount ?? bountyAmount` as `amountPerWitness`, and match `totalMicro`
   - `views.ts`: return `max_amount`, `ramp_minutes` and `current_amount` in `bounty` on `GET` (add to the schema). Add `reward.current`, `reward.max` and `reward.rises_until` (ISO) to the list and detail in `worker-service`
   - `settlement.paid[].amount` in the result becomes the final amount. Check `buildResult`

3. **Worker screens**
   - List (`apps/web/app/(worker)/tasks/page.tsx`): for rising requests, a small "↑" and `max` next to the amount. Detail (`tasks/[id]/page.tsx`): "Now 0.42 → up to 0.60 USDC (maximum in 12 min)". No sound

4. **MCP**: add one sentence to the `REQUEST_TOOL` description: "bounty.max_amount and ramp_minutes let the reward rise until someone takes it".

5. **Docs**: add check rows for `max_amount` and `ramp_minutes` to the table in 05 §2.1, and a `bounty.max_amount` row to the field table on `/developers` (Japanese and English).

## Tests
- `apps/web/test/requester-api.test.ts`: creating with `max_amount` reserves `max × n`; with `RISING_BOUNTY_ENABLED` false, 400
- `apps/web/test/worker-flow.test.ts` or a new `rising-bounty.test.ts`: advance `createTestApp`'s clock and claim → `bountyFinalAmount` is the intermediate amount, the difference returns to the ledger, a second claim gets the same amount
- If there is a `settlement` test, check `amountPerWitness` is the final amount
- The 2 Rust tests

## Done when
Create a rising request; claiming midway records the final amount and returns the difference to the balance. In LiteSVM, settle pays the final amount. Once deployed to production Devnet, the owner sets `RISING_BOUNTY_ENABLED=true` in Vercel (write "awaiting deployment" in STATUS.md).
