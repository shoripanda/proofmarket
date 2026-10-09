# 12. デプロイ手順書（Devnet・Supabase・Privy・Vercel）

作成日: 2026-10-03

demo 環境を初めて立ち上げる手順。上から順に進める。「オーナー」と書いた手順はブラウザでの操作が要るので人が行い、それ以外はコマンドで進められる。鍵と秘密値はすべて `~/.config/proofmarket/`（権限 0600）に置き、リポジトリには入れない。

## 0. 前提

- Node.js 24 以上、pnpm 12、Rust、Solana CLI（Agave 4.x）、Anchor CLI 1.2.0 が入っている（11 章 4 節）
- ディスクの空きが 8GB 以上ある（CLAUDE.md の失敗ルート台帳）

## 1. Devnet にプログラムを置く

### 1.1 SOL を入れる（オーナー）

公開の airdrop はレート制限で失敗しやすい。https://faucet.solana.com に GitHub でログインし、Devnet で次のアドレスに入れる。

| 鍵 | アドレス | 入れる量 | 用途 |
|---|---|---|---|
| admin | `zWNUtDAHyhy1BQvZYNq6C9H5nLfKhWRbdDe8ZbwqcDJ` | 5 SOL | プログラムのデプロイ（約 4 SOL）と Config の作成 |
| operator | `5JCzti3UrorjeoabuB1QirdPtWLRwa7CK8oDSGx34kiN` | 2 SOL | 手数料、タスクと受取口座のレント |

アドレスは `solana-keygen pubkey ~/.config/proofmarket/admin.json` などで確かめられる。

### 1.2 デプロイと初期化

```bash
cargo build-sbf --tools-version v1.57 --manifest-path programs/proofmarket/Cargo.toml
solana program deploy target/deploy/proofmarket.so \
  --program-id ~/.config/proofmarket/proofmarket-program-keypair.json \
  --keypair ~/.config/proofmarket/admin.json -u devnet
# デプロイ直後に続けて実行する（初期化の横取りを防ぐため。06 章 3 節）
pnpm --filter @proofmarket/scripts run run devnet-setup.ts --url https://api.devnet.solana.com
```

`devnet-setup` は Config を作り、admin・operator・verifier が自分の鍵になっているかを確かめる。違っていたら止まるので、その場合は新しいプログラム ID で作り直す。成功すると `~/.config/proofmarket/env.devnet` に `PROGRAM_ID`・`BOUNTY_MINT`・`SOLANA_EXPECTED_GENESIS_HASH`・`OPERATOR_SECRET_KEY`・`VERIFIER_SECRET_KEY` が書かれる。

### 1.3 報酬用の USDC を入れる（オーナー）

https://faucet.circle.com で Solana Devnet の USDC を、`devnet-setup` が表示した `treasury` のアドレスに入れる。1 件 0.5 USDC なので、パイロットには 20 USDC あれば足りる。

faucet で足りなければ、テスト用 mint に切り替える（`--own-mint --fund-treasury 100`）。このとき結果には `test_asset: true` が付く（06 章 6 節）。

## 2. アプリの秘密値を作る

```bash
pnpm --filter @proofmarket/scripts run run gen-secrets.ts
```

`~/.config/proofmarket/env.secrets` に `LOCATION_ENC_KEY`・`WORKER_REF_SALT`・`WEBHOOK_SIGNING_SECRET_PEPPER`・`INTERNAL_CRON_SECRET`・`ADMIN_TOKEN` ができる。一度作ったら作り直さない（位置の暗号鍵を変えると既存の暗号文が読めなくなる）。

プッシュ通知を使うなら、VAPID の鍵も一度だけ作る（作り直すと worker の通知登録がすべて無効になる）。`--subject` は連絡先の URL か mailto で、通知のたびにブラウザの通知サービスへ送られる。

```bash
pnpm --filter @proofmarket/scripts run run gen-vapid.ts --subject https://<連絡先のページ>
```

## 3. Supabase

1. （オーナー）プロジェクトを作り、リージョンは東京にする
2. （オーナー）Settings → Database から接続文字列を2つ控える
   - アプリ用: Transaction pooler（ポート 6543）。`DATABASE_URL` に入れる
   - 移行用: Direct connection（ポート 5432）
3. 移行を当てる: `DATABASE_URL=<Direct connection> pnpm db:migrate`
4. バケットを作る: `SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... pnpm --filter @proofmarket/scripts run run supabase-setup.ts`
5. 毎分の tick を登録する（Vercel の URL が決まった後）
   ```bash
   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... INTERNAL_CRON_SECRET=... \
     pnpm --filter @proofmarket/scripts run run supabase-setup.ts --app-url https://<app>.vercel.app --print-cron-sql
   ```
   表示された SQL を Supabase の SQL Editor で一度だけ実行する。秘密値を含むので保存しない

## 4. Privy（オーナー）

1. ログイン方法をメールと Google にする
2. Embedded wallets で Solana を有効にし、ログイン時の作成を「ウォレットを持たないユーザー」にする
3. 許可するドメインに Vercel の URL（プレビューを含めるなら `*.vercel.app`）を足す
4. App ID・App secret・JWT verification key を控える

## 5. Vercel

1. （オーナー）リポジトリを取り込み、Root Directory を `apps/web` にする。「Root Directory の外のファイルを含める」は有効のまま
2. Node.js は 24 を選ぶ。pnpm 12 を使うため環境変数 `ENABLE_EXPERIMENTAL_COREPACK=1` を入れる
3. 環境変数を入れる（Production に。秘密値は Sensitive にする）

