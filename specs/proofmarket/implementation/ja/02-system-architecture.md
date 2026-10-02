# 02. 基本設計（システム構成）

作成日: 2026-10-02

## 1. 技術スタック

10 日で 1 人（と Claude Code）が作り切ることを最優先にした。言語を TypeScript に揃え、サーバーを 1 つにまとめ、運用するインフラを持たない。

| 層 | 採用 | 主な理由 | 退けた候補 |
|---|---|---|---|
| Web と API | Next.js（着手時点の最新安定版、App Router、Route Handlers）、Node.js ランタイム | worker 画面と `/v1` API を 1 つのデプロイで出せる | Hono 等の別 API サーバー（デプロイ先が 2 つになる） |
| ホスティング | Vercel | Next.js をそのまま置ける。プレビュー環境が自動で出る | Render（常駐サーバーは不要） |
| DB | Supabase の PostgreSQL | 行ロック・一意制約・トランザクションで冪等性と二重決済を防げる。pg_cron が使える | Firestore 等（一意制約とトランザクションが弱い） |
| ORM | Drizzle ORM + drizzle-kit（マイグレーション） | SQL に近く、型が付く | Prisma（生成物が重い） |
| オブジェクトストレージ | Supabase Storage の private bucket | 署名つきアップロード URL があり、Vercel の 4.5MB 制限を避けられる | S3（アカウントが増える） |
| worker 認証とウォレット | Privy（`@privy-io/react-auth`、サーバーは `@privy-io/node`。旧 `@privy-io/server-auth` は 2026-10 時点で非推奨） | メール/Google ログインと Solana 埋め込みウォレットの自動作成が 1 つで済む | 自前でキーペアを作って預かる（カストディになる） |
| Solana プログラム | Anchor 1.2 系（Rust） | 2026-10 時点の安定版。アカウント検証を宣言的に書ける | 素の Rust（検証漏れの危険が増える） |
| Solana クライアント | `@anchor-lang/core`、`@solana/web3.js` v1、`@solana/spl-token` | Anchor 1.x の TS クライアントが web3.js v1 前提のため | `@solana/kit` 単独（Anchor クライアントと混ぜると型が二重になる） |
| 画像処理 | sharp | 再エンコード、EXIF 除去、縮小、知覚ハッシュの下処理 | — |
| MCP | `@modelcontextprotocol/sdk`（stdio サーバー） | エージェント開発者の手元で API キーを使って動かす | — |
| テスト | Vitest（TS）、LiteSVM（プログラム）、PGlite（移行 SQL と DB 制約の確認）、Playwright（画面の通し確認、P1） | Anchor 1.x の既定が LiteSVM。PGlite は Docker なしで CI から PostgreSQL の制約を試せる | — |
| 言語・lint | TypeScript 5.9、Biome（lint と整形）、Node.js 24 以上 | TypeScript 7 は Next.js との組み合わせが未検証のため 5.9 に固定。Biome は設定が 1 ファイルで済む | ESLint + Prettier |
| パッケージ管理 | pnpm workspaces | モノレポ | — |
| CI | GitHub Actions（lint、型検査、テスト、gitleaks、`anchor build`） | — | — |

## 2. 構成図

```text
                    ┌──────────────────────── Vercel ────────────────────────┐
 AI Agent ──REST──▶ │ apps/web                                                │
 (API key)          │  ├ /v1/verifications/*      Agent Gateway               │
 MCP client ─stdio─▶│  ├ /v1/worker/*             Worker API                  │
  └ packages/mcp ───┤  ├ /v1/public/*             公開結果                     │
                    │  ├ /v1/admin/*              運営者 API                   │
 Worker (スマホ) ──▶ │  ├ /(worker)/*              Worker Web（PWA）            │
  └ Privy SDK       │  ├ /r/[id]                  公開結果ページ               │
                    │  └ /api/internal/tick       outbox 処理（cron から）     │
                    │        │  packages/core（状態遷移・判定・合意・正規化）   │
                    │        │  packages/solana（Settlement Adapter）          │
                    └────────┼──────────────┬──────────────┬─────────────────┘
                             │              │              │
                     ┌───────▼──────┐ ┌─────▼──────┐ ┌─────▼────────┐
                     │ Supabase     │ │ Supabase   │ │ Solana       │
                     │ PostgreSQL   │ │ Storage    │ │ Devnet RPC   │
                     │ + pg_cron    │ │ (private)  │ │ (Helius 等)  │
                     └──────────────┘ └────────────┘ └──────┬───────┘
                                                             │
                                                   programs/proofmarket
```

`architecture.md` の論理コンポーネントとの対応は次のとおり。

