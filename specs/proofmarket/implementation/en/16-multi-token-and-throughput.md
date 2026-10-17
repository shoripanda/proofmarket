# 16. Paying in other SPL tokens, and settlement throughput

Written: 2026-10-14 / Requested by the operator: "Let's raise performance. I also want to support other Solana currencies"

## 1. Conclusion

Widen the currencies usable for rewards from "USDC and SOL" to "any token in the registry", and run settlement jobs in parallel so requests do not pile up on mainnet.

- **Currencies are decided in one place: a registry in code.** A new currency needs one registry line, one `add_mint` run by admin, and opening it with an env var. The initial registry has 11: USDC, SOL, USDT, PYUSD, USDG, EURC, JUP, BONK, JitoSOL, mSOL and cbBTC.
- **Upgrade the program to v1.3 so it can also escrow Token-2022 tokens.** PYUSD and USDG are Token-2022, which v1.2 cannot escrow. Nothing is deployed on mainnet yet, so v1.3 goes there from the start.
- **Stop waiting on settlement jobs one at a time.** The tick runs up to 6 in parallel and keeps each tick within the 300-second limit. Sending (priority fees, resends, blockhash) is also reworked for mainnet.

The policy of 15 §3.2 — no exchange rates — stays: funds are held in the currency and amount the requester chose, and paid in the same currency.

## 2. Problems with today's build

### 2.1 Currencies are fixed at two

Starting from `AssetSchema = z.enum(["USDC", "SOL"])` (`packages/core/src/schemas/api.ts`), about 70 places in services, screens and deposit detection compare currency names directly. For example, `assetOf()` in `settlement-jobs.ts` throws for anything but USDC and SOL, and `deposits.ts` looks only at the USDC account and the SOL wallet. The DB's `deposits` has a constraint `asset in ('USDC','SOL')`.

Amounts also assume two currencies. Off-chain they are fixed at 6 decimals and multiplied by `10^(decimals - 6)` when passed on chain (`toBaseUnits` in `money.ts`). For a 5-decimal token such as BONK the exponent is negative and the formula breaks.

### 2.2 The program handles only the original SPL Token

v1.2 can allow several mints through `AllowedMint`, but account types are `Account<Mint>` and `Program<Token>` and transfers use `token::transfer`, so a mint owned by Token-2022 fails the account checks. Reading the candidate mints on mainnet on 2026-10-14 gave:

