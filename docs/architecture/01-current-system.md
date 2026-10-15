# 01. 現行システム: 決済と検証は動いている。支出上限と鍵の置き場が弱い

作成: 2026-10-14 ／ 対象: `origin/main` コミット `05d6544`（PR #37 まで、266 コミット、2026-09-11 開始）／ 未マージの PR #39〜#42 は「審査中」と明記する

## 1. 目的

指示書の第 1 段階に当たる。ProofMarket の技術構成を機能ごとに Implemented / Partial / Missing / Unknown の 4 段階で評価し、第 3 段階以降の設計の出発点にする。コードから確かめた事実と、推測・提案を分けて書く。推測には「（推測）」、提案には「（提案）」と付ける。

## 2. 現状: 要約

ProofMarket は AI エージェントが人に現実世界の確認を頼み、写真と答えを受け取って USDC で払う仕組みで、Next.js の単一アプリとして Vercel で動いている。依頼の作成からエスクロー、検証、支払いまでは一通り実装済みで、本番（proofmarket.fun）は Devnet で稼働中である。評価の結果を先に表にまとめる。

| 機能 | 評価 | 根拠（コードの場所） |
|---|---|---|
| フロントエンド（worker PWA・公開ページ・依頼者コンソール） | Implemented | `apps/web/app/(worker)`、`(site)`、`r/[id]`。ページ 29 本 |
| バックエンド（REST `/v1`、tick、MCP） | Implemented | Route Handler 59 本、`lib/services` 35 ファイル |
| データベース | Implemented | `packages/db/src/schema.ts` に 39 表、移行 0000〜0028 |
| Solana との接続 | Implemented | `packages/solana/src/anchor-adapter.ts`、`send.ts` |
| ウォレット認証（worker） | Implemented | Privy のアクセストークン検証（`lib/auth/worker.ts`） |
| ウォレット認証（requester） | Missing（設計どおり） | API キーと OAuth のみ。Solana の署名は認証に使わない（05 §1.2） |
| USDC 決済 | Implemented | 前払い残高の台帳 `requester_ledger` と Solana Pay 入金、x402 |
| エスクロー | Implemented | Anchor プログラム v1.2、命令 8 本、LiteSVM テスト 23 本 |
| AI エージェント向け API | Implemented | REST・MCP（OAuth 2.1）・x402 の 3 経路 |
| 依頼作成・受注・納品フロー | Implemented | 状態機械（03 章）、claim・challenge・submission |
| 成果物の検証 | Implemented | 機械検査 6 種 + Claude の審査 + 人の審査（任意） + 異議 |
| 成果物の「承認」（依頼者が承認・却下する操作） | Missing（設計どおり） | D-08 で「判定を通った提出はすべて払う」。承認操作はなく、代わりに異議がある |
| 依頼一覧の取得（requester） | Missing | `GET /v1/verifications`（一覧）が無い。ID 指定の GET のみ |
| 支出上限（1 件・1 日） | Partial | `requester_credentials.max_task_amount` と `daily_spend_limit` は保存されるが、作成時に検査する箇所がない |
| 緊急停止 | Implemented | `platform_flags` 5 種、プログラムの `paused`、credential と worker の suspend |
| 鍵管理 | Partial | operator と verifier の秘密鍵は Vercel の環境変数に base58 で置く。KMS や MPC は使っていない |
| デプロイ環境 | Implemented | Vercel + Supabase（PostgreSQL、Storage、pg_cron）。CI は GitHub Actions 3 ジョブ |
| 環境変数とシークレット | Implemented | `apps/web/lib/env.ts` で zod 検査。gitleaks を CI で実行 |
| テスト | Implemented | テストファイル 54 本。Web 234 件、core 78 件、db 7 件、sdk 10 件、プログラム 23 件 |
| メインネット | Partial | 起動の門（`lib/cluster.ts`）と鍵は用意済み。プログラムは未配置、RPC は Helius に決定（未契約） |
| 多通貨（USDC 以外） | Partial | SOL は main で動く。11 通貨と Token-2022 は PR #39〜#42 で審査中 |

