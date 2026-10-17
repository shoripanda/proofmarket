# Running the settlement adapter on Surfpool (2026-10-15)

Task 1-c of chapter 11 in `docs/architecture/`. Checked whether ProofMarket's deployment binary and settlement adapter run on `@solana/surfpool` (an in-process Solana runtime, a native add-on written in Rust), which the Solana Foundation's kit/nextjs template uses for tests.

## Conclusion

It works. `target/deploy/proofmarket.so` (SBPF v0, the real Devnet deployment build from `cargo build-sbf --tools-version v1.57`) was loaded into Surfnet, and `initialize_config` → `initialize_task` → `finalize_verification` + `settle` → `initialize_task` → `refund` were run through the real `createSettlementAdapter`. Everything passed in 330 ms from start to stop. It can replace the localnet tests, which needed `solana-test-validator` started by hand and `devnet-setup` run, while working around instability right after start-up (failure log 2026-10-11 in CLAUDE.md).

| Step | Elapsed (ms) | Result |
|---|---|---|
| Start Surfnet (offline, 400 ms slots) | 40 | `http://127.0.0.1:<dynamic port>` |
| Deploy the `.so` (`surf.deploy({ programId, soPath })`) | 46 | Loaded at the declared program id |
| Create a mint, deposit 100 into the treasury | 175 | Ordinary spl-token steps |
| `initialize_config` | 189 | Through Anchor's `Program` |
| `assertSafeToStart` | 196 | Checks genesis and Config |
| `fundTask` | 223 | Funded |
| `finalizeAndSettle` (1 recipient) | 276 | Settled, `paid_total` 500000, 0.5 in the witness's ATA |
| `fundTask` → `refund(Cancelled)` | 327 | Refunded |

## Method

- Installed `@solana/surfpool` 1.6.1 (published 2026-10-11) with `npm i` in the scratchpad and started it with `Surfnet.startWithConfig({ offline: true, slotTimeMs: 400 })`. Without `offline` it fetches mainnet accounts remotely
- The script was placed temporarily in the repository's `scripts/` and run with `pnpm --filter @proofmarket/scripts run run <file>` (resolving `@proofmarket/solana` and `@anchor-lang/core` needs the workspace). Run directly from the scratchpad with `tsx`, dependencies are not found
- All keys were throwaways created on the spot. Neither Devnet nor `~/.config/proofmarket/` was touched

## Caveats

- **Finality is instant.** Surfnet finalizes transactions as soon as they are sent, so mainnet's finality wait (about 7 seconds, 16 §2.3) and resend behaviour cannot be measured. It is useless for throughput measurement (chapter 11, 5-a and 5-b) and is for checking program and adapter logic
- **The port is dynamic.** `packages/solana/test/localnet.test.ts` hard-codes `http://127.0.0.1:8899`, so moving to Surfpool means the test must take the RPC URL as input
- The `.so` must exist in local `target/deploy/`. To use it in CI, a `cargo build-sbf` step (platform-tools v1.57) must come first, in a job with the Rust toolchain installed
- It is a native add-on, so adding it to `allowBuilds` in `pnpm-workspace.yaml` needs a decision (failure log 2026-10-02). This time it was installed with npm in the scratchpad

## Next (queued under chapter 11, 5-b)

1. Add `packages/solana/test/surfpool.test.ts` running this script's flow (config → fund → settle → refund, including USDT-like and PYUSD-like mints) inside vitest. Keep the `PM_LOCALNET` procedure as is
2. Decide whether the CI `program` job runs this test after `cargo build-sbf`, or passes the `.so` as an artifact
3. Throughput targets (16 §7.1) cannot be measured on Surfpool; use measurements after the mainnet move (`tick_runs`, `last_tick` in `/v1/health/ready`)