| Currency | mint | Decimals | Program | Notes |
|---|---|---|---|---|
| USDC | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` | 6 | SPL Token | Freeze authority |
| USDT | `Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB` | 6 | SPL Token | Freeze authority |
| PYUSD | `2b1kV6DkPAnxd5ixfnxCpjxmKwqjjaYmCZfHsFu24GXo` | 6 | Token-2022 | Permanent delegate, transfer fee config (0% now), transfer hook (unset) |
| USDG | `2u1tszSeqZ3qBWF3uNGPFc8TzMk2tdiwknnRMWGWjGWH` | 6 | Token-2022 | Same combination of extensions as PYUSD |
| EURC | `HzwqbKZw8HxMN6bF2yFZNrht3c2iXXzpKcFu7uBEDKtr` | 6 | SPL Token | Freeze authority |
| JUP | `JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN` | 6 | SPL Token | None |
| BONK | `DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263` | 5 | SPL Token | Fewer than 6 decimals |
| JitoSOL | `J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn` | 9 | SPL Token | None |
| mSOL | `mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So` | 9 | SPL Token | None |
| cbBTC | `cbbtcf3aa214zXHbiAZQwf4122FBYbraNdFqgw4iMij` | 8 | SPL Token | Freeze authority |

SOL is escrowed as wSOL (`So11111111111111111111111111111111111111112`) and paid to witnesses as SOL, as in 15 §3.1.

### 2.3 Settlement jobs are serial and do not fit in a tick on mainnet

Every minute the tick runs up to 20 outbox jobs one at a time (`tick` in `jobs.ts`). Chain jobs wait up to 60 seconds for `finalized` on every send. If a witness's receiving account (ATA) is missing, the transaction creating it before settle waits for `finalized` again.

On 2026-10-14 the slot gap between `confirmed` and `finalized` was measured three times each on public RPC: 31-32 slots on mainnet (about 6.7-6.9 seconds at 0.216 s per slot), 0 on Devnet. Production is on Devnet today, so the wait is not noticeable. On mainnet, adding the time from sending to inclusion, each transaction is expected to take 9-12 seconds (estimate; to be measured after switching).

At that rate, a tick with 20 settles that each create an account takes 360-480 seconds and is cut off by the route's `maxDuration` (300 seconds). Cut-off jobs are not picked up until their lease (`leaseS`, 180 seconds) expires. A batch of 50 (01 §4.25) takes over 8 minutes to finish funding.

Sending has three more causes of delay on mainnet:

- The priority fee is fixed at `10_000` micro-lamports, so under congestion transactions are not included and the blockhash expires
- The blockhash is taken at `finalized`, losing about 7 seconds of its validity from the start
- Sending is a single `sendRawTransaction`, leaving resends to the RPC when not included

## 3. The currency registry

### 3.1 Shape of the registry

`packages/core/src/domain/assets.ts` has one line per currency:

```ts
export interface AssetInfo {
  symbol: string;              // the value in the API's bounty.asset; 2-10 alphanumerics
  name: string;                // display name
  decimals: number;            // on-chain decimals (as checked on chain)
  tokenProgram: "spl-token" | "token-2022";
  native?: true;               // SOL only: escrowed as wSOL, paid as SOL
  mints: { "mainnet-beta"?: string };  // Devnet and localnet come from env vars (3.3)
  minBounty?: string;          // only where there is a technical minimum (SOL's 0.001)
  x402?: true;                 // accepted over x402; USDC only
}
```

Mints not in the registry are accepted by neither the API nor deposit detection. We do not accept any mint on chain: tokens with no value, or that call another program on every transfer, could stall payouts or leave the operator paying account costs indefinitely.

If a registry value differs from reality, money gets the wrong decimals. So `scripts/check-assets.ts` reads each mint from mainnet RPC and compares decimals, owning program and extensions with the registry. Run it when adding a currency and before deploying to mainnet.

### 3.2 Opening and closing acceptance

The env var `ASSETS_ENABLED` (e.g. `USDC,SOL,USDT,PYUSD`) decides which currencies an environment accepts. The default is `USDC` only, so production behaviour is unchanged. The old `SOL_ENABLED=true` remains as equivalent to "add SOL to `ASSETS_ENABLED`", so environments setting either one keep working.

Requests in a closed currency are refused with `UNSUPPORTED_ASSET`, as SOL was. Closing does not stop payouts or refunds of requests already funded, and balances do not disappear.

`GET /v1/public/assets` (no auth) returns the symbol, name, decimals, mint and minimum of each open currency; agents can read it before requesting. MCP gets a tool returning the same list, pointed to from `llms.txt` and `/developers`.

### 3.3 Devnet and localnet

Registry currencies other than USDC do not exist on Devnet. On Devnet and localnet, mint addresses are read from the env vars `ASSET_MINT_<symbol>` (e.g. `ASSET_MINT_PYUSD`); currencies without a value are treated as unavailable there.

`devnet-setup.ts` gains `--test-mints`, which creates two test mints:

- An original SPL Token mint with 6 decimals (standing in for USDT)
- A Token-2022 mint with the same extensions as PYUSD (permanent delegate, a 0% transfer fee config, an unset transfer hook, metadata)

The mints are written to `env.devnet` as `ASSET_MINT_USDT` and `ASSET_MINT_PYUSD`, so escrow through payout of a Token-2022 token can be run end to end on Devnet. Screens and emails label Devnet currencies "test" (through `clusterText()`).

## 4. Decimals

API and DB amounts remain decimal strings and `numeric(20,6)`. Two things change:

- The maximum number of decimals becomes `min(6, the currency's decimals)`: up to 5 for BONK, 6 otherwise. More is refused with `VALIDATION_FAILED` (`reason: "too_many_decimals"`). Silently truncating would make the amount held differ from what the requester wrote.
- `toBaseUnits(micro, asset)` and `fromBaseUnits(base, asset)` read the registry's decimals, dividing for fewer than 6 and multiplying for more. A remainder when dividing means a bug slipped past the check above, so it throws and stops. Only deposits (`fromBaseUnits`) still truncate below 10^-6.

Of the minimum rewards, only SOL's 0.001 remains, for a technical reason (the rent-exempt minimum, 15 §3.2). Other currencies have none: without prices we have no basis for deciding what is reasonable.

## 5. Program v1.3 (Token-2022)

### 5.1 What changes

The layouts of `Task`, `Config` and `AllowedMint` do not change. The only added instruction account is an optional `mint` at the end of refund, so v1.2 clients keep working with v1.3.

- refund must pass the mint to `transfer_checked`. A call without the trailing `mint` returns funds with `transfer` as in v1.2 for original SPL Token requests, and refuses with `InvalidMint`, moving nothing, for Token-2022 requests (tests p_mint_06, p_t22_02)
- initialize_task and settle refuse with `InvalidMint` if the token program passed differs from the mint's owner

- Account types become `InterfaceAccount<Mint>`, `InterfaceAccount<TokenAccount>` and `Interface<TokenInterface>`, so both original SPL Token and Token-2022 mints pass.
- Every transfer becomes `transfer_checked`: required for Token-2022, and for the original SPL Token it only adds a decimals check.
- Witness accounts are checked with `get_associated_token_address_with_program_id`, matching the mint's owning program.
- The vault is sized for whatever the mint's extensions require (e.g. `TransferFeeAmount` for a mint with a transfer fee config). Anchor 1.2's `init`, given `token::token_program`, computes the size from the mint's extensions (`generate_get_token_account_space`); no hand-written account creation was needed.
- `Config.bounty_mint` (USDC) is handled as before.

### 5.2 Which extensions are accepted

Some Token-2022 extensions can make escrowed funds impossible to get out, so only known extensions pass (an allow list). `add_mint` (admin) checks all of them; `initialize_task` re-checks the two that can change.

| Extension | Treatment | Why |
|---|---|---|
| MetadataPointer, TokenMetadata, GroupPointer, GroupMemberPointer | Pass | Display information only |
| MintCloseAuthority | Pass | Cannot close while supply is non-zero |
| ConfidentialTransferMint, ConfidentialTransferFeeConfig | Pass | Same as ordinary transfers unless confidential transfers are enabled on the vault and witness accounts |
| PermanentDelegate | Pass (only currencies whose issuer we trust are put in the registry) | The issuer can move the vault's contents: the same kind of trust in the issuer as USDC's freeze authority |
| TransferFeeConfig | Pass only if the fee is 0 for both the current and next epoch; re-checked in `initialize_task` | A fee would reduce what reaches the vault and stop settle with `InsufficientVaultBalance` |
| TransferHook | Pass only if no program is set; re-checked in `initialize_task` | With a hook set, transfers need extra accounts and the account order of settle and refund would not match |
| Pausable | Pass | No payouts while paused, but like freezing, it can wait for a resume |
| NonTransferable, DefaultAccountState (frozen), any extension not in this table | Refuse | Cannot be escrowed, or behaviour not checked |

The fee and the hook are re-checked in `initialize_task` because the issuer can change them later. If they change after funds are escrowed, payouts may still stall. That is the flip side of trusting the issuer by listing the currency, and is part of deciding whether to list it (chapter 9).

### 5.3 Tests and deployment

LiteSVM tests gain three kinds of Token-2022 mint: no extensions, the same extensions as PYUSD, and disallowed extensions (NonTransferable, and a hook set). Each runs add_mint, initialize_task, settle and refund. Existing tests for the original SPL Token must still pass.

Devnet is upgraded by the same steps as v1.2 (12 §9). Mainnet gets v1.3 from the start, so in 12 §10 only how the `.so` is built and which mints get `add_mint` change.

## 6. Off-chain

| Where | Change |
|---|---|
| API types | `AssetSchema` becomes a string of "symbols in the registry". Whether it is open is checked in services (deciding it in the type would prevent opening and closing with env vars) |
| Creating requests | Balance, decimals, minimum and whether it is open are checked against the registry. Balances are per currency (as in 15 §3.3) |
| Settlement jobs | `assetOf()` is replaced by a registry lookup; mint and token program come from the registry |
| Adapter | ATA derivation and `tokenProgram` switch to match the owner of the request's mint. Wrapping SOL is unchanged |
| Deposit detection | Watches the operator's wallet and the ATAs of every open currency, counting `spl-token-2022` transfers too. A transaction with several currencies gives one row per currency. The primary key of `deposits` becomes (signature, currency) |
| DB | Migration 0029: drop `deposits_asset_chk` and make the primary key (signature, asset). Values are checked in the application |
| Screens | Balances and deposit addresses in `/console`, witness earnings and statements, and public stats loop over the list of currencies. Totals are per currency, never one number |
| Deposit addresses | One Solana Pay URL per currency (`spl-token=<mint>`). The operator's ATAs are created ahead of time for every open currency by `mainnet-setup.ts` and `devnet-setup.ts` |
| x402 | Stays USDC only (15 §3.3) |

Witnesses' receiving accounts (ATAs) are still created by the operator, who pays the rent: about 0.00204 SOL per account, once the first time a witness receives a new currency. The cost grows with the number of currencies, but like payout transaction fees it is treated as an operating cost (chapter 9).

## 7. Settlement throughput

### 7.1 Targets

On mainnet, meet the following; measure them from production `payment_records` after switching, and add them to the checks in 12 §10.

- A tick fits in 300 seconds, with no jobs waiting for a lease to expire after a cut-off
- A batch of 50 is fully FUNDED within 3 minutes of creation
- Even under congestion, retries from expired blockhashes stay under 10%

### 7.2 Running jobs in parallel

The tick's last step (running jobs) runs up to `JOB_CONCURRENCY` (default 6) at once.

- Each worker leases one job with `leaseNextJob` and takes the next when done. Leasing uses `for update skip locked`, so concurrent leases never take the same job
- After 200 seconds from the start of the tick, no new leases are taken; running jobs are waited for to the end. A job takes at most two 60-second waits (account creation + settle), so it fits in 300 seconds
- The per-run cap `maxJobs` goes from 20 to 60

The same request is never touched concurrently: jobs have a dedupe key per request, and state is written under `lockTask`'s row lock. On chain, the PDA's `init` refuses double funding.

The only new possibility with parallelism is two SOL requests reading the wSOL account balance at the same time and under-estimating the shortfall. The later one then fails for insufficient balance and passes after re-wrapping on retry. No money moves and the delay is one retry, so no locking is added.

RPC calls grow with parallelism. Against Helius Developer's limits (`docs/ops/rpc-mainnet-2026-10-13.md`), 6 in parallel leaves plenty of headroom.

### 7.3 Making each job faster

- **Account-creation transactions only need `confirmed`.** Creating an ATA is idempotent; if rolled back, the next settle fails for the missing account and recreates it. settle, which moves money, still waits for `finalized`
- **Take the blockhash at `confirmed`**, no longer losing about 7 seconds of validity from the start
- **Set the priority fee by congestion.** Pass the writable accounts (operator, treasury, task) to `getRecentPrioritizationFees` and use the recent 75th percentile, with today's 10,000 as the floor and the env var `PRIORITY_MAX_MICROLAMPORTS` (default 1,000,000) as the ceiling. Use the floor if the RPC does not answer
- **Set a compute limit per instruction**: 1.3 times the consumption measured in LiteSVM tests, via `setComputeUnitLimit`. Much smaller than the default 200,000 per instruction, which also lowers the total priority fee
- **Resend until included**: resend the same transaction every 2 seconds after sending until it is included or the blockhash expires (the same signature, so never executed twice)

### 7.4 What stays

The DB never says "paid" until the money-moving transaction is `finalized` (06 §5.1). The tick stays per minute, and `kickAfter`, which runs jobs right after a request, stays.

## 8. Order of work

| PR | Content | Money | Migration |
|---|---|---|---|
| #39 | This design document | None moves | None |
| #40 | Settlement throughput (chapter 7); default parallelism 6 | None moves (only how jobs flow changes) | None |
| #41 | The currency registry and decimals (chapters 3, 4), `GET /v1/public/assets`, `check-assets.ts`, off-chain multi-currency (chapter 6). `ASSETS_ENABLED` defaults to USDC only. #31 (showing SOL on witness screens) is included | None moves | 0029 |
| Next PR | Program v1.3 (chapter 5) and tests, `devnet-setup.ts --test-mints`, `mainnet-setup.ts --assets`, runbook 12 §9a and §10 | Devnet only (deployment by the owner) | None |

Design PRs 3 and 4 were merged into one: the registry alone is useless while settlement jobs and the adapter still handle two currencies. PRs are stacked on each other, so merge from #39 in order. Migration 0029 in #41 is applied to production before the code.

## 9. Still undecided

- **Which currencies to open first on mainnet.** My proposal: start with four — USDC, SOL, USDT and PYUSD — and open the rest when requesters ask. With stablecoins first, requesters can set rewards without worrying about price swings. Volatile currencies such as JUP and BONK change value by the time a witness receives them; open them only after saying so on screen. (Decided by the owner on 2026-10-15: these four first.)
- **How far to trust issuers.** For PYUSD and USDG the issuer (Paxos) can move vault contents through the permanent delegate. We list them, treating it as the same kind of trust as USDC's freeze authority, but record it as the operator's judgement
- **Witness account costs.** The operator pays about 0.00204 SOL per currency. However many currencies are added, the cost per witness is capped by the number in the registry, and for now it is acceptable as a cost. Revisit together with the fee (15 §6) as requests grow
- **Whether to widen x402 beyond USDC.** The `exact` scheme is an SPL token transfer, so it can extend to USDT or PYUSD. Decide once demand is visible
