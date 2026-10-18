# 12. Deployment Runbook (Devnet, Supabase, Privy, Vercel)

Created: 2026-10-03

How to bring up the demo environment for the first time. Follow it top to bottom. Steps marked "owner" need browser work and are done by a person; the rest can be done with commands. All keys and secrets live in `~/.config/proofmarket/` (permissions 0600), never in the repository.

## 0. Prerequisites

- Node.js 24 or later, pnpm 12, Rust, the Solana CLI (Agave 4.x) and Anchor CLI 1.2.0 are installed (chapter 11 §4)
- At least 8 GB of free disk (the failure log in CLAUDE.md)

## 1. Put the program on Devnet

### 1.1 Fund with SOL (owner)

Public airdrops often fail on rate limits. Log in to https://faucet.solana.com with GitHub and send Devnet SOL to:

| Key | Address | Amount | Use |
|---|---|---|---|
| admin | `zWNUtDAHyhy1BQvZYNq6C9H5nLfKhWRbdDe8ZbwqcDJ` | 5 SOL | Deploying the program (about 4 SOL) and creating Config |
| operator | `5JCzti3UrorjeoabuB1QirdPtWLRwa7CK8oDSGx34kiN` | 2 SOL | Fees, rent for tasks and receiving accounts |

Addresses can be checked with `solana-keygen pubkey ~/.config/proofmarket/admin.json` and so on.

### 1.2 Deploy and initialize

```bash
cargo build-sbf --tools-version v1.57 --manifest-path programs/proofmarket/Cargo.toml
solana program deploy target/deploy/proofmarket.so \
  --program-id ~/.config/proofmarket/proofmarket-program-keypair.json \
  --keypair ~/.config/proofmarket/admin.json -u devnet
# Run immediately after deploying (prevents someone else initializing first; chapter 06 §3)
pnpm --filter @proofmarket/scripts run run devnet-setup.ts --url https://api.devnet.solana.com
```

`devnet-setup` creates Config and checks that admin, operator and verifier are our keys. It stops if they are not; in that case redo it with a new program ID. On success it writes `PROGRAM_ID`, `BOUNTY_MINT`, `SOLANA_EXPECTED_GENESIS_HASH`, `OPERATOR_SECRET_KEY` and `VERIFIER_SECRET_KEY` to `~/.config/proofmarket/env.devnet`.

### 1.3 Fund the reward USDC (owner)

Send Solana Devnet USDC from https://faucet.circle.com to the `treasury` address `devnet-setup` printed. At 0.5 USDC per request, 20 USDC is enough for the pilot.

If the faucet is not enough, switch to a test mint (`--own-mint --fund-treasury 100`). Results then carry `test_asset: true` (chapter 06 §6).

## 2. Generate app secrets

```bash
pnpm --filter @proofmarket/scripts run run gen-secrets.ts
```

This creates `LOCATION_ENC_KEY`, `WORKER_REF_SALT`, `WEBHOOK_SIGNING_SECRET_PEPPER`, `INTERNAL_CRON_SECRET` and `ADMIN_TOKEN` in `~/.config/proofmarket/env.secrets`. Never regenerate them (changing the location encryption key makes existing ciphertext unreadable).