Missing の 2 件はどちらも「無いことを決めた」か「まだ要らなかった」もので、不具合ではない。Partial の中では支出上限の未検査がいちばん重く、08 章で先に扱う。

## 3. 要件（この文書で確かめること）

指示書が挙げた 13 項目（フロントエンド、バックエンド、DB、Solana 接続、ウォレット認証、USDC 決済、エスクロー、Agent API、依頼フロー、検証、デプロイ、環境変数、テスト）を順に見る。以下は各項目の事実で、評価の根拠になる。

## 4. 提案する設計（この文書では「見つけた事実」）

### 4.1 技術構成

TypeScript 5.9 と pnpm 12 のモノレポで、Node 24 を要求する。構成は `apps/web`（Next.js 16.3、React 19）、`packages/core`（DB にも Solana にも依存しない純粋な TS）、`packages/db`（Drizzle 0.45、移行 SQL）、`packages/solana`（決済アダプタ）、`packages/sdk`（依頼者向けクライアント）、`packages/mcp`（MCP サーバー）、`programs/proofmarket`（Anchor 1.2、Rust）、`scripts`（運用 19 本）である。lint と整形は Biome、テストは Vitest 5 と PGlite と LiteSVM 0.17 と Playwright を使う。

### 4.2 Solana との接続

クライアントは `@solana/web3.js` 1.99 と `@anchor-lang/core` 1.2.0、`@solana/spl-token` 0.4.15 で、`@solana/kit` は使っていない。理由は 02 章（既存仕様）に書かれており、Anchor 1.x の TS クライアントが web3.js v1 を前提にするためである。送信は `anchor-adapter.ts` の中にあり、finalized の blockhash を取り、優先手数料は固定の 10,000 micro-lamports、確認は 60 秒まで finalized を待つ。PR #40 ではこれを `send.ts` に切り出し、直近手数料の p75 で手数料を決め、2 秒ごとに再送し、ATA 作成だけ confirmed で進める形に変わる（審査中）。

RPC は本番が Devnet の公開 RPC か Helius で、メインネットの契約先は 2026-10-13 に Helius の Developer プランに決めた（`docs/ops/rpc-mainnet-2026-10-13.md`）。起動時に `SOLANA_EXPECTED_GENESIS_HASH` を RPC と照合し、違えば起動しない。

### 4.3 ウォレット認証

worker は Privy（`@privy-io/react-auth` 3.46、`@privy-io/node` 0.35）でメールか Google でログインし、初回に Solana の埋め込みウォレットが作られる。worker は取引に署名しない。サーバーは Privy のアクセストークンだけを受け付け、identity token は拒む。

requester（エージェント）は `Authorization: Bearer pm_test_<prefix>_<secret>` の API キーか、MCP 用の OAuth アクセストークン（`pm_oat_`）で認証する。秘密は SHA-256 のハッシュだけを DB に置き、定数時間で比較する。ウォレット署名での認証は仕様で退けている（`api-contract.md`）。

### 4.4 USDC 決済

依頼者の資金は前払い残高の方式で、DB の `requester_ledger`（TOPUP / RESERVE / RELEASE / REFUND）に記録する。入金は 3 通りある。運営者が手で入れる TOPUP（`scripts/issue-api-key.ts`、`/join` のお試し残高 5 USDC）、Solana Pay の参照つき送金を tick が検出する入金（15 §4.3、`deposits` 表）、そして x402 の支払いである。x402 は `POST /v1/x402/verifications` で、v2 の `PAYMENT-REQUIRED` と `PAYMENT-SIGNATURE` ヘッダーを使い、運営者自身が facilitator として `scheme_exact_svm.md` の MUST をすべて検証してから手数料の支払者として共同署名する（`packages/solana/src/x402.ts`）。公式の `@x402/svm` は使っていない。通貨は USDC だけで、額は `bounty.amount × required_witnesses` に固定される。

### 4.5 エスクロー

