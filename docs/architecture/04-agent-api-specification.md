# 04. Agent API 仕様: 3 経路は揃っている。足すのは一覧、見積もり、支出ポリシー

作成: 2026-10-14 ／ 正本は `specs/proofmarket/implementation/ja/05-api-design.md` と `packages/core/openapi.json`。この章はそれらとの差分だけを設計する

## 1. 目的

指示書 4.1 が求める 6 操作（依頼の作成、一覧、状況の確認、成果物の取得、承認、支払い状況の確認）と、認証・API キー管理・レート制限・権限管理・冪等性を、既存の API に照らして設計する。

## 2. 現状

エージェントの入口は 3 つあり、すべて同じサービス層（`createVerification`、`handleGet` など）に入る。

| 経路 | 認証 | 用途 |
|---|---|---|
| REST `/v1/verifications` | API キー（`pm_test_<prefix>_<secret>`） | SDK とスクリプト |
| MCP `/mcp`（Streamable HTTP） | OAuth 2.1（動的クライアント登録、PKCE）。アクセストークン `pm_oat_` は 1 時間 | claude.ai、ChatGPT、Claude Code のコネクタ。道具 8 本 |
| x402 `/v1/x402/verifications` | 支払いそのもの（API キー不要） | 自分のウォレットを持つエージェント |

6 操作との対応は次のとおり。

| 指示書の操作 | 実装 | 評価 |
|---|---|---|
| 依頼の作成 | `POST /v1/verifications`、`/batch`（最大 50 件）、`/v1/schedules`（定期確認） | Implemented |
| 依頼一覧の取得 | 無し。`GET /v1/verifications/{id}` と `GET /v1/schedules` のみ。MCP の `list_reality_verification_watches` は監視中のものだけ | Missing |
| 依頼状況の確認 | `GET /v1/verifications/{id}`。状態、結果、`settlement`、`recheck` を含む | Implemented |
| 成果物の取得 | `GET /v1/verifications/{id}/evidence`（派生画像の 5 分署名 URL） | Implemented |
| 成果物の承認 | 無し。判定を通った提出はすべて払う（D-08）。代わりに `POST .../dispute`（24 時間以内に 1 回） | Missing（設計どおり） |
| 支払い状況の確認 | `GET` の `settlement`（status、signature、explorer_url） | Implemented |

認証、冪等性（`Idempotency-Key` と RFC 8785 の本文ハッシュ、`verification_requests` の一意制約、Task PDA の一意性の三重）、レート制限（credential ごとの 1 分窓、x402 は IP ごとに 30 回、`/join` は 1 分 5 回と 1 日 3 件）、権限（credential ごとの `allowed_task_types`、`allowed_bbox`）は実装済みで、05 章の仕様に細部がある。

## 3. 要件

既存の経路と応答の形を変えない。足すのは次の 3 つで、いずれも省略できる引数か新しいエンドポイントとして加える。

1. 依頼の一覧 API
2. 費用を先に返す「見積もり」と、それを確定する 2 段階（MCP と REST の両方）
3. 支出ポリシーの検査と、その結果を伝える応答

「承認」操作は足さない。理由は 7 節に書く。

## 4. 提案する設計

### 4.1 一覧 API: `GET /v1/verifications`

認証した credential の依頼を新しい順に返す。引数は `status`（複数可）、`created_after`、`limit`（既定 50、最大 200）、`cursor`（ULID の境界）で、応答は `{ verifications: [GetVerificationResponse の要約], next_cursor }` とする。要約は `verification_id`、`status`、`settlement.status`、`bounty`、`created_at`、`deadline`、`result.status`（あれば）に限り、写真の URL や自由記述の答えは含めない。MCP には `list_reality_verifications` を同じ引数で足す。

principal の下に複数の credential がある場合、一覧はその credential の分だけを返す。principal 全体を横断する一覧は依頼者コンソール（`/console`）が担っており、API には足さない。

### 4.2 見積もりと確定の 2 段階

eve-pay が示す「条件を見せる → 承認 → 条件を取り直して照合 → 実行」の型を、ProofMarket の作成 API に移す。作成の本文に `"mode": "quote"` を足すと、残高を引き当てずに次を返す。

```json
{
  "quote_id": "01J...",
  "bounty": { "asset": "USDC", "amount": "0.5", "required_witnesses": 1 },
  "total": "0.5",
  "balance_after": "4.5",
  "policy": { "checked": ["task_type", "location", "deadline", "spend_limit"], "ok": true },
  "expires_at": "2026-10-14T10:05:00Z",
  "reuse": null
}
```

確定は同じ本文に `"quote_id"` を付けて送る。サーバーは本文のハッシュが見積もり時と一致することを確かめ、違えば `409 QUOTE_MISMATCH` で断る。見積もりは 5 分で失効する。既存の `Idempotency-Key` はそのまま効き、見積もりなしの作成もこれまでどおり通る。