| 論理コンポーネント | 実装場所 |
|---|---|
| A. Agent Gateway | `apps/web/app/v1/verifications/**`、`apps/web/lib/auth/requester.ts` |
| B. Task Service | `packages/core/src/task/**`（状態遷移）、`apps/web/lib/services/task-service.ts`（DB 操作） |
| C. Worker Web App | `apps/web/app/(worker)/**` |
| D. Evidence Service | `apps/web/lib/services/evidence-service.ts`、`packages/core/src/evidence/**` |
| E. Verification Engine | `packages/core/src/verification/**`（純粋関数）、`apps/web/lib/services/verification-service.ts` |
| F. Settlement Adapter | `packages/solana/src/**` |
| G. Solana Program | `programs/proofmarket/**` |
| H. Off-chain DB | `packages/db/**`（Drizzle スキーマとマイグレーション） |
| I. Object Storage | Supabase Storage の bucket `evidence-raw` と `evidence-derived` |

## 3. リポジトリ構成

```text
Solana-idea/
├── apps/
│   └── web/                      Next.js（worker 画面・API・公開ページ）
│       ├── app/
│       │   ├── (worker)/         ログイン、一覧、詳細、撮影、結果、支払い履歴
│       │   ├── r/[id]/           公開結果ページ
│       │   ├── v1/               REST（Route Handlers）
│       │   └── api/internal/     cron から呼ぶ outbox 処理
│       └── lib/                  認証、サービス層、エラー、ロガー
├── packages/
│   ├── core/                     ドメインロジック（DB にも Solana にも依存しない純粋 TS）
│   ├── db/                       Drizzle スキーマ、マイグレーション、seed
│   ├── solana/                   Anchor クライアント、取引の組み立て・送信・確認
│   ├── sdk/                      requester 向けの型つき REST クライアント
│   └── mcp/                      MCP サーバー（sdk を使う）
├── programs/
│   └── proofmarket/              Anchor プログラム（Rust）と LiteSVM テスト
├── scripts/
│   ├── devnet-setup.ts           config 初期化、treasury の ATA 作成
│   ├── issue-api-key.ts          principal と API キーの発行
│   ├── issue-invite.ts           worker 招待コードの発行
│   ├── register-place.ts         依頼できる公開店舗の登録
│   ├── register-webhook.ts       Webhook 送信先の登録（P1）
│   └── demo-agent.ts             デモ用エージェント
├── tests/
│   └── e2e/                      Playwright（P1）
├── specs/ docs/ ideas/           既存
├── Anchor.toml
├── pnpm-workspace.yaml
└── .github/workflows/ci.yml
```

`packages/core` を DB と Solana から切り離すのは、受け入れ基準の否定テストの大半（状態遷移・判定・合意）を速い単体テストで回すためである。

## 4. 処理方式

### 4.1 同期と非同期の分け方

API の応答に入れるのは、DB への書き込みと判定まで。チェーンへの送信と Webhook は outbox に積んで非同期で行う。

```text
API リクエスト
  └ DB トランザクション
      ├ 状態遷移
      ├ audit_events への追記
      └ outbox_jobs への追加（例: FUND_TASK, FINALIZE_AND_SETTLE, REFUND_TASK, DELIVER_WEBHOOK）
  └ 応答を返した後に Next.js の after() で該当ジョブの実行を 1 回試みる（応答時間に含めない）

pg_cron（毎分） → pg_net で POST /api/internal/tick（共有シークレット付き）
  └ 期限切れの検出（タスク・クレーム・nonce）
  └ 実行できる outbox ジョブにリースを取って実行
  └ 保持期限を過ぎた証拠の削除（1 日 1 回）
```

ジョブの取り出しはリース方式にする。チェーンの確認待ち（最大 60 秒）の間 DB トランザクションを開いたままにしないためである。

```sql
update outbox_jobs
   set state = 'RUNNING', locked_until = now() + interval '3 minutes',
       locked_by = :runner_id, attempts = attempts + 1
 where id = (select id from outbox_jobs
              where (state = 'PENDING' and run_after <= now())
                 or (state = 'RUNNING' and locked_until < now())   -- 落ちた実行のリースを回収
              order by run_after
              for update skip locked
              limit 1)
returning *;
```

このリースを取る 1 文を短いトランザクションでコミットしてから、ジョブを実行する。after() と tick が同じジョブを同時に取ることはない。実行を終えたら、`locked_by` が自分である場合に限り DONE か PENDING（次の `run_after` つき）に戻す。

ジョブは何度実行されても結果が変わらないように書く。チェーンの取引は、送る前にオンチェーンのアカウントを読み、既に目的の状態なら送らずに記録だけ進める（06 章 5 節）。

### 4.2 トランザクションとロック

依頼の作成は、上限と残高の検査の前に `requester_credentials` の該当行を `SELECT ... FOR UPDATE` で取る。同じ API キーから並行して作成されても、上限を超えて引き当てることはない。

タスクの状態を変える処理は、必ず `verification_requests` の該当行を `SELECT ... FOR UPDATE` で取ってから行う。クレームの受付、提出の受付、合意の算出、キャンセル、期限切れ処理が同じタスクで同時に走っても、空き枠の数と valid の件数が狂わない。

### 4.3 時刻

判定に使う時刻はすべて DB サーバーの `now()` とする。端末の時刻は記録するだけで、判定には使わない（`architecture.md` 5 節「no client timestamp is authoritative」）。

## 5. 画面一覧（Worker Web）

