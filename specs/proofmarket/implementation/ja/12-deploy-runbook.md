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
| `ANTHROPIC_API_KEY`、`REVIEW_MODEL`、`REVIEW_EFFORT` | 任意。キーがあると、提出の AI 照合をサーバーの中でその場で行う（Mac の review-runner を待たない。runner は常駐して 5 秒おきに見るが、Mac が眠ると止まる）。`REVIEW_MODEL` の既定は `claude-opus-5-5`、`REVIEW_EFFORT` は `low`（既定・最速）・`medium`・`high`。目安は提出から 10 秒以内。応答が 25 秒を超えると 1 回だけやり直し、それも失敗したら照合は「警告」として残る |
| `OPERATOR_NAME`、`OPERATOR_CONTACT_EMAIL` | `/legal/operator` に出す運営者の名前と連絡先。未設定なら「公開前に記載します」と出る |

`DEV_MODE` と `NEXT_PUBLIC_DEV_MODE` は入れない。入れると起動を拒否する。

4. デプロイ後、`https://<app>/v1/health` が `{"ok":true}` を返すことを確かめ、3 節 5 の tick を登録する
5. 死活監視は GitHub Actions の `uptime` ワークフロー（`.github/workflows/uptime.yml`）が 5 分おきに `https://proofmarket.fun/v1/health/ready` を見る。DB が応答し、毎分の tick が追いついていれば 200、そうでなければ 503 で、失敗した回は GitHub がオーナーにメールで知らせる（`checks` の `jobs_draining`・`deadlines_on_time`・`no_dead_jobs` のどれが偽かで原因が分かる）。tick 自身も 08 §5 の数（DEAD のジョブ・10 分を超えて送信中の決済・operator の SOL 残高）を毎分見て、Vercel のログに `tick_needs_operator` の警告を出す。DEAD のジョブは管理 API の `requeue` で戻す

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

## 9. プログラムを v1.2 に上げて SOL の報酬を開く（Devnet、2026-10-12 追加）

15 §3 の SOL 対応は、Devnet のプログラムを v1.2 に差し替えてから旗を立てる。順番を守れば、どの段でも本番の USDC の依頼は止まらない。

1. main で `cargo build-sbf --tools-version v1.57 --manifest-path programs/proofmarket/Cargo.toml` と `cargo test -p proofmarket`（23 本）を通す
2. `solana program deploy target/deploy/proofmarket.so --program-id ~/.config/proofmarket/proofmarket-program-keypair.json --keypair ~/.config/proofmarket/admin.json -u devnet`。プログラム ID は変わらない。admin に 2.5 SOL ほど要る（配置中のバッファぶん。終われば戻る）
3. `pnpm --filter @proofmarket/scripts run run devnet-setup.ts --url https://api.devnet.solana.com --allow-wsol`。wSOL を `AllowedMint` に登録する（2 回目以降は「already allowed」と出て何もしない）
4. operator の wSOL 口座は、最初の SOL の依頼のときにサーバーが作る。operator の SOL 残高が、報酬の合計＋口座のレント（約 0.002 SOL）を上回っているかを見る
5. Vercel の Production に `SOL_ENABLED=true` を入れて再デプロイする。`/v1/health/ready` が 200 のままなことを確かめる
6. 運営者の鍵で 0.001 SOL × 1 人の依頼を 1 件出し、証人の財布に SOL が届くことを Solscan で確かめる。届かなければ `SOL_ENABLED` を外す（USDC の依頼には影響しない）

v1.2 より前のサーバーは v1.2 のプログラムでそのまま動くので、2 と 5 の間が空いても困らない（15 §3.1）。

## 9a. プログラムを v1.3 に上げて他のトークンを開く（Devnet、2026-10-14 追加）

16 §5 の Token-2022 対応は、9 節と同じ順番で進める。v1.3 は v1.2 のクライアントもそのまま受け付けるので、プログラムを先に上げても、サーバーを先に上げても、USDC と SOL の依頼は止まらない。

