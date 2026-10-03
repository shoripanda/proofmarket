# 12. Deployment Runbook (Devnet, Supabase, Privy, Vercel)

> English translation. The Japanese version in [`../ja/12-deploy-runbook.md`](../ja/12-deploy-runbook.md) is authoritative; if they differ, the Japanese version wins.

Created: 2026-10-03

How to bring up the demo environment for the first time. Follow the steps in order. Steps marked "owner" need browser work by a person; the rest are commands. All keys and secrets live in `~/.config/proofmarket/` (mode 0600) and never in the repository.

## 0. Prerequisites

- Node.js 24+, pnpm 12, Rust, Solana CLI (Agave 4.x) and Anchor CLI 1.2.0 installed (Chapter 11, Section 4)
- At least 8 GB of free disk (see the failure ledger in CLAUDE.md)

## 1. Put the program on Devnet

### 1.1 Fund with SOL (owner)

The public airdrop is often rate-limited. Sign in to https://faucet.solana.com with GitHub and send Devnet SOL to:

| Key | Address | Amount | Purpose |
|---|---|---|---|
| admin | `zWNUtDAHyhy1BQvZYNq6C9H5nLfKhWRbdDe8ZbwqcDJ` | 5 SOL | Program deployment (about 4 SOL) and Config creation |
| operator | `5JCzti3UrorjeoabuB1QirdPtWLRwa7CK8oDSGx34kiN` | 2 SOL | Fees, rent for tasks and recipient token accounts |

Check addresses with e.g. `solana-keygen pubkey ~/.config/proofmarket/admin.json`.

### 1.2 Deploy and initialize

```bash
cargo build-sbf --tools-version v1.57 --manifest-path programs/proofmarket/Cargo.toml
solana program deploy target/deploy/proofmarket.so \
  --program-id ~/.config/proofmarket/proofmarket-program-keypair.json \
  --keypair ~/.config/proofmarket/admin.json -u devnet
# Run immediately after deploying (prevents initialization front-running, Chapter 06 Section 3)
pnpm --filter @proofmarket/scripts run run devnet-setup.ts --url https://api.devnet.solana.com
```

`devnet-setup` creates the Config and verifies that admin, operator and verifier are our keys. If not, it stops; redeploy under a new program ID. On success it writes `PROGRAM_ID`, `BOUNTY_MINT`, `SOLANA_EXPECTED_GENESIS_HASH`, `OPERATOR_SECRET_KEY` and `VERIFIER_SECRET_KEY` to `~/.config/proofmarket/env.devnet`.

### 1.3 Fund the reward USDC (owner)

Use https://faucet.circle.com to send Solana Devnet USDC to the `treasury` address printed by `devnet-setup`. At 0.5 USDC per task, 20 USDC covers the pilot.

If the faucet is not enough, switch to a test mint (`--own-mint --fund-treasury 100`); results then carry `test_asset: true` (Chapter 06, Section 6).

## 2. Generate app secrets

```bash
pnpm --filter @proofmarket/scripts run run gen-secrets.ts
```

Creates `LOCATION_ENC_KEY`, `WORKER_REF_SALT`, `WEBHOOK_SIGNING_SECRET_PEPPER`, `INTERNAL_CRON_SECRET` and `ADMIN_TOKEN` in `~/.config/proofmarket/env.secrets`. Generate once and never regenerate (a new location key cannot decrypt existing ciphertext).

## 3. Supabase

1. (owner) Create a project in the Tokyo region
2. (owner) From Settings → Database, note two connection strings
   - For the app: Transaction pooler (port 6543), used as `DATABASE_URL`
   - For migrations: Direct connection (port 5432)
3. Apply migrations: `DATABASE_URL=<direct connection> pnpm db:migrate`
4. Create buckets: `SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... pnpm --filter @proofmarket/scripts run run supabase-setup.ts`
5. Register the per-minute tick (after the Vercel URL is known)
   ```bash
   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... INTERNAL_CRON_SECRET=... \
     pnpm --filter @proofmarket/scripts run run supabase-setup.ts --app-url https://<app>.vercel.app --print-cron-sql
   ```
   Run the printed SQL once in the Supabase SQL Editor. It contains a secret; do not save it.