スマートフォンの縦画面だけを想定する。Solana・ウォレット・SOL という言葉は画面に出さない（支払い履歴の Explorer リンクだけ「取引記録を見る」と表示する）。

| # | 画面 | パス | 主な要素 |
|---|---|---|---|
| W-01 | ログイン | `/login` | Privy のメール/Google ログイン |
| W-02 | 初回登録 | `/onboarding` | 招待コード入力、利用規約・安全ルールへの同意、位置とカメラの許可の説明 |
| W-03 | タスク一覧 | `/tasks` | 現在地から近い順。報酬、距離、残り時間、必要な証拠 |
| W-04 | タスク詳細 | `/tasks/[id]` | 質問、店舗の位置（地図アプリへのリンク）、半径、報酬、締切、撮影の注意（店頭と看板を写し、人の顔を避ける）、「引き受ける」ボタン |
| W-05 | 移動中 | `/claims/[id]` | 残り時間、「現地に着いた」ボタン、「やめる」ボタン |
| W-06 | 撮影と回答 | `/claims/[id]/capture` | ライブカメラ、撮影、OPEN/CLOSED/UNCLEAR の選択、送信 |
| W-07 | 判定結果 | `/claims/[id]/result` | 合格/不合格、理由とやり直し方、残り試行回数 |
| W-08 | 支払い履歴 | `/payouts` | 金額、日時、状態、「取引記録を見る」 |

公開結果ページ `/r/[id]` は誰でも見られる。回答、witness 数、判定の一覧、evidence root、確定時刻、Explorer のリンクを出す。写真・座標・質問文・worker の情報は出さない。

## 6. 環境と設定

### 6.1 環境

| 環境 | 用途 | Solana |
|---|---|---|
| local | 開発 | solana-test-validator または LiteSVM |
| preview | PR ごとの Vercel プレビュー | Devnet（決済は無効化） |
| demo | 提出・パイロット | Devnet |

Mainnet の環境は作らない。

### 6.2 環境変数

`NEXT_PUBLIC_` で始まる変数以外はサーバー専用。秘密鍵を読むモジュールの先頭には `import "server-only"` を書き、クライアントのバンドルに入ったらビルドが失敗するようにする。

| 変数 | 内容 | 秘密 |
|---|---|---|
| `DATABASE_URL` | Supabase の接続文字列（pooler 経由） | はい |
| `SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY` | Storage の操作用 | はい |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Privy アプリ ID | いいえ |
| `PRIVY_APP_SECRET`、`PRIVY_VERIFICATION_KEY` | アクセストークンの検証 | はい |
| `SOLANA_RPC_URL` | Devnet の RPC | はい（API キーを含むため） |
| `SOLANA_EXPECTED_GENESIS_HASH` | Devnet の genesis hash。起動時に RPC と照合し、違えば起動を止める | いいえ |
| `PROGRAM_ID` | デプロイ済みプログラムのアドレス | いいえ |
| `BOUNTY_MINT` | 報酬資産の mint | いいえ |
| `OPERATOR_SECRET_KEY` | 手数料支払い・資金拘束・支払い・返金用の鍵（treasury の所有者） | はい |
| `VERIFIER_SECRET_KEY` | 結果確定（finalize）用の鍵 | はい |
| `LOCATION_ENC_KEY` | worker の位置を暗号化する 32 バイト鍵 | はい |
| `WORKER_REF_SALT` | evidence バンドルに入れる worker 参照の HMAC 鍵 | はい |
| `INTERNAL_CRON_SECRET` | `/api/internal/tick` の共有シークレット | はい |
| `ADMIN_TOKEN` | 運営者 API のトークン | はい |
| `WEBHOOK_SIGNING_SECRET_PEPPER` | Webhook 署名鍵の導出用 | はい |
| `PILOT_BBOX` | 対象地域（`minLat,minLng,maxLat,maxLng`） | いいえ |
| `MAX_WITNESSES` | 受け付ける `required_witnesses` の上限。PR-14 までは 1 | いいえ |
| `ANTHROPIC_API_KEY` | AI 画像整合チェック（P1、任意） | はい |
| `APP_ENV` | `local`・`preview`・`demo`。開発用の決済スタブは `demo` では起動を拒否する | いいえ |

config の admin 鍵は Vercel に置かない。`scripts/devnet-setup.ts` を手元で実行するときだけ使う。

## 7. 外部サービスと使い方

| サービス | 使う機能 | 無料枠で足りるか |
|---|---|---|
| Privy | ログイン、Solana 埋め込みウォレットの自動作成（`createOnLogin: "users-without-wallets"`） | パイロットの人数なら足りる |
| Supabase | PostgreSQL、Storage、pg_cron、pg_net | 足りる |
| Vercel | ホスティング、プレビュー | 足りる。cron は Supabase 側で回すので Vercel Cron の頻度制限に当たらない |
| Helius 等 | Devnet RPC | 足りる。公開 RPC はレート制限が厳しいので本番デモでは使わない |
| Circle faucet | Devnet USDC | 1 件 0.5 USDC なら 20〜40 件分を確保すれば足りる |