1. main で `cargo build-sbf --tools-version v1.57 --manifest-path programs/proofmarket/Cargo.toml` と `cargo test -p proofmarket`（29 本）を通す
2. 9 節の 2 と同じく `solana program deploy`。.so は 348,808 B で v1.2 より約 30 KB 大きい。CLI 4.x は領域を自動で広げる
3. `pnpm --filter @proofmarket/scripts run run devnet-setup.ts --url https://api.devnet.solana.com --test-mints`。USDT の代わりの SPL Token の mint と、PYUSD と同じ拡張を持つ Token-2022 の mint を作り、`add_mint` と operator の口座への入金まで済ませる。作った mint は `env.devnet` に `ASSET_MINT_USDT`・`ASSET_MINT_PYUSD` として書き出される。走らせるたびに新しい mint ができるので、1 回だけ実行する
4. Vercel の Preview に `ASSETS_ENABLED=USDC,SOL,USDT,PYUSD` と 3 の `ASSET_MINT_*` を入れ、`GET /v1/public/assets` に 4 通貨が出ることを確かめる
5. 運営者の鍵で USDT と PYUSD の依頼を 1 件ずつ出し、証人の財布にそれぞれの口座ができて届くことを確かめてから、Production にも同じ値を入れる

## 10. メインネットへ切り替える（2026-10-13、オーナーの決定で実行）

15 §4 の設計を手順に直したもの。もともとの条件は `legal-checklist.md` §1・§3・§7 の確認が終わり、D-05（資金の預かり）の結論が文書になっていることだった。2026-10-13 にオーナーが**確認を待たずに切り替える**と決め、その決定を `docs/legal/2026-10-13-owner-decision.md` に残した。起動の門（`apps/web/lib/cluster.ts`）は変えていない。`LEGAL_SIGNOFF` にはこの決定文書の場所を入れ、弁護士の確認が取れたら確認結果の文書に差し替える。

### 10.1 用意するもの

| もの | 中身 |
|---|---|
| 鍵 | メインネット用の admin・operator・verifier を新しく作り、`~/.config/proofmarket/mainnet/` に置く。Devnet の鍵と同じ公開鍵だと門で止まる |
| admin の置き場 | ハードウェア財布か Squads のマルチシグ。サーバーには置かない。プログラムの更新権限も同じ鍵にする |
| SOL | admin に 4.5 SOL（配置に約 2.43 SOL ＋ 配置中のバッファ。v1.3 の .so は 348,808 B）、operator に 1 SOL（手数料とレント）。開く通貨 1 つにつき admin が約 0.004 SOL（`AllowedMint` と operator の口座のレント）を払う |
| USDC | treasury に最初の支払い見込みぶん。上限（15 §6）は決めてから入れる |
| RPC | 有料の RPC のメインネット URL。比較の結果（`docs/ops/rpc-mainnet-2026-10-13.md`）は Helius の Developer（$49／月）。公開 RPC は上限が低く、tick が毎分呼ぶには足りない。URL は API キーを含むので秘密 |
| 法務の文書 | 確認結果を `docs/legal/<日付>-signoff.md` に置く。それが無いうちは、オーナーの決定文書 `docs/legal/2026-10-13-owner-decision.md`。`LEGAL_SIGNOFF` にその場所を入れる |
| 点検の記録 | 第三者の監査は受けていない。代わりに運営者の点検 `docs/security/program-review-2026-10-13.md`。資金の量が増える前に外部の監査を受ける |

### 10.2 プログラムを置く

```bash
solana-keygen new -o ~/.config/proofmarket/mainnet/program-keypair.json   # 新しいプログラム ID
pnpm --filter @proofmarket/scripts run run check-assets.ts   # 台帳とメインネットの mint を突き合わせる（16 §3.1）
cargo build-sbf --tools-version v1.57 --manifest-path programs/proofmarket/Cargo.toml
cargo test -p proofmarket   # v1.3、29 本
solana program deploy target/deploy/proofmarket.so \
  --program-id ~/.config/proofmarket/mainnet/program-keypair.json \
  --keypair <admin のハードウェア財布> -u mainnet-beta
```

続けて `scripts/mainnet-setup.ts` を配置の直後に実行する。`devnet-setup.ts` はメインネットを拒むので使えない。

```bash
pnpm --filter @proofmarket/scripts run run mainnet-setup.ts \
  --url <有料 RPC の URL> --decision-doc docs/legal/2026-10-13-owner-decision.md --allow-wsol \
  --assets SOL,USDT,PYUSD
```

`--assets` には、最初に開く通貨を台帳の記号で書く（16 §9 の案は SOL・USDT・PYUSD）。通貨ごとに `add_mint` と operator の口座づくりを行い、`env.mainnet-beta` に `ASSETS_ENABLED` を書き出す。あとから通貨を足すときも、同じコマンドを足したい記号で走らせればよい（済んだものは飛ばす）。