| 変数 | 値の出どころ |
|---|---|
| `APP_ENV` | `demo` |
| `DATABASE_URL` | Supabase の Transaction pooler |
| `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY` | Supabase の API 設定 |
| `NEXT_PUBLIC_PRIVY_APP_ID`、`PRIVY_APP_SECRET`、`PRIVY_VERIFICATION_KEY` | Privy |
| `SOLANA_RPC_URL` | Helius の Devnet URL |
| `SOLANA_EXPECTED_GENESIS_HASH`、`PROGRAM_ID`、`BOUNTY_MINT`、`OPERATOR_SECRET_KEY`、`VERIFIER_SECRET_KEY` | `~/.config/proofmarket/env.devnet` |
| `LOCATION_ENC_KEY`、`WORKER_REF_SALT`、`WEBHOOK_SIGNING_SECRET_PEPPER`、`INTERNAL_CRON_SECRET`、`ADMIN_TOKEN` | `~/.config/proofmarket/env.secrets` |
| `PILOT_BBOX` | `35.60,139.65,35.72,139.78`（渋谷・新宿を含む東京都心） |
| `MAX_WITNESSES` | `5` |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`、`VAPID_PRIVATE_KEY`、`VAPID_SUBJECT` | `~/.config/proofmarket/env.vapid`。3つとも無いとプッシュ通知は出ない（ほかは動く） |
| `RESEND_API_KEY`、`MAIL_FROM` | Resend（https://resend.com）。`MAIL_FROM` は `ProofMarket <keys@proofmarket.fun>` の形で、Resend で確認済みのドメインのアドレスにする。任意。2 つともあると、申し込みの画面で渡した API キーの控えをメールでも送る（01 §4.28）。無くてもキーは画面で渡せる |
| `OPERATOR_NAME`、`OPERATOR_CONTACT_EMAIL` | `/legal/operator` に出す運営者の名前と連絡先。未設定なら「公開前に記載します」と出る |

`DEV_MODE` と `NEXT_PUBLIC_DEV_MODE` は入れない。入れると起動を拒否する。

4. デプロイ後、`https://<app>/v1/health` が `{"ok":true}` を返すことを確かめ、3 節 5 の tick を登録する

## 6. 最初のデータ

```bash
export DATABASE_URL=<Transaction pooler>
R="pnpm --filter @proofmarket/scripts run run"
$R register-place.ts --name "<店舗名のメモ>" --lat <緯度> --lng <経度> --category retail --by <自分の名前>   # 店舗ごと
$R issue-api-key.ts --principal "<requester 名>" --type person --max-task 5 --daily 20 --topup 20 --by <自分の名前>
$R issue-invite.ts --uses 1 --days 14   # worker ごとに1つ
```

API キーと招待コードは表示されたときにしか見られない。

店舗に自分で営業状況を申告してもらうときは、店舗ごとにリンクを作って渡す（01 章 4.13 節）。リンクは表示されたときにしか見られない。止めるときは `--revoke <token_id>`。

```bash
$R issue-place-token.ts --place plc_... --base-url https://<app> --by <自分の名前>
```

行列（`QUEUE_LENGTH`）と店頭の掲示（`NOTICE_POSTED`）の依頼も受けるキーにするときは、発行時に `--task-types PLACE_STATUS_VERIFICATION,QUEUE_LENGTH,NOTICE_POSTED` を付ける。発行済みのキーは `$R set-task-types.ts --credential key_... --types ... --by <自分の名前>` で変える（01 章 4.8 節）。

サイトの `/join` から届いた申し込みは、次で読む（メールアドレスを復号して表示するので、出力をどこにも貼らない）。連絡したら `--mark <id> --as contacted` で印を付ける。申し込みは 90 日で自動的に消える。

```bash
LOCATION_ENC_KEY=... $R list-participation.ts
```

`/rules` から届く写真の削除依頼は `list-removal.ts` で読み、08 章 6 節の手順で対応してから `--mark <id> --as handled` を付ける。目安は 1 営業日以内。

```bash
LOCATION_ENC_KEY=... $R list-removal.ts
```

## 7. 動作確認

```bash
PROOFMARKET_API_KEY=<API キー> pnpm --filter @proofmarket/scripts run run demo-agent.ts \
  --base-url https://<app> --principal <principal_id> --lat <店舗の緯度> --lng <店舗の経度>
```

worker のスマートフォンで `https://<app>` を開き、登録・引受・撮影まで通す。デモ用エージェントが結果と Explorer のリンクを表示し、公開結果ページ `https://<app>/r/<verification_id>` にも同じ結果が出れば完了。

うまくいった結果をトップページの「最近の判定結果」に載せるときは、次を実行する。外すときは `false` にする。

```bash
curl -X POST https://<app>/v1/admin/verifications/<verification_id>/feature -H "authorization: Bearer $ADMIN_TOKEN" \
  -H "content-type: application/json" -d '{"featured":true}'
```

## 8. 止め方

障害時の手順は 08 章 6 節。すぐ止めたいときは次の2つ。

```bash
curl -X POST https://<app>/v1/admin/flags -H "authorization: Bearer $ADMIN_TOKEN" \
  -H "content-type: application/json" -d '{"key":"tasks_create_enabled","value":false}'
curl -X POST https://<app>/v1/admin/flags -H "authorization: Bearer $ADMIN_TOKEN" \
  -H "content-type: application/json" -d '{"key":"settlement_enabled","value":false}'
```