MCP では `request_reality_verification` に `confirm: false` を足すと見積もりだけを返し、`quote_id` を付けて再度呼ぶと確定する。道具の説明に「`confirm` を省くと残高が引き当てられる」と明記し、エージェントの実行基盤（Claude の承認機能や Eve の `approval`）が人を止める位置を作る。x402 の窓口は、402 の応答がすでに見積もりの役を果たしている（下見つき）ので変えない。

### 4.3 支出ポリシー

credential の `max_task_amount` と `daily_spend_limit` を作成時に検査する。検査は `createVerification` の残高検査の直前に置き、超過は既存のエラーコード `TASK_AMOUNT_LIMIT_EXCEEDED` と `DAILY_SPEND_LIMIT_EXCEEDED` で返す。両列は null を許すように変え、null は「上限なし」を意味する（移行 0030、09 章）。PR #14 で上限を外した判断は、null を既定にすることで残す。`/join` と x402 で発行するキーには、いまの 5 USDC と 20 USDC をそのまま入れる。

1 日の累計は `requester_ledger` の RESERVE から UTC の日で数え、RELEASE と REFUND は差し引く。principal 単位の月次上限は、台帳が credential 単位のため今回は入れない（10 節）。

### 4.4 API キーの管理

発行は `scripts/issue-api-key.ts`、`/join` の自動発行、x402 の支払いごとの発行の 3 つで、取り消しと停止は `/v1/admin/credentials/{id}/revoke` と `/suspend` である。足りないのは**依頼者自身によるローテーション**で、`POST /v1/credentials/rotate`（認証したキーの secret を新しくし、古い secret を 24 時間の猶予つきで失効）を足す。接頭辞 `pm_test_` はメインネットでも同じ形で発行されるため、`pm_live_` を足して `lib/auth/requester.ts` の正規表現で両方を受ける。

### 4.5 権限

credential の `allowed_task_types`（17 種のうち許可するもの）と `allowed_bbox` は既存で、MCP と x402 でも同じ検査を通る。Webhook の送信先は事前登録制で https のみ。これ以上の細かい権限（読み取り専用のキーなど）は要望が無いので足さない。

## 5. 技術選定の理由

見積もりを別エンドポイントにせず作成の本文の `mode` にしたのは、検査の経路を 1 本に保つためで、x402 の下見がすでにこの形（作成を試して取り消す）で動いている。一覧をカーソル方式にしたのは、ULID が時刻順に並ぶので `created_at` の境界をそのまま使えるからである。

## 6. 代替案

- 承認操作（`POST .../approve` と `/reject`）を足す案。依頼者が支払いを止められると、正当な作業への支払い拒否という脅威（08 §1.1）が戻ってくる。D-08 を保ち、不満は異議で扱う
- 支出ポリシーをプログラム側（Config の上限）に置く案。依頼者ごとの上限はオフチェーンの credential にしかないので、プログラムには入れない。treasury の総額の上限は別（05 章）
- GraphQL や一覧のストリーミング。要望が無い

## 7. セキュリティ上の考慮事項

見積もりの応答は残高を含むので、認証した credential だけに返す。`quote_id` は推測できない ULID で、他の credential の `quote_id` を付けても `404`。一覧 API は所有者以外に `404` を返す既存の規則に従う。ローテーションの猶予 24 時間は、古いキーを使う自動化が止まらないための期間で、`revoke` はこれまでどおり即時である。

「承認」を置かない設計は、指示書の「AI の判定だけで不可逆な支払いをする危険」と表裏の関係にある。依頼者に承認を与えないことで証人を守り、代わりに報酬の額で人の審査を挟む（07 章）。

## 8. 実装上の課題

- `openapi.json` は zod から生成するので、スキーマを変えたら `pnpm openapi` で作り直す（CI が一致を見る）
- MCP の道具の説明文を変えると、claude.ai と ChatGPT の両方で表示が変わる。文言は `/developers` ページと揃える
- 一覧 API は `verification_requests` に `(credential_id, created_at desc)` の索引が要る

## 9. テスト方針

`apps/web/test/requester-api.test.ts` に、一覧（空、カーソルの続き、他人の依頼が出ない）、見積もり（引き当てが起きない、失効、本文違いの 409）、支出ポリシー（1 件超過、1 日超過、null は無制限）の否定テストを足す。MCP は `mcp-http.test.ts` で `confirm: false` の往復を 1 件足す。

## 10. 未決定事項

- principal 単位の月次上限を入れるか（台帳の単位を変える必要がある）
- 一覧 API に worker 側の情報（証人の人数など）をどこまで出すか
- `pm_live_` の接頭辞に替えるタイミング（メインネット移行と同時が自然）