この script は genesis hash が `5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d` のときだけ、`--decision-doc` の文書が存在するときだけ動く。公開 RPC の URL と Devnet の鍵は拒む。admin・operator・verifier は `~/.config/proofmarket/mainnet/` から読み、operator と verifier は無ければ作る（admin はハードウェア財布なら `--admin-keypair` で一度だけ渡す）。admin に 0.5 SOL・operator に 0.2 SOL 以上が要る（airdrop はしない）。やることは、operator の USDC 口座（treasury）を作る → `initialize_config`（`bounty_mint` = `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`）→ Config の admin・operator・verifier が自分の鍵かを確かめる（横取りされていたら新しい ID で作り直す。06 §3）→ `--allow-wsol` なら `add_mint`（wSOL）→ `~/.config/proofmarket/env.mainnet-beta` に 10.3 の値を書き出す。

### 10.3 サーバーの設定

Vercel の Production で次を入れ替える。ほかの変数は 5 節のまま。

| 変数 | 値 |
|---|---|
| `SOLANA_CLUSTER` | `mainnet-beta` |
| `SOLANA_RPC_URL` | 有料 RPC のメインネット URL |
| `SOLANA_EXPECTED_GENESIS_HASH` | `5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d` |
| `PROGRAM_ID` | 10.2 で作った ID |
| `BOUNTY_MINT` | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| `OPERATOR_SECRET_KEY`、`VERIFIER_SECRET_KEY` | メインネット用の鍵 |
| `REAL_FUNDS_ENABLED` | `true` |
| `LEGAL_SIGNOFF` | 法務の文書の場所 |
| `ASSETS_ENABLED` | 10.2 の `--assets` で開いた通貨（例 `USDC,SOL,USDT,PYUSD`）。書かなければ USDC だけ |
| `JOB_CONCURRENCY`、`PRIORITY_MAX_MICROLAMPORTS` | 省略してよい（既定は 6 と 1,000,000）。混雑で取り込みが遅れるなら後者を上げる（16 §7） |
| `TREASURY_MAX_USDC`、`TREASURY_MAX_SOL` | operator の財布に置く額の上限（15 §4.2）。どちらかの 1.5 倍を超えると tick が `treasury_over_cap` で警告する。超えた分は admin の財布へ手で移す。省略すると警告しない |

1 つでも欠けると、最初のリクエストで門が止めてサーバーは応答しない（REQ-X-P-105）。Devnet の値が 1 つでも残っていても同じ。

### 10.4 切り替えの日にやること

1. 試験用の残高は `SOLANA_CLUSTER=mainnet-beta` なら 0 になる（`participation-service.ts` の `trialBalanceFor`）。配る処理を手で止める必要は無い。キーのメールにも残高の行は出ない
2. 10.2・10.3 を済ませ、`/v1/health/ready` が 200 を返すのを見る
3. 運営者自身が 0.10 USDC × 1 人と 0.001 SOL × 1 人の依頼を 1 件ずつ出し、依頼から支払いまでを一周して Solscan で確かめる
4. 画面の文言は済んでいる。「試験運用」「テスト用 USDC」の表記は 2026-10-13 に消し、鎖の名前・explorer のリンク・API の `network`（`solana-devnet`／`solana`）は `apps/web/lib/cluster-public.ts` の `clusterText()` がクラスタで切り替える。手で直す箇所は無い
5. 08 §5 の警告のしきい値（operator の SOL 残高）をメインネット用に上げる
6. 入金（15 §4.3）は Devnet と同じ仕組みで動く。`/console` の案内文もクラスタで切り替わる
7. agent の script（`demo-agent.ts`・`x402-agent.ts`）と公開 API の利用者は、依頼の `bounty.network` に `solana` を入れる。`solana-devnet` のままだと VALIDATION_FAILED（`wrong_network`）で拒まれる

### 10.5 戻し方

`SOLANA_CLUSTER` を `devnet` に戻し、残りの変数を `~/.config/proofmarket/env.devnet` の値に戻して再デプロイする。メインネットのプログラムと treasury に残ったお金は admin が回収する。DB の残高（`requester_ledger`）はクラスタを区別しないので、戻す前に `deposits` と TOPUP を照らして、メインネットで入った分を手で精算する。