Anchor プログラム v1.2（Devnet `A9frCat4fv1rKRKF4sAg6WT8LaUwm4CvJ1JZb81kgC2s`）は命令 8 本を持つ。`initialize_config`、`update_config`、`add_mint`、`remove_mint`、`initialize_task`（treasury から vault へ）、`finalize_verification`（verifier が結果と受取人を記録）、`settle`（vault から証人へ、余りは treasury へ、vault を閉じる）、`refund`（全額を treasury へ）である。Task PDA は `task_id_hash` で一意なので同じ依頼を二度は資金化できず、`settle` と `refund` は状態を読んでから動くので二重払いが起きない。鍵は admin（更新権限、サーバーに置かない）、operator（お金を動かす）、verifier（結果を書く）の 3 本に分かれ、`initialize_config` は operator ≠ verifier を要求する。運営者による点検記録が `docs/security/program-review-2026-10-13.md` にあり、第三者監査は受けていない。

### 4.6 依頼のライフサイクル

状態は CREATED → FUNDED → OPEN → CLAIMED → SUBMITTED → VERIFYING → VERIFIED → SETTLED で、分岐に REJECTED、EXPIRED、CANCELLED、REFUNDED がある（03 章の遷移表 T01〜T19）。資金（funding / settlement）と結果（outcome）は別の軸で持つ。DISPUTED という状態はなく、異議は「再確認の依頼を新しく作る」操作として実装されている（01 §4.12）。非同期処理はトランザクショナル outbox で、pg_cron が毎分 `/api/internal/tick` を呼び、リース方式でジョブを取る。

### 4.7 成果物の検証

機械検査は、位置（geofence）、鮮度、チャレンジ nonce、使い回し（replay）、似た写真（pHash のハミング距離 6 以内、90 日）、画像の形式の 6 種で、通った提出だけを Claude が依頼文と突き合わせる（`lib/adapters/claude-reviewer.ts`、既定モデル `claude-opus-5-5`）。判定は pass / fail / uncertain の 3 値で、fail は worker にやり直しを求め、uncertain と API 障害は warning つきで合格にする。フラグ `external_review_enabled` を立てると、提出はオーナーの Mac の Claude Code が判定するまで止まり、30 分を過ぎると確認なしで通る（01 §4.17）。依頼者は確定から 24 時間以内に 1 回だけ異議を出せ、その費用で再確認の依頼が作られる。楽観的な確認（13 §3）では、最初の提出で仮の答えを返し、異議期間のあと確定する。

### 4.8 デプロイ環境と運用

本番は Vercel（proofmarket.fun）と Supabase で、`vercel.json` は無く Git 連携で配置する。pg_cron が tick を呼び、GitHub Actions の `uptime.yml` が 5 分ごとに `/v1/health/ready` を外から見る。CI（`ci.yml`）は TypeScript（lint、typecheck、test、OpenAPI の一致、`next build`、クライアントバンドルに鍵らしき文字列が無いこと）、program（`anchor build`、`cargo test`、IDL の一致）、secrets（gitleaks）の 3 ジョブで、PR のマージ条件になっている。

### 4.9 環境変数とシークレット

`apps/web/lib/env.ts` が起動時に zod で検査し、足りなければ起動しない。秘密は `DATABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`、`PRIVY_APP_SECRET`、`SOLANA_RPC_URL`、`OPERATOR_SECRET_KEY`、`VERIFIER_SECRET_KEY`、`LOCATION_ENC_KEY`、`WORKER_REF_SALT`、`WEBHOOK_SIGNING_SECRET_PEPPER`、`INTERNAL_CRON_SECRET`、`ADMIN_TOKEN`、`ANTHROPIC_API_KEY`（任意）で、すべて Vercel の環境変数にある。メインネット用には `SOLANA_CLUSTER`、`REAL_FUNDS_ENABLED`、`LEGAL_SIGNOFF` が加わり、Devnet で使った鍵をメインネットで拒む（`lib/cluster.ts`）。鍵の原本は `~/.config/proofmarket/` にあり、リポジトリには無い。

### 4.10 テスト

テストファイルは 54 本で、`packages/core` が純粋関数の単体テスト（78 件）、`apps/web/test` が PGlite 上の統合テスト（偽のチェーンアダプタ、234 件）、`packages/solana/test/localnet.test.ts` が本物のバリデータでの往復（`PM_LOCALNET=1` のときだけ動く 5 件）、`programs/proofmarket/tests` が LiteSVM（23 件）である。件数は 2026-10-14 に main で実行して数えた。Playwright の e2e は `apps/web/e2e` にあり CI では回していない（推測: 偽カメラの準備が要るため手元で回す運用）。

