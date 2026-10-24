# 15. Preparing to run with real money, and paying in SOL

Written: 2026-10-11 / Decided by: the operator (2026-10-11)

## 1. Conclusion

The hackathon submission (10/12) goes out on Devnet. On top of that, two things move forward:

- **Add payment in SOL.** Rewards, prepaid balances and witness payouts can be handled in SOL as well as USDC. Built and checked on Devnet.
- **Make the switch to mainnet "just raise a flag".** Configuration, key separation, deployment steps and deposit detection are lined up. But until the legal review (D-05, `legal-checklist.md` §1, §3, §7) is done, the server does not start on mainnet.

No real money moves in this chapter's work.

## 2. Today's build, and what breaks with real money

| Item | Today | Problem with real money |
|---|---|---|
| Network | `solana-devnet` hard-coded in the API type (`network: z.literal("solana-devnet")`) | Mainnet values are not accepted |
| Startup check | Stops if the genesis hash differs from `SOLANA_EXPECTED_GENESIS_HASH` | The check exists, but there is no condition under which mainnet is allowed |
| Currency | USDC only (`asset: z.literal("USDC")`; one `Config.bounty_mint` in the program) | SOL cannot be used |
| Deposits | The operator adds TOPUP rows by hand through `admin-service` | Requesters cannot deposit themselves, and no evidence of a deposit is kept |
| Custody | The operator's keys move prepaid balances and escrow (D-05) | Registration may be required in Japan; legal review first |
| Keys | operator and verifier are server env vars; admin is local | A key holding real money is on the server |

## 3. SOL support

### 3.1 On chain, SOL is handled as wSOL

SOL does not go into a token account as is. The program escrows in SPL token accounts (vaults), so SOL is handled as **wSOL** (the native mint `So11111111111111111111111111111111111111112`). That keeps the initialize_task, settle and refund flow unchanged.

Program v1.2 lifts the restriction to a single mint.

- A new PDA, `AllowedMint` (seeds `["mint", mint]`), holds `mint` and `bump`. Its existence means "requests may be created in this mint".
- Instructions `add_mint` and `remove_mint` (admin only) register and remove it. Even after removal, already funded requests can still be paid out or refunded.
- initialize_task accepts `Config.bounty_mint` (funded from `Config.treasury` as before) or any mint with an `AllowedMint`; the latter is funded from the operator's account of that mint.
- `allowed_mint` is an optional account placed last in initialize_task's account list, with anchor-lang's `allow-missing-optionals` enabled. Servers older than v1.2 pass nothing and keep working (test p_mint_03; also checked on localnet with main's adapter).
- What remains after settle and refund goes back to an account of the request's mint that is `Config.treasury` or owned by the operator.
- The `Task` layout does not change (it already has a `mint` field).
- For a SOL request, the server wraps only the shortfall into the operator's wSOL account before funding. Refunds and unpaid remainders return as wSOL to that account and are used for the next request.

Witnesses are paid **native SOL straight to their wallets**. The first idea was to pay wSOL and have them unwrap it with a button on screen. But a witness wallet starts with 0 SOL and cannot pay the unwrap fee. So settle works in this order:

1. Return the share of unfilled slots to the treasury as wSOL
2. Close the vault into the task account. A native token account can be closed even with a balance, so the vault's rent and the SOL to pay move into the task account
3. The task account is owned by the program, so the program moves `amount_per_witness` from it to each witness's wallet and returns the vault's rent to the operator

remaining_accounts become the wallets themselves (owned by the system program, writable) rather than the witnesses' ATAs. No receiving account needs creating and witnesses sign nothing. Sending less than the rent-exempt minimum (about 0.00089 SOL) to an empty wallet fails, so it stops with `PayoutBelowRent` if short. The minimum reward of 0.001 SOL is above that.

### 3.2 Decimals

API amounts are accepted as strings with up to 6 decimals for both USDC and SOL, so the DB's `numeric(20,6)` works as is. Only when passing to the chain are they converted per currency (USDC 10^6, SOL 10^9, i.e. ×1,000). 0.000001 SOL is about 0.02 yen, fine enough for reward steps.

- Minimum reward: 0.001 for SOL (`LIMITS.minSolBounty`). No minimum for USDC, as before
- No exchange rates. Payment is in the currency and amount the requester chose. Yen estimates are display only, never used in calculations

### 3.3 API and data

- `bounty.asset` widens to `"USDC" | "SOL"`, as do prepaid balances, rewards, fees and x402.
- Prepaid balances are counted per currency. The ledger already has `requester_ledger.asset`, so `asset` is added to the balance aggregation, and sufficiency is judged on the balance in the request's currency.
- Rising bounties (13 §1), challenge bonds (13 §3) and fees accrue in the request's currency.
- Workers' earnings, the statement CSV and public stats are shown per currency, never summed into one number.
- The flag `SOL_ENABLED` (default off) opens acceptance. While off, `asset: "SOL"` is refused with `UNSUPPORTED_ASSET`.
- **x402 stays USDC only.** x402's `exact` scheme assumes an SPL token transfer. One-off payment in SOL waits for demand.

## 4. Switching to mainnet

### 4.1 Cluster setting and the startup gate

Add the env var `SOLANA_CLUSTER` (`devnet` or `mainnet-beta`, default `devnet`). It determines:

| | devnet | mainnet-beta |
|---|---|---|
| genesis hash | `EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG` | `5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d` |
| USDC mint | Circle's Devnet USDC (today's `BOUNTY_MINT`) | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| wSOL | `So11111111111111111111111111111111111111112` | same |
| API `network` | `solana-devnet` | `solana` |

