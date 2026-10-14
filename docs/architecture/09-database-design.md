# 09. データベース設計: 39 表はそのまま。移行 0030 で 4 つを足す

作成: 2026-10-14 ／ 正本は 04 章（テーブル定義）と `packages/db/src/schema.ts`、移行は `packages/db/drizzle/`

## 1. 目的

既存の表と制約が、状態機械と決済の不変条件をどう守っているかを確かめ、04〜08 章の設計に必要な変更を 1 つの移行にまとめる。

## 2. 現状

Drizzle で定義した 39 表が PostgreSQL（Supabase。テストは PGlite）にあり、移行は 0000〜0028 の 29 本（PR #41 の 0029 は審査中）。表は役割で 9 群に分かれる。

| 群 | 表 | 役割 |
|---|---|---|
| 依頼者 | principals、requester_credentials、requester_ledger、deposits、x402_wallets、x402_payments、console_sessions | 身元、API キー（ハッシュ）、前払い残高の台帳、入金、x402 の支払い記録 |
| 依頼 | verification_requests、verification_schedules、verification_challenges、places、place_owner_tokens、place_status_reports | 依頼本体（状態 3 軸）、定期確認、楽観的な確認の異議、店舗の許可リストと申告 |
| 証人 | workers、worker_consents、invite_codes、push_subscriptions、payout_adjustments | Privy のユーザー、同意、招待、通知、支払いの調整 |
| 作業 | claims、challenges、uploads、witness_submissions | 引き受け、nonce、アップロード、提出 |
| 証拠と判定 | evidence_objects、location_observations、evidence_checks、verification_results | 写真（ハッシュ、pHash）、位置（暗号化）、検査の結果、合意の結果 |
| 決済 | payment_records | チェーンの取引（種別、署名の配列、確認時刻） |
| 基盤 | audit_events、idempotency_keys、outbox_jobs、webhook_endpoints、webhook_deliveries、platform_flags、rate_limit_counters | 監査（追記のみ）、冪等、非同期ジョブ、Webhook、旗、レート制限 |
| MCP | oauth_clients、oauth_codes、oauth_tokens | OAuth 2.1 |
| 公開と申し込み | participation_requests、removal_requests | 参加の申し込み、写真の削除依頼 |

不変条件を制約で守っている箇所を挙げる。これらはアプリの不具合があっても DB が最後に止める層である。

- `payment_records` の部分一意索引 `settle_xor_refund`: 1 依頼につき settle か refund の一方しか記録できない
- `requester_ledger` の `one_credit_back_per_task`: 1 依頼につき RELEASE か REFUND の一方だけ
- `verification_requests` の `unique (credential_id, idempotency_key_hash)`: 同じキーで 2 件作れない
- `outbox_jobs.dedupe_key` の一意制約: 同じジョブを 2 度積めない
- `evidence_objects` の SHA-256 の一意制約: 同じ写真を 2 度使えない
- `audit_events` の追記専用トリガー（0001）: 更新と削除を拒む
- 全表の RLS（0001、0004）: PostgREST からの読み取りを止める。`migrations.test.ts` が全表で有効かを確かめる
- `deposits` の主キー `(signature, asset)`（0029、審査中）: 1 取引で複数の通貨を受けられる

時刻の列は DB の既定値に頼らず `app.now()` を明示する（CLAUDE.md の台帳 2026-10-09）。生 SQL の時刻は ISO 文字列で渡す（同 2026-10-08）。

## 3. 要件

04〜08 章の設計に要るのは次の 4 つで、既存の列と行には影響しない。

1. credential の支出上限を null にできること（04 §4.3）
2. 見積もりを 5 分間保持できること（04 §4.2）
3. `platform_flags` に `x402_enabled` を足せること（08 §4.3）
4. 依頼の一覧 API のための索引（04 §4.1）

## 4. 提案する設計: 移行 0030

番号は PR #41 の 0029 の次とする。PR #41 が先に取り込まれない場合は 0029 を使わず、0030 のまま飛ばして当てる（drizzle は欠番を許す）。