## 5. 技術選定の理由（既存の決定）

既存仕様 00 章の決定一覧 D-01〜D-17 に理由がある。要点だけ挙げると、10 日で 1 人と Claude Code が作り切るために TypeScript に統一して 1 つのサーバーにまとめ（D-01）、一意制約とトランザクションで冪等性を守れる PostgreSQL を選び（D-02）、worker にウォレットを意識させないために Privy を選んだ（D-04）。requester に Solana の秘密鍵を持たせず前払い残高にしたのは D-05 で、本番で同じことをするには法務確認が要ると書かれている。

## 6. 代替案（既存仕様が退けたもの）

Hono などの別 API サーバー、Firestore、Prisma、S3、自前のキーペア預かり、素の Rust、`@solana/kit` 単独。退けた理由は 02 章（既存仕様）の表にある。

## 7. セキュリティ上の考慮事項（見つかった弱点）

重さの順に 4 つある。

1. **支出上限が検査されていない。** `requester_credentials` に 1 件と 1 日の上限が保存され、x402 と `/join` のキーには 5 USDC と 20 USDC が書き込まれるが、`createVerification` でこれを読む箇所がない。検査は最初の実装（コミット `89c0159`）にはあり、2026-10-09 の PR #14（コミット `0a3e3a5`「no cap on the bounty an agent pays」）で意図して外された。エラーコード `TASK_AMOUNT_LIMIT_EXCEEDED` と `DAILY_SPEND_LIMIT_EXCEEDED` は残っている。いま歯止めになっているのは前払い残高だけで、残高の範囲なら 1 件に全額を使える。指示書の「AI エージェントが無制限に資金を使用できる設計は禁止する」に照らすと、残高が上限として働いているので無制限ではないが、キーに書かれた上限が表示だけなのは誤解を招く。
2. **operator 鍵が Vercel の環境変数にある。** メインネットでは実際のお金を持つ鍵になる。15 §4.2 は treasury に置く額の上限で被害を抑える方針だが、上限の値と移し替えの手順はまだ決まっていない。
3. **プログラムの更新権限。** 配置した鍵が upgrade authority になる。点検記録 5 項は、配置後にマルチシグかハードウェア財布へ移すよう求めているが、まだ Devnet の話である。
4. **AI の判定だけで支払いが確定しうる。** 機械検査と Claude の pass で支払いが outbox に積まれ、確定後は取り消せない。依頼者の救済は異議（再確認の費用は依頼者持ち）だけである。評価は 07 章に書く。

## 8. 実装上の課題

- `@solana/kit` への移行は、Anchor の TS クライアントが web3.js v1 を要求する間は部分的にしかできない（02 章で扱う）
- 本番のプログラムは SBPF v0 で配置されており、`anchor build` の既定（v3）とは別に `cargo build-sbf --tools-version v1.57` で作る必要がある（CLAUDE.md の失敗ルート台帳 2026-10-08）
- 多通貨対応（PR #39〜#42）が審査中で、取り込みの順番（#39 → #40 → #41 → #42）と移行 0029 の先当てが決まっている。この文書群はそれを前提にしない

## 9. テスト方針（現状の評価）

CI の 3 ジョブがマージ条件になっており、OpenAPI と IDL がコードと一致することも機械で確かめている。足りないのは、負荷試験（決済ジョブが tick に収まるかの実測）と、本物のチェーンでの e2e を CI で回す仕組みである。11 章の Phase 5 で扱う。

## 10. 未決定事項

- 支出上限をどの単位で検査するか（1 件・1 日・1 月・principal 単位）。08 章と 11 章で案を出す
- operator 鍵を KMS や MPC に移すか、treasury の上限だけで済ませるか
- 依頼者の「承認」操作を足すか、D-08（判定を通った提出はすべて払う）を維持するか
- Unknown と評価した項目は無い。ただし本番 DB の中身（依頼の実数や決済の所要時間）は読んでおらず、この文書の評価はコードと仕様書だけに基づく