For push notifications, also create VAPID keys once (regenerating them invalidates every worker's subscription). `--subject` is a contact URL or mailto, sent to the browser's push service with every notification.

```bash
pnpm --filter @proofmarket/scripts run run gen-vapid.ts --subject https://<contact page>
```

## 3. Supabase

1. (owner) Create a project in the Tokyo region
2. (owner) Note two connection strings from Settings → Database
   - For the app: Transaction pooler (port 6543), put in `DATABASE_URL`
   - For migrations: Direct connection (port 5432)
3. Apply migrations: `DATABASE_URL=<Direct connection> pnpm db:migrate`
4. Create the buckets: `SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... pnpm --filter @proofmarket/scripts run run supabase-setup.ts`
5. Register the per-minute tick (once the Vercel URL is known)
   ```bash
   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... INTERNAL_CRON_SECRET=... \
     pnpm --filter @proofmarket/scripts run run supabase-setup.ts --app-url https://<app>.vercel.app --print-cron-sql
   ```
   Run the printed SQL once in Supabase's SQL Editor. It contains a secret, so do not save it

## 4. Privy (owner)

1. Set login methods to email and Google
2. Enable Solana under Embedded wallets, creating one at login for "users without a wallet"
3. Add the Vercel URL to the allowed domains (`*.vercel.app` to include previews)
4. Note the App ID, App secret and JWT verification key

## 5. Vercel

1. (owner) Import the repository with Root Directory `apps/web`. Leave "include files outside the Root Directory" enabled
2. Choose Node.js 24. Set `ENABLE_EXPERIMENTAL_COREPACK=1` to use pnpm 12
3. Set env vars (Production; mark secrets Sensitive)

| Variable | Source |
|---|---|
| `APP_ENV` | `demo` |
| `DATABASE_URL` | Supabase Transaction pooler |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase API settings |
| `NEXT_PUBLIC_PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `PRIVY_VERIFICATION_KEY` | Privy |
| `SOLANA_RPC_URL` | Helius Devnet URL |
| `SOLANA_EXPECTED_GENESIS_HASH`, `PROGRAM_ID`, `BOUNTY_MINT`, `OPERATOR_SECRET_KEY`, `VERIFIER_SECRET_KEY` | `~/.config/proofmarket/env.devnet` |
| `LOCATION_ENC_KEY`, `WORKER_REF_SALT`, `WEBHOOK_SIGNING_SECRET_PEPPER`, `INTERNAL_CRON_SECRET`, `ADMIN_TOKEN` | `~/.config/proofmarket/env.secrets` |
| `PILOT_BBOX` | `35.60,139.65,35.72,139.78` (central Tokyo including Shibuya and Shinjuku) |
| `MAX_WITNESSES` | `5` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | `~/.config/proofmarket/env.vapid`. Without all three there are no push notifications (everything else works) |
| `RESEND_API_KEY`, `MAIL_FROM` | Resend (https://resend.com). `MAIL_FROM` looks like `ProofMarket <keys@proofmarket.fun>`, at a domain verified in Resend. Optional: with both, a copy of the API key handed over on the sign-up screen is also emailed (01 §4.28). Without them the key is still shown on screen |
| `ANTHROPIC_API_KEY`, `REVIEW_MODEL`, `REVIEW_EFFORT` | Optional. With the key, AI review of submissions runs inside the server on the spot (no waiting for the Mac's review-runner, which polls every 5 seconds but stops when the Mac sleeps). `REVIEW_MODEL` defaults to `claude-opus-5-5`; `REVIEW_EFFORT` is `low` (default, fastest), `medium` or `high`. Expect within 10 seconds of submission. A response over 25 seconds is retried once; if that fails too, the review is left as a "warning" |
| `OPERATOR_NAME`, `OPERATOR_CONTACT_EMAIL` | The operator's name and contact shown on `/legal/operator`. If unset, it says "to be stated before launch" |

Do not set `DEV_MODE` or `NEXT_PUBLIC_DEV_MODE`; with them the server refuses to start.

4. After deploying, check that `https://<app>/v1/health` returns `{"ok":true}` and register the tick from §3 step 5
5. Uptime is watched by the GitHub Actions `uptime` workflow (`.github/workflows/uptime.yml`), which checks `https://proofmarket.fun/v1/health/ready` every 5 minutes: 200 if the DB responds and the per-minute tick is keeping up, 503 otherwise, and GitHub emails the owner about failed runs (which of `jobs_draining`, `deadlines_on_time` and `no_dead_jobs` in `checks` is false tells the cause). The tick itself also checks the numbers in 08 §5 every minute (DEAD jobs, settlements sending for over 10 minutes, the operator's SOL balance) and logs a `tick_needs_operator` warning in Vercel. DEAD jobs are returned with the admin API's `requeue`

## 6. Initial data

```bash
export DATABASE_URL=<Transaction pooler>
R="pnpm --filter @proofmarket/scripts run run"
$R register-place.ts --name "<shop name note>" --lat <lat> --lng <lng> --category retail --by <your name>   # per shop
$R issue-api-key.ts --principal "<requester name>" --type person --max-task 5 --daily 20 --topup 20 --by <your name>
$R issue-invite.ts --uses 1 --days 14   # one per worker
```

API keys and invite codes can only be seen when printed.

To let a shop report its own status, create a link per shop and hand it over (01 §4.13). The link can only be seen when printed. Revoke with `--revoke <token_id>`.

```bash
$R issue-place-token.ts --place plc_... --base-url https://<app> --by <your name>
```

For a key that also accepts queue (`QUEUE_LENGTH`) and posted-notice (`NOTICE_POSTED`) requests, add `--task-types PLACE_STATUS_VERIFICATION,QUEUE_LENGTH,NOTICE_POSTED` when issuing. For existing keys, change it with `$R set-task-types.ts --credential key_... --types ... --by <your name>` (01 §4.8).

Sign-ups from the site's `/join` are read with the command below (it decrypts and shows email addresses, so never paste the output anywhere). After contacting someone, mark it with `--mark <id> --as contacted`. Sign-ups are deleted automatically after 90 days.

```bash
LOCATION_ENC_KEY=... $R list-participation.ts
```

Photo removal requests from `/rules` are read with `list-removal.ts`, handled by the procedure in 08 §6, then marked `--mark <id> --as handled`, within one business day as a guide.

```bash
LOCATION_ENC_KEY=... $R list-removal.ts
```

## 7. Smoke test

```bash
PROOFMARKET_API_KEY=<API key> pnpm --filter @proofmarket/scripts run run demo-agent.ts \
  --base-url https://<app> --principal <principal_id> --lat <shop lat> --lng <shop lng>
```

On a worker's phone, open `https://<app>` and go through registration, claim and capture. It is done when the demo agent prints the result and an Explorer link, and the public result page `https://<app>/r/<verification_id>` shows the same result.

To list a good result under "Recent results" on the top page, run the following. Send `false` to remove it.

```bash
curl -X POST https://<app>/v1/admin/verifications/<verification_id>/feature -H "authorization: Bearer $ADMIN_TOKEN" \
  -H "content-type: application/json" -d '{"featured":true}'
```

## 8. How to stop

Incident procedures are in 08 §6. To stop at once:

```bash
curl -X POST https://<app>/v1/admin/flags -H "authorization: Bearer $ADMIN_TOKEN" \
  -H "content-type: application/json" -d '{"key":"tasks_create_enabled","value":false}'
curl -X POST https://<app>/v1/admin/flags -H "authorization: Bearer $ADMIN_TOKEN" \
  -H "content-type: application/json" -d '{"key":"settlement_enabled","value":false}'
```

## 9. Upgrade the program to v1.2 and open SOL rewards (Devnet, added 2026-10-12)

SOL support (15 §3) is turned on after replacing the Devnet program with v1.2. In this order, production USDC requests never stop at any step.

1. On main, pass `cargo build-sbf --tools-version v1.57 --manifest-path programs/proofmarket/Cargo.toml` and `cargo test -p proofmarket` (23 tests)
2. `solana program deploy target/deploy/proofmarket.so --program-id ~/.config/proofmarket/proofmarket-program-keypair.json --keypair ~/.config/proofmarket/admin.json -u devnet`. The program ID does not change. admin needs about 2.5 SOL (for the buffer during deployment; returned afterwards)
3. `pnpm --filter @proofmarket/scripts run run devnet-setup.ts --url https://api.devnet.solana.com --allow-wsol` registers wSOL as an `AllowedMint` (later runs print "already allowed" and do nothing)
4. The operator's wSOL account is created by the server on the first SOL request. Check that the operator's SOL balance exceeds the total rewards plus the account rent (about 0.002 SOL)
5. Set `SOL_ENABLED=true` in Vercel Production and redeploy. Check that `/v1/health/ready` stays 200
6. Make one request of 0.001 SOL × 1 person with the operator's key and confirm on Solscan that SOL reaches the witness's wallet. If it does not, remove `SOL_ENABLED` (USDC requests are unaffected)

Servers older than v1.2 keep working with the v1.2 program, so a gap between steps 2 and 5 is fine (15 §3.1).

## 9a. Upgrade the program to v1.3 and open other tokens (Devnet, added 2026-10-14)

Token-2022 support (16 §5) follows the same order as §9. v1.3 still accepts v1.2 clients, so whether the program or the server is upgraded first, USDC and SOL requests do not stop.

1. On main, pass `cargo build-sbf --tools-version v1.57 --manifest-path programs/proofmarket/Cargo.toml` and `cargo test -p proofmarket` (29 tests)
2. `solana program deploy` as in §9 step 2. The .so is 348,808 B, about 30 KB larger than v1.2; CLI 4.x extends the account automatically
3. `pnpm --filter @proofmarket/scripts run run devnet-setup.ts --url https://api.devnet.solana.com --test-mints` creates an SPL Token mint standing in for USDT and a Token-2022 mint with the same extensions as PYUSD, runs `add_mint` and funds the operator's accounts. The mints are written to `env.devnet` as `ASSET_MINT_USDT` and `ASSET_MINT_PYUSD`. Every run creates new mints, so run it only once
4. Set `ASSETS_ENABLED=USDC,SOL,USDT,PYUSD` and the `ASSET_MINT_*` from step 3 in Vercel Preview, and check that `GET /v1/public/assets` lists four currencies
5. Make one USDT and one PYUSD request with the operator's key, confirm each witness wallet gets its account and the payment, then set the same values in Production

## 10. Switch to mainnet (2026-10-13, carried out by the owner's decision)

The design of 15 §4 turned into steps. The original condition was that the review of `legal-checklist.md` §1, §3 and §7 was finished and the conclusion on D-05 (holding funds) was written down. On 2026-10-13 the owner decided to **switch without waiting for that review** and recorded the decision in `docs/legal/2026-10-13-owner-decision.md`. The startup gate (`apps/web/lib/cluster.ts`) is unchanged: `LEGAL_SIGNOFF` points to that decision document, to be replaced by the lawyer's review once available.

### 10.1 What is needed

| Item | Content |
|---|---|
| Keys | New admin, operator and verifier keys for mainnet in `~/.config/proofmarket/mainnet/`. The gate stops if any public key matches a Devnet key |
| Where admin lives | A hardware wallet or a Squads multisig, never the server. The program's upgrade authority is the same key |
| SOL | 4.5 SOL for admin (about 2.43 SOL to deploy plus the buffer; the v1.3 .so is 348,808 B), 1 SOL for operator (fees and rent). Each currency opened costs admin about 0.004 SOL (rent for `AllowedMint` and the operator's account) |
| USDC | The treasury holds the expected first payouts. Decide the cap (15 §6) before funding |
| RPC | A paid mainnet RPC URL. The comparison (`docs/ops/rpc-mainnet-2026-10-13.md`) chose Helius Developer ($49/month). Public RPC limits are too low for the tick calling every minute. The URL contains an API key and is secret |
| Legal document | Put the review result in `docs/legal/<date>-signoff.md`; until then, the owner's decision document `docs/legal/2026-10-13-owner-decision.md`. `LEGAL_SIGNOFF` points to it |
| Review record | No third-party audit. Instead, the operator's review `docs/security/program-review-2026-10-13.md`. Get an external audit before the funds grow |

### 10.2 Deploy the program

```bash
solana-keygen new -o ~/.config/proofmarket/mainnet/program-keypair.json   # a new program ID
pnpm --filter @proofmarket/scripts run run check-assets.ts   # compare the registry with mainnet mints (16 §3.1)
cargo build-sbf --tools-version v1.57 --manifest-path programs/proofmarket/Cargo.toml
cargo test -p proofmarket   # v1.3, 29 tests
solana program deploy target/deploy/proofmarket.so \
  --program-id ~/.config/proofmarket/mainnet/program-keypair.json \
  --keypair <admin hardware wallet> -u mainnet-beta
```

Run `scripts/mainnet-setup.ts` immediately after deploying. `devnet-setup.ts` refuses mainnet and cannot be used.

```bash
pnpm --filter @proofmarket/scripts run run mainnet-setup.ts \
  --url <paid RPC URL> --decision-doc docs/legal/2026-10-13-owner-decision.md --allow-wsol \
  --assets SOL,USDT,PYUSD
```

`--assets` lists the currencies to open first, by registry symbol (16 §9 proposes SOL, USDT and PYUSD). For each it runs `add_mint` and creates the operator's account, and writes `ASSETS_ENABLED` to `env.mainnet-beta`. To add currencies later, run the same command with the new symbols (completed ones are skipped).

The script runs only when the genesis hash is `5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d` and the `--decision-doc` file exists. It refuses public RPC URLs and Devnet keys. admin, operator and verifier are read from `~/.config/proofmarket/mainnet/`; operator and verifier are created if missing (a hardware-wallet admin is passed once with `--admin-keypair`). admin needs at least 0.5 SOL and operator 0.2 SOL (no airdrop). Steps: create the operator's USDC account (treasury) → `initialize_config` (`bounty_mint` = `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`) → check that Config's admin, operator and verifier are our keys (if someone initialised first, redo with a new ID; 06 §3) → with `--allow-wsol`, `add_mint` (wSOL) → write the values of §10.3 to `~/.config/proofmarket/env.mainnet-beta`.

### 10.3 Server settings

Replace the following in Vercel Production; other variables stay as in §5.

| Variable | Value |
|---|---|
| `SOLANA_CLUSTER` | `mainnet-beta` |
| `SOLANA_RPC_URL` | The paid mainnet RPC URL |
| `SOLANA_EXPECTED_GENESIS_HASH` | `5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d` |
| `PROGRAM_ID` | The ID created in §10.2 |
| `BOUNTY_MINT` | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| `OPERATOR_SECRET_KEY`, `VERIFIER_SECRET_KEY` | The mainnet keys |
| `REAL_FUNDS_ENABLED` | `true` |
| `LEGAL_SIGNOFF` | Where the legal document is |
| `ASSETS_ENABLED` | The currencies opened with `--assets` in §10.2 (e.g. `USDC,SOL,USDT,PYUSD`); USDC only if omitted |
| `JOB_CONCURRENCY`, `PRIORITY_MAX_MICROLAMPORTS` | May be omitted (defaults 6 and 1,000,000). Raise the latter if congestion delays inclusion (16 §7) |
| `TREASURY_MAX_USDC`, `TREASURY_MAX_SOL` | The cap on what the operator wallet holds (15 §4.2). Above 1.5 times either, the tick warns `treasury_over_cap`; move the excess to the admin wallet by hand. Omitted means no warning |

If any one is missing, the gate stops at the first request and the server does not respond (REQ-X-P-105). The same if any Devnet value remains.

### 10.4 On switch-over day

1. Trial balances are 0 when `SOLANA_CLUSTER=mainnet-beta` (`trialBalanceFor` in `participation-service.ts`), so there is nothing to stop by hand, and key emails show no balance line
2. Finish §10.2 and §10.3 and see `/v1/health/ready` return 200
3. The operator makes one request of 0.10 USDC × 1 person and one of 0.001 SOL × 1 person, goes round from request to payout, and checks on Solscan
4. Screen wording is done. "Pilot" and "test USDC" were removed on 2026-10-13, and the chain name, explorer links and the API's `network` (`solana-devnet` / `solana`) switch by cluster through `clusterText()` in `apps/web/lib/cluster-public.ts`. Nothing to fix by hand
5. Raise the warning threshold in 08 §5 (operator SOL balance) for mainnet
6. Deposits (15 §4.3) work the same as on Devnet; the `/console` instructions also switch by cluster
7. Agent scripts (`demo-agent.ts`, `x402-agent.ts`) and public API users put `solana` in `bounty.network`; `solana-devnet` is refused with VALIDATION_FAILED (`wrong_network`)

### 10.5 Rolling back

Set `SOLANA_CLUSTER` back to `devnet`, restore the other variables from `~/.config/proofmarket/env.devnet`, and redeploy. admin recovers what is left in the mainnet program and treasury. The DB balance (`requester_ledger`) does not distinguish clusters, so before rolling back, reconcile `deposits` against TOPUPs and settle what came in on mainnet by hand.