```sql
-- 1. 上限を null（無制限）にできる。既存の行は値を保つ
ALTER TABLE requester_credentials ALTER COLUMN max_task_amount DROP NOT NULL;
ALTER TABLE requester_credentials ALTER COLUMN daily_spend_limit DROP NOT NULL;

-- 2. 見積もり（04 §4.2）。本文のハッシュと総額を 5 分だけ持つ
CREATE TABLE verification_quotes (
  id            text PRIMARY KEY,                       -- ULID
  credential_id text NOT NULL REFERENCES requester_credentials(id),
  request_hash  bytea NOT NULL,                         -- RFC 8785 の本文の SHA-256
  asset         text NOT NULL,
  total         numeric(20, 6) NOT NULL CHECK (total > 0),
  created_at    timestamptz NOT NULL,
  expires_at    timestamptz NOT NULL,
  consumed_at   timestamptz,
  verification_id text REFERENCES verification_requests(id)
);
CREATE INDEX verification_quotes_credential_idx ON verification_quotes (credential_id, created_at);
ALTER TABLE verification_quotes ENABLE ROW LEVEL SECURITY;

-- 3. x402 の窓口の旗（08 §4.3）
ALTER TABLE platform_flags DROP CONSTRAINT platform_flags_key_chk;
ALTER TABLE platform_flags ADD CONSTRAINT platform_flags_key_chk CHECK (key IN (
  'tasks_create_enabled','claims_enabled','settlement_enabled','public_evidence_enabled',
  'external_review_enabled','x402_enabled'));

-- 4. 一覧 API（04 §4.1）
CREATE INDEX vr_credential_created_idx ON verification_requests (credential_id, created_at DESC);
```

`audit_events.event_type` に `reconciliation_mismatch`（06 §4.2）を足すのは、列挙が `packages/core/src/domain/enums.ts` と CHECK 制約の両方にあるので、同じ移行で CHECK を作り直す。`evidence_checks.details` に審査の実行者を入れる変更（07 §4.4）は jsonb の中身なので移行は要らない。

見積もりの行は 24 時間で消す（`idempotency_keys` と同じ段で削除）。`consumed_at` が入った行は `verification_id` で依頼に結びつく。

## 5. 技術選定の理由

見積もりを `idempotency_keys` に相乗りさせず別の表にしたのは、冪等キーは「同じ要求の再送」を、見積もりは「別の要求（確定）が前の要求を参照する」を表すためで、意味が違うものを 1 つの表に入れると制約が書けない。上限の null を「無制限」にしたのは、0 を無制限の意味に使うと「0 USDC まで」と区別できないからである。

## 6. 代替案

- 見積もりを DB に持たず、署名つきトークン（HMAC）で返す案。本文のハッシュと総額と期限を HMAC で封じれば表が要らない。ただし「使ったかどうか」を記録できず、同じ見積もりで 2 件作れる。冪等キーと組めば防げるが、2 つの仕組みに分かれるので表のほうが単純
- 上限を principal に持たせる案。04 §10 のとおり、台帳が credential 単位なので今回は見送る

## 7. セキュリティ上の考慮事項

新しい表にも RLS を有効にする。`migrations.test.ts` が全表で確かめるので、忘れるとテストが落ちる（CLAUDE.md の台帳 2026-10-04）。`verification_quotes.request_hash` は本文のハッシュで、本文そのものは持たない。見積もりの応答に残高が入るが、DB には `total` だけを残す。

## 8. 実装上の課題

- 移行は**コードより先に**本番に当てる。null を許す変更は旧コードでも動くが、新コードが `x402_enabled` を読む前に CHECK 制約を変えておく必要がある（0026 のときと同じ順番、CLAUDE.md の台帳 2026-10-09）
- PGlite のテストでは `ALTER TABLE ... DROP CONSTRAINT` が動く（0004 で実績あり）

## 9. テスト方針

`packages/db/test/migrations.test.ts` の既存の検査（全表 RLS、CHECK の列挙がコードと一致）が 0030 にも効く。`verification_quotes` の失効と消費は `apps/web/test/requester-api.test.ts` の見積もりのテストで確かめる。

## 10. 未決定事項

- 0029 と 0030 の順番（PR #41 の取り込みが先か）
- 見積もりの保持を 24 時間より短くするか（5 分で失効するので、行を残す意味は監査だけ）