## 4. Privy (owner)

1. Set login methods to email and Google
2. Enable Solana embedded wallets, created on login for users without a wallet
3. Add the Vercel URL to allowed domains (`*.vercel.app` to include previews)
4. Note the App ID, App secret and JWT verification key

## 5. Vercel

1. (owner) Import the repository and set Root Directory to `apps/web`. Keep "include files outside the Root Directory" enabled
2. Choose Node.js 24. Set `ENABLE_EXPERIMENTAL_COREPACK=1` so pnpm 12 is used
3. Set environment variables (Production; mark secrets as Sensitive)

| Variable | Source |
|---|---|
| `APP_ENV` | `demo` |
| `DATABASE_URL` | Supabase Transaction pooler |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Supabase API settings |
| `NEXT_PUBLIC_PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `PRIVY_VERIFICATION_KEY` | Privy |
| `SOLANA_RPC_URL` | Helius Devnet URL |
| `SOLANA_EXPECTED_GENESIS_HASH`, `PROGRAM_ID`, `BOUNTY_MINT`, `OPERATOR_SECRET_KEY`, `VERIFIER_SECRET_KEY` | `~/.config/proofmarket/env.devnet` |
| `LOCATION_ENC_KEY`, `WORKER_REF_SALT`, `WEBHOOK_SIGNING_SECRET_PEPPER`, `INTERNAL_CRON_SECRET`, `ADMIN_TOKEN` | `~/.config/proofmarket/env.secrets` |
| `PILOT_BBOX` | `35.60,139.65,35.72,139.78` (central Tokyo incl. Shibuya and Shinjuku) |
| `MAX_WITNESSES` | `5` |

Do not set `DEV_MODE` or `NEXT_PUBLIC_DEV_MODE`; the app refuses to start with them.

4. After deploying, check that `https://<app>/v1/health` returns `{"ok":true}`, then register the tick from Section 3, step 5

## 6. Initial data

```bash
export DATABASE_URL=<Transaction pooler>
R="pnpm --filter @proofmarket/scripts run run"
$R register-place.ts --name "<shop memo>" --lat <lat> --lng <lng> --category retail --by <your name>   # per shop
$R issue-api-key.ts --principal "<requester name>" --type person --max-task 5 --daily 20 --topup 20 --by <your name>
$R issue-invite.ts --uses 1 --days 14   # one per worker
```

API keys and invite codes are shown only once.

## 7. Smoke test

```bash
PROOFMARKET_API_KEY=<API key> pnpm --filter @proofmarket/scripts run run demo-agent.ts \
  --base-url https://<app> --principal <principal_id> --lat <shop lat> --lng <shop lng>
```

Open `https://<app>` on a worker's phone and go through onboarding, claim and capture. Done when the demo agent prints the result and an Explorer link and the public result page `https://<app>/r/<verification_id>` shows the same result.

To list a good result under "最近の判定結果" (recent results) on the top page, run the following. Send `false` to remove it.

```bash
curl -X POST https://<app>/v1/admin/verifications/<verification_id>/feature -H "authorization: Bearer $ADMIN_TOKEN" \
  -H "content-type: application/json" -d '{"featured":true}'
```

## 8. How to stop

Incident procedures are in Chapter 08, Section 6. To stop immediately:

```bash
curl -X POST https://<app>/v1/admin/flags -H "authorization: Bearer $ADMIN_TOKEN" \
  -H "content-type: application/json" -d '{"key":"tasks_create_enabled","value":false}'
curl -X POST https://<app>/v1/admin/flags -H "authorization: Bearer $ADMIN_TOKEN" \
  -H "content-type: application/json" -d '{"key":"settlement_enabled","value":false}'
```
