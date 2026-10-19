# Review of program v1.2 (2026-10-13, by the operator)

A record of the operator re-reading the Anchor program `programs/proofmarket` (v1.2, up to `e74ebd5`) before handling real funds on mainnet. **This is not a third-party audit.** It covers what was read, what was checked, caveats found, and the operating rules kept on mainnet.

## What was read

- `src/lib.rs`, `state.rs`, `constants.rs`, `error.rs`, `events.rs`, `instructions.rs`
- 7 instructions: `initialize_config`, `update_config`, `add_mint` / `remove_mint`, `initialize_task`, `finalize_verification`, `settle`, `refund`
- LiteSVM tests `tests/program_tests.rs` (23 tests at v1.2: P-INIT-01–03, P-FIN-01–04, P-SET-01–05, P-REF-01–03, P-OVF-01, P-CFG-01, P-MINT-01–05). On 2026-10-13 all 23 passed against the deployable .so (`cargo build-sbf --tools-version v1.57`, 318,120 B, SBPF v0). v1.3 brings it to 29 (see the addendum)

## Paths where funds move, and what protects them

| Path | Signing key | What was checked |
|---|---|---|
| treasury → vault (`initialize_task`) | operator | Refused when `paused`. Amount > 0, 1 ≤ quorum ≤ required ≤ max_witnesses, deadline in the future, `amount × required` with checked_mul. The Task PDA uses `init`, so the same task_id_hash cannot be created twice (no double funding). The mint must be `Config.bounty_mint` or a mint admin added with `add_mint`. For bounty_mint the treasury is pinned to `Config.treasury`; otherwise it must be an account owned by operator |
| vault → witnesses (`settle`) | operator | Only in state `Finalized`. As many receiving accounts as `recipient_count`; each equals `get_associated_token_address(recipient, mint)`, is owned by the token program, writable, and matches mint and owner. **All accounts are checked before** any transfer. The amount paid is `amount_per_witness × recipient_count`, at most the vault balance; the remainder goes to the treasury, and the vault is closed with rent to operator. For wSOL the destination is the wallet itself (system-owned), and an empty wallet is only paid an amount at or above rent (`PayoutBelowRent`). The vault is closed into the task account and the program moves lamports to the wallets. The total moved equals the vault's lamports (the task account's balance does not change) |
| vault → treasury (`refund`) | operator | Only in state `Funded`. Reason `None` is refused. `Expired` only after the deadline. Everything goes to the treasury and the vault is closed |
| Recording the verdict (`finalize_verification`) | verifier | Only in state `Funded`. Root and hash non-zero; recipients without duplicates or default keys, at most required and at most MAX_RECIPIENTS (5). Verified / NoConsensus need at least quorum, InsufficientWitnesses at least 1 and below quorum, None is refused. The amount may be lowered but not raised (`AmountIncrease`) |

Preventing double payment: `settle` and `refund` take the vault as an `UncheckedAccount` and read it **after checking the state**. They stop with `InvalidStatus` before failing on reading a closed vault (D8–D10). Nothing transitions out of `Settled` or `Refunded`.

Key separation: `initialize_config` and `update_config` require operator ≠ verifier. The key deciding recipients (verifier) and the key moving the vault (operator) are different, so one leaked server key is not enough to pay oneself.

## Caveats (not code defects, but they matter on mainnet)

1. **operator can refund a `Funded` task as `Cancelled` at any time.** Even while a witness is working, the chain does not stop it. The only guard is server-side (T15: do not cancel while a witness is on the way). If the operator key leaks, rewards in progress return to the treasury (witnesses lose). → Operations: keep the operator key only in Vercel env vars, and if a leak is suspected, change it with `update_config` (signed by admin).
2. **`finalize_verification` has no time limit (D-11).** If the verifier key leaks, recipients of tasks still `Funded` can be chosen at will. But operator does the paying, so funds do not move unless both leak. → Operations: manage the verifier key in a different place from operator.
3. **`refund` can only mark `Expired` a task still `Funded` past its deadline.** If witnesses submitted but verifier never finalizes, funds stay in the vault. This happens if the server's tick stops. → Operations: always receive the tick alerts of 08 §5.
4. **`update_config` can change `bounty_mint` only together with the treasury.** Correct. After the change, tasks `Funded` in the old mint can still settle/refund, because `is_treasury_for` also allows "an operator-owned account of the same mint".
5. **The program's upgrade authority.** The key that ran `solana program deploy` (admin) becomes the upgrade authority. If it leaks, the program can be replaced. → Operations: never put admin on a server. After deployment, move it with `solana program set-upgrade-authority` to a multisig or hardware wallet, or at least to a separate key until audited.
6. **The wSOL path of `settle` when the recipient wallet is "not empty but below rent".** An existing wallet always holds at least rent, so this state cannot occur. Checking only for 0 is enough.
7. **Events are emitted, but the server reads accounts, not events.** If monitoring is added, reconcile `paid_total` from `TaskSettled` with the DB's `payment_records` daily.

## What was not found

- Integer overflow (every use of checked_mul / checked_sub was checked)
- Account substitution (everything is pinned by seeds and `address =` constraints)
- Signer substitution (each instruction's signer must match a key in `Config` via `address =`)

## Rules kept on mainnet (together with the safeguards in the decision document)

- Keep at most twice the expected daily payouts in the treasury; move the excess to admin
- Never put admin on a server. The upgrade authority is admin too
- Manage the operator and verifier keys in different places, and change them with `update_config` if a leak is suspected
- Always receive tick alerts (DEAD, settlement over 10 minutes, SOL balance)
- Get a third-party audit before the volume of funds grows. Do not raise the treasury cap until then

## Addendum: changes in v1.3 (2026-10-14)

16 §5 made Token-2022 mints escrowable too. As with v1.2, there has been no third-party audit.

**What changed.** Account types became `token_interface`, and every transfer became `transfer_checked`. An optional `mint` was added at the end of refund. The layouts of `Task`, `Config` and `AllowedMint` did not change.

**What protects it.**

- initialize_task and settle refuse if the token program passed does not match the mint's owner. There is no way to route a transfer through another program
- Witness accounts are limited to ATAs derived with the mint's owning program. Passing an SPL Token ATA gives `RecipientAccountMismatch` (test p_t22_05)
- Extensions are checked against an allow list. The transfer fee must be 0 in both epochs, and a transfer hook passes only when its program is unset. add_mint checks all of them; initialize_task checks fee and hook every time (p_t22_03, p_t22_04)
- Trying to refund a Token-2022 request without the mint is refused with nothing moved (p_t22_02)

**Remaining risk.** It leans on the premise of trusting the issuer when listing a token.

- PYUSD and USDG have a permanent delegate, so the issuer can move the vault's contents. This is the same kind of trust as USDC's freeze authority
- If the issuer raises the fee after funds are escrowed, witnesses receive the amount minus the fee. The amount leaving the vault does not change, so settle never stops
- If the issuer sets a transfer hook after funds are escrowed, settle and refund transfers need extra accounts and payouts stop. Resuming means waiting for the issuer to remove the hook. Treated like a freeze and part of the listing decision
- No payouts while paused (Pausable). Also the same as a freeze