Starting on mainnet requires three conditions; if any is missing it stops at startup (replacing REQ-X-P-105's "prohibited in code" with a conditional permission).

1. `REAL_FUNDS_ENABLED=true`
2. `LEGAL_SIGNOFF` contains the location of a document recording the legal review (e.g. `docs/legal/2026-xx-signoff.md`). Its content is not read, but empty stops it. **Note of 2026-10-13**: the owner decided to switch without waiting for the review, so for now it points to the owner's decision document `docs/legal/2026-10-13-owner-decision.md`. The gate's code is unchanged
3. The keys are mainnet keys. If the operator or verifier public key matches one used on Devnet, it stops (08 §2 "never reuse keys on Mainnet")

The genesis hash is checked by asking the actual RPC (as today). If `SOLANA_CLUSTER` and where the RPC points disagree, it stops.

### 4.2 Where keys and money live

- **admin** lives on a local hardware wallet or a Squads multisig, never on the server; the program's upgrade authority too.
- **operator** (owner of the treasury, funds the escrow) is on the server. It holds real money, so cap what the treasury holds and move the excess to admin's account. The cap is an operational judgement (guide: twice the expected daily payouts). 2026-10-15: the cap is written in the env vars `TREASURY_MAX_USDC` / `TREASURY_MAX_SOL`, and the tick warns above 1.5 times it (08 §5). Moving the excess is not automated: letting the operator key also send to admin would widen the damage from a leak
- **Signing boundary** (2026-10-15, `docs/architecture/` 05 §4.1): `packages/solana` holds no keys and signs through a `Signer` (a public key and a function that signs message bytes). Today's only implementation, `keypairSigner`, wraps the env-var key in memory, so behaviour is unchanged. KMS or MPC backends plug in here after the move to mainnet (the owner's decision: the move comes first)
- **verifier** (records verdicts) cannot move money and is handled as today.
- The operator pays SOL fees (transaction fees, account rent). The balance warning (08 §5, the tick's SOL balance) uses today's mechanism with a higher threshold for mainnet.

### 4.3 Letting requesters deposit themselves (built in PR 6, 2026-10-11)

Having the operator add TOPUPs by hand cannot handle real money. Deposits go into the balance only after confirming the requester sent them.

- From `/console`, "Issue a deposit address" gives the requester one personal reference (a Solana Pay `reference`, an ed25519 public key). The screen shows the operator wallet's address and Solana Pay URLs with the reference (USDC and SOL). Both go to the operator's wallet; the USDC account is derived from the wallet.
- Every minute the tick takes up to 25 requesters with a reference, oldest last-checked first, and looks for new transactions with `getSignaturesForAddress(reference, until = the last signature seen)`. Only finalized transactions are read, summing system transfers (to the wallet) and spl-token transfer / transferChecked (to the USDC account), including inner instructions.
- One row per transaction goes into `deposits` (04 §3.27), with a TOPUP added to `requester_ledger` in the same transaction. The signature is the primary key, so even if the RPC returns old signatures they are never counted twice.
- SOL is truncated from lamports to 10^-6 SOL; fractions that become 0 are not recorded.
- Transfers without a reference are not credited automatically: the requester tells the operator the transaction ID and the operator adds a TOPUP by hand. The screen says so.
- If one requester's RPC call fails, the others continue, and the next tick retries from the same `until`.
- SOL is received natively; when a request is created, the operator wraps only the shortfall into wSOL (3.1).
- It works the same way on Devnet, so it is used there first. No QR code yet.

### 4.4 Deploying the program

- Cost: with the v1.3 .so (348,808 B), about 2.43 SOL for the program account (v1.2 was 318,120 B and about 2.21 SOL; see 12 §10). Deployment needs about as much again for the buffer, returned afterwards. Have about 4.5 SOL on hand.
- Steps as on Devnet (`cargo build-sbf --tools-version v1.57` → `cargo test -p proofmarket` → `solana program deploy`). Mainnet gets a new program ID.
- After deploying, run `initialize_config` and `add_mint` (USDC and wSOL) with admin.
- No third-party audit. On 2026-10-13 the operator re-read v1.2 and recorded the result in `docs/security/program-review-2026-10-13.md`. Get an external audit before the funds grow.
- Post-deployment setup is `scripts/mainnet-setup.ts` (12 §10.2).

### 4.5 Switch-over steps (2026-10-13, brought forward by the owner's decision)

1. Create mainnet operator and verifier keys (`~/.config/proofmarket/mainnet/`, never in the repository)
2. Deploy the program and register config and mints
3. Set `SOLANA_CLUSTER=mainnet-beta`, `SOLANA_RPC_URL` (a paid RPC), `PROGRAM_ID`, the keys, `REAL_FUNDS_ENABLED` and `LEGAL_SIGNOFF` in Vercel Production
4. Trial balances are automatically 0 when `SOLANA_CLUSTER=mainnet-beta` (`trialBalanceFor`); none are given on mainnet
5. The operator goes round from request to payout with small amounts (0.10 USDC and 0.001 SOL) and checks on Solscan
6. Screen wording switches by cluster (`clusterText()` in `lib/cluster-public.ts`, 2026-10-13). The "pilot" wording was removed

## 5. Order of work

| PR | Content | Money | Migration |
|---|---|---|---|
| 1 | This design document | None moves | None |
| 2 | `SOLANA_CLUSTER` and the startup gate (4.1). Default devnet; production behaviour unchanged | None moves | None |
| 3 | The off-chain part of SOL (3.2, 3.3). `SOL_ENABLED` off | None moves | Only an index for balance aggregation |
| 4 | Program v1.2 (3.1) and tests. Deploy to Devnet and register wSOL | Devnet only | None |
| 5 | Show SOL rewards on the witness screens (payment already handled by native payouts in 4). `SOL_ENABLED=true` on Devnet | Devnet only | None |
| 6 | Deposit detection (4.3): show the deposit address on screen; the tick credits the balance | Devnet only | The `deposits` table and reference columns (0028) |
| 7 | Mainnet runbook (4.4, 4.5) added to `12-deploy-runbook.md` §10; the steps to upgrade Devnet to v1.2 are in §9 | None moves | None |

This is the day before submission, so from PR 2 on, merge only after confirming production behaviour is unchanged with the defaults.

## 6. Still undecided

- The cap on what the treasury holds (4.2)
- ~~Which mainnet RPC to contract~~ → compared on 2026-10-13 and chose Helius Developer ($49/month) (`docs/ops/rpc-mainnet-2026-10-13.md`)
- How to treat witness payouts under labour law and withholding tax (`legal-checklist.md` §1, §7)
- Whether to charge a fee and in which currency (`docs/pitch/08-revenue-model.md`). Decided on 2026-10-16: 15% on top, in the request's currency (`docs/architecture/13-marketplace-migration.md` §6)
