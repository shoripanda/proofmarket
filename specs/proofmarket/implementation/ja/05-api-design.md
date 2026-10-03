# 05. API 設計（REST / MCP / Webhook）

作成日: 2026-10-02

`api-contract.md` の外部契約を変えずに、実装に要る細部を足す。足した項目には「追加」と書いた。

## 1. 共通事項

### 1.1 エンドポイント一覧

| メソッド | パス | 利用者 | 優先度 | 備考 |
|---|---|---|---|---|
| POST | `/v1/verifications` | requester | P0 | Idempotency-Key 必須 |
| GET | `/v1/verifications/{id}` | requester | P0 | |
| POST | `/v1/verifications/{id}/cancel` | requester | P0 | |
| GET | `/v1/verifications/{id}/evidence` | requester | P1 | 追加。派生画像の署名 URL |
| GET | `/v1/worker/me` | worker | P0 | 追加 |
| POST | `/v1/worker/onboarding` | worker | P0 | 追加。招待コードと同意 |
| GET | `/v1/worker/tasks` | worker | P0 | |
| GET | `/v1/worker/tasks/{id}` | worker | P0 | 追加 |
| POST | `/v1/worker/tasks/{id}/claim` | worker | P0 | |
| POST | `/v1/worker/claims/{claim_id}/challenge` | worker | P0 | 追加。nonce の発行・再発行 |
| POST | `/v1/worker/claims/{claim_id}/uploads` | worker | P0 | 追加。署名つきアップロード URL |
| POST | `/v1/worker/tasks/{id}/evidence` | worker | P0 | Idempotency-Key 必須 |
| POST | `/v1/worker/claims/{claim_id}/abandon` | worker | P0 | 追加 |
| GET | `/v1/worker/claims/{claim_id}` | worker | P0 | 追加。判定結果と理由 |
| GET | `/v1/worker/payouts` | worker | P1 | 追加 |
| GET | `/v1/public/verifications/{id}` | 誰でも | P1 | 追加。公開してよい項目だけ |
| POST | `/v1/admin/flags` | operator | P0 | 追加 |
| POST | `/v1/admin/{credentials|workers}/{id}/suspend` | operator | P0 | 追加 |
| POST | `/v1/admin/credentials/{id}/revoke` | operator | P0 | 追加 |
| POST | `/v1/admin/verifications/{id}/evidence/revoke-access` | operator | P0 | 追加 |
| POST | `/v1/admin/jobs/{id}/requeue` | operator | P0 | 追加。DEAD の outbox ジョブを PENDING に戻す |
| POST | `/api/internal/tick` | pg_cron | P0 | 追加。外部公開しない扱い（共有シークレット） |

### 1.2 認証

| 利用者 | ヘッダー | 検証 |
|---|---|---|
| requester | `Authorization: Bearer pm_test_<key_prefix>_<secret>` | SHA-256(secret) を `requester_credentials.secret_hash` と照合。`status = active` かつ `revoked_at is null`。principal も active であること |
| worker | `Authorization: Bearer <Privy access token>` | `@privy-io/node` でアクセストークンを検証し、`privy_user_id` から worker を引く。identity token は受け付けない |
| operator | `Authorization: Bearer <ADMIN_TOKEN>` | 定数時間比較 |
| cron | `X-Internal-Secret: <INTERNAL_CRON_SECRET>` | 定数時間比較 |

Solana の秘密鍵や署名を API の認証には使わない（`api-contract.md` Authentication）。

### 1.3 共通ヘッダー（追加）

| ヘッダー | 向き | 内容 |
|---|---|---|
| `Idempotency-Key` | 要求 | 1〜255 文字。作成と証拠提出で必須 |
| `X-Request-Id` | 応答 | ログとの突き合わせ用 |
| `RateLimit-Limit` / `RateLimit-Remaining` / `RateLimit-Reset` | 応答 | 1 分窓のレート制限 |
| `Idempotent-Replayed: true` | 応答 | 保存済みの応答を返したとき |

### 1.4 冪等性の実装

1. `(scope, endpoint, SHA-256(key))` で `idempotency_keys` に `IN_PROGRESS` の行を挿入する
2. 挿入できたら処理を行い、応答を保存して `COMPLETED` にする（処理と同じトランザクション）
3. 既に行があれば:
   - `request_hash` が違う → `409 IDEMPOTENCY_KEY_CONFLICT`
   - `COMPLETED` → 保存した応答をそのまま返す
   - `IN_PROGRESS` → `409 IDEMPOTENCY_IN_PROGRESS`（`retryable: true`）

`request_hash` は本文を RFC 8785 で正規化した JSON の SHA-256。キーの順番や空白の違いは同じ依頼とみなす。

作成 API では、`idempotency_keys` の行が 24 時間で消えた後も `verification_requests` の一意制約が残る。同じキーで同じ本文なら既存の依頼を 200 で返し、本文が違えば 409 `IDEMPOTENCY_KEY_CONFLICT` を返す。

作成の冪等性は二重に守る。上の仕組みに加えて `verification_requests` の `unique (credential_id, idempotency_key_hash)` があり、さらにオンチェーンの Task PDA は同じ `task_id_hash` で二度作れない。

### 1.5 エラー形式

`api-contract.md` 8 節の形式に従う。スタックトレース・SQL・内部 ID・秘密は返さない。

```json
{
  "error": {
    "code": "EVIDENCE_OUTSIDE_GEOFENCE",
    "message": "Evidence location does not satisfy task geofence.",
    "retryable": false,
    "details": { "distance_m": 140, "radius_m": 80 }
  }
}
```

## 2. Requester API

### 2.1 POST /v1/verifications

要求の本文は `api-contract.md` 1 節のとおり。次の検査を上から順に行い、最初に失敗したものを返す。

| # | 検査 | 失敗時 |
|---|---|---|
| 1 | API キーが有効 | 401 `UNAUTHENTICATED` / 403 `CREDENTIAL_SUSPENDED` |
| 2 | `tasks_create_enabled` フラグ | 503 `FEATURE_DISABLED` |
| 3 | レート制限 | 429 `RATE_LIMITED` |
| 4 | JSON スキーマ（型・必須・余分な項目なし） | 400 `VALIDATION_FAILED` |
| 5 | `type` が API キーの許可種別に含まれる | 400 `UNSUPPORTED_TASK_TYPE` |
| 6 | `principal_ref` が API キーの principal と一致 | 403 `PRINCIPAL_MISMATCH` |
| 7 | `answer_schema.values` が `OPEN`・`CLOSED`・`UNCLEAR` の部分集合で、2 個以上 | 400 `VALIDATION_FAILED` |
| 8 | `deadline` が今から 10 分以上 24 時間以内 | 400 `DEADLINE_OUT_OF_RANGE` |
| 9 | `radius_m` が 25〜500、`freshness.max_age_seconds` が 60〜900 | 400 `VALIDATION_FAILED` |
| 10 | 位置が対象地域（API キーの矩形、なければ `PILOT_BBOX`）の中 | 400 `LOCATION_OUT_OF_PILOT_AREA` |
| 10a | 位置が `places` の active な地点から 30 m 以内 | 400 `LOCATION_NOT_ALLOWLISTED` |
| 11 | `evidence_requirements.photo` と `task_nonce` が true（MVP では外せない） | 400 `VALIDATION_FAILED` |
| 12 | `1 ≤ quorum ≤ required_witnesses ≤ MAX_WITNESSES`（PR-14 までは 1、以降は 5） | 400 `VALIDATION_FAILED` |
| 13 | `bounty.asset = "USDC"`、`network = "solana-devnet"`、`amount > 0`、小数 6 桁以内 | 400 `VALIDATION_FAILED` |
| 14 | 質問文のポリシー検査（08 章 3 節） | 422 `TASK_POLICY_VIOLATION`（`details.rule_id` 付き） |
| — | ここで `requester_credentials` の行を `FOR UPDATE` でロックする（15〜17 を並行実行から守る） | — |
| 15 | 総額 ≤ `max_task_amount` | 403 `TASK_AMOUNT_LIMIT_EXCEEDED` |
| 16 | 今日（日本時間の暦日）の引き当て合計 + 総額 ≤ `daily_spend_limit` | 403 `DAILY_SPEND_LIMIT_EXCEEDED` |
| 17 | 残高 ≥ 総額 | 402 `INSUFFICIENT_BALANCE` |

通ったら同じトランザクションで、依頼の作成（CREATED）、残高の引き当て（RESERVE）、audit_events の `request_created`、outbox の `FUND_TASK` を書く。応答は 201。

```json
{
  "verification_id": "ver_01J9Z4K8T3W6Q2M5N7P0R4S8V1",
  "status": "CREATED",
  "created_at": "2026-10-09T03:00:00Z",
  "funding": { "status": "PENDING" }
}
```

### 2.2 GET /v1/verifications/{id}

他の API キーの依頼は 404 `VERIFICATION_NOT_FOUND` とし、存在するかどうかも漏らさない。副作用はない。

```json
{
  "verification_id": "ver_01J9Z4K8T3W6Q2M5N7P0R4S8V1",
  "type": "PLACE_STATUS_VERIFICATION",
  "status": "SETTLED",
  "question": "Is this shop open right now?",
  "answer_schema": { "type": "enum", "values": ["OPEN", "CLOSED", "UNCLEAR"] },
  "location": { "lat": 35.6595, "lng": 139.7005, "radius_m": 80 },
  "deadline": "2026-10-09T04:00:00Z",
  "assurance": { "required_witnesses": 1, "quorum": 1 },
  "bounty": { "asset": "USDC", "amount": "0.50", "network": "solana-devnet" },
  "witness_progress": { "valid": 1, "active_claims": 0, "open_slots": 0, "required": 1 },
  "funding": {
    "status": "CONFIRMED",
    "signature": "5Kd...",
    "explorer_url": "https://explorer.solana.com/tx/5Kd...?cluster=devnet"
  },
  "result": { "...": "2.4 の VerificationResult" },
  "created_at": "2026-10-09T03:00:00Z",
  "updated_at": "2026-10-09T03:14:52Z"
}
```

`result` は outcome が決まるまで `null`。

### 2.3 POST /v1/verifications/{id}/cancel

03 章の T14・T15 の条件で受け付ける。本文は不要。成功すると 200 で現在の状態（`CANCELLED`）を返し、返金が済むと `REFUNDED` に進む。条件を満たさなければ 409 `TASK_NOT_CANCELLABLE`。既に CANCELLED / REFUNDED なら同じ内容を 200 で返す（何度呼んでも同じ結果になる）。

### 2.4 VerificationResult

`api-contract.md` 7 節の形に、追加の項目を足す。

```json
{
  "verification_id": "ver_01J9Z4K8T3W6Q2M5N7P0R4S8V1",
  "status": "VERIFIED",
  "reason": null,
  "answer": "OPEN",
  "witnesses": { "valid": 1, "required": 1, "quorum": 1 },
  "answer_counts": { "OPEN": 1 },
  "consensus_ratio": 1.0,
  "checks": {
    "geofence": "pass",
    "freshness": "pass",
    "task_nonce": "pass",
    "replay": "pass",
    "media_schema": "pass",
    "duplicate": "not_run",
    "vision_consistency": "not_run"
  },
  "evidence_root": "sha256:9f2c...",
  "result_hash": "sha256:41ab...",
  "attestation": {
    "network": "solana-devnet",
    "signature": "3Hq...",
    "task_account": "7Xn...",
    "explorer_url": "https://explorer.solana.com/tx/3Hq...?cluster=devnet"
  },
  "settlement": {
    "status": "SETTLED",
    "signature": "3Hq...",
    "paid": [{ "witness_ref": "wit_1", "amount": "0.50" }]
  },
  "rejected_submissions": { "EVIDENCE_OUTSIDE_GEOFENCE": 1 },
  "verified_at": "2026-10-09T03:14:31Z"
}
```

- `rejected_submissions` は判定に落ちた提出の件数を理由コードごとに数えたもの（追加）。`checks` は valid な提出だけを集約するので、落ちた提出の情報はこちらで返す（REQ-V-009）
- `result_hash` は、この JSON から `result_hash`・`consensus_ratio`・`attestation`・`settlement`・`verified_at` を除いたものを正規化して計算する（07 章 5.2）。`consensus_ratio` は `answer_counts` から導けるので入れない
- `status` は outcome（`VERIFIED`・`REJECTED`・`EXPIRED`）。`reason` は `NO_CONSENSUS` か `INSUFFICIENT_WITNESSES`
- `checks` は witness が複数のとき、全 valid 提出の判定を項目ごとに集約する。1 件でも `warning` があれば `warning`
- `settlement.status` の値は `PENDING`・`SUBMITTED`・`SETTLED`・`REFUNDED`・`FAILED_RETRYING`。オンチェーンで finalized を確認するまで `SETTLED`・`REFUNDED` にしない。内部の `settlement_status = CONFIRMED` は、支払いなら `SETTLED`、全額返金なら `REFUNDED` として見せる
- MVP では finalize と settle を 1 つの取引にまとめるので、`attestation.signature` と `settlement.signature` は同じ値になる（06 章 4 節）
- 信頼度のパーセント表示は持たない（`acceptance-criteria.md` A4）
- `witness_ref` はタスク内の連番。worker の ID や公開鍵は返さない

### 2.5 GET /v1/verifications/{id}/evidence（P1）

自分の依頼の valid な提出について、EXIF を除いた派生画像の署名 URL（5 分有効）を返す。`public_evidence_enabled` フラグが偽か、運営者が公開を止めた依頼では 403 `EVIDENCE_ACCESS_REVOKED`。座標は返さない。

## 3. Worker API

### 3.1 POST /v1/worker/onboarding

```json
{ "invite_code": "PM-7KQ2-XA9D", "consents": { "worker_terms": "2026-10-03", "safety_rules": "2026-10-03", "privacy_notice": "2026-10-03" } }
```

招待コードを消費し、Privy のユーザー情報から埋め込みウォレットのアドレスを取って `workers.payout_pubkey` に保存する。アドレスはクライアントから受け取らない。失敗は 403 `INVITE_INVALID`。未登録の worker がほかの worker API を呼ぶと 403 `WORKER_NOT_ONBOARDED`。

### 3.2 GET /v1/worker/tasks?lat=&lng=&radius_km=

`radius_km` は 1〜20、既定 5。クライアントは現在地を小数 3 桁（約 100 m）に丸めてから送る。URL はホスティングのアクセスログに残るため、正確な位置をクエリに載せない。サーバーも受け取った位置を保存しない（REQ-PR-001）。

```json
{
  "tasks": [
    {
      "verification_id": "ver_01J9Z4K8...",
      "question": "Is this shop open right now?",
      "answer_values": ["OPEN", "CLOSED", "UNCLEAR"],
      "location": { "lat": 35.6595, "lng": 139.7005, "radius_m": 80 },
      "distance_m": 420,
      "reward": { "asset": "USDC", "amount": "0.50" },
      "deadline": "2026-10-09T04:00:00Z",
      "freshness_max_age_seconds": 300,
      "open_slots": 1,
      "requirements": ["photo", "location", "task_nonce"],
      "safety_notes_version": "2026-10-03"
    }
  ]
}
```

requester の名前・principal・API キーは返さない（`api-contract.md` 4 節）。

### 3.3 POST /v1/worker/tasks/{id}/claim

本文は不要。タスク行をロックして、`claims_enabled`、タスクの状態、deadline、open_slots > 0、同じ worker の既存クレームがないことを確かめる。

```json
{
  "claim_id": "clm_01J9Z5...",
  "status": "CLAIMED",
  "expires_at": "2026-10-09T03:45:00Z",
  "challenge": { "challenge_id": "chl_01J9Z5...", "nonce": "q8V3...（32 バイトの乱数を base64url）", "expires_at": "2026-10-09T03:20:00Z" }
}
```

失敗は 409 `TASK_NOT_CLAIMABLE`・`NO_OPEN_SLOT`・`ALREADY_CLAIMED`、410 `TASK_EXPIRED`。

### 3.4 POST /v1/worker/claims/{claim_id}/challenge（追加）

現地に着いて撮影画面を開いたときにクライアントが呼ぶ。既存の ISSUED を SUPERSEDED にして新しい nonce を返す。有効期間は `min(freshness_max_age_seconds, クレームの残り, deadline までの残り)`。クレームが ACTIVE でなければ 409 `CLAIM_NOT_ACTIVE`。

### 3.5 POST /v1/worker/claims/{claim_id}/uploads（追加）

```json
{ "challenge_id": "chl_01J9Z5...", "content_type": "image/jpeg", "byte_size": 1834221 }
```

```json
{ "upload_id": "upl_01J9Z6...", "upload_url": "https://<project>.supabase.co/storage/v1/object/upload/sign/evidence-raw/...", "expires_in_seconds": 120, "max_bytes": 8388608 }
```

`content_type` は `image/jpeg` だけ（クライアントで JPEG にしてから送る。07 章）。ほかの値は 415 `MEDIA_TYPE_UNSUPPORTED`。`byte_size` が 8 MiB を超えると 413 `MEDIA_TOO_LARGE`。チャレンジが ISSUED でないと 409 `NONCE_INVALID`、期限切れなら 410 `NONCE_EXPIRED`（新しい nonce を取り直す）。

### 3.6 POST /v1/worker/tasks/{id}/evidence

本文は `api-contract.md` 6 節のとおり。`challenge.nonce` は平文で送り、サーバーが SHA-256 を取って照合する。

前段の検査に落ちたら提出を記録せずエラーを返す。試行回数も減らない。

| 検査 | エラー |
|---|---|
| 認証・クレームの持ち主・クレームが ACTIVE | 403 `FORBIDDEN` / 409 `CLAIM_NOT_ACTIVE` |
| タスクが受付中で deadline 前 | 410 `TASK_EXPIRED` |
| nonce がこのクレームの ISSUED と一致 | 400 `NONCE_INVALID` / 409 `NONCE_USED` |
| upload がこのクレームの PENDING で、`upload.challenge_id` が使う nonce のチャレンジと一致 | 404 `UPLOAD_NOT_FOUND` / 400 `NONCE_INVALID` |
| `answer` が選択肢に含まれる | 400 `ANSWER_INVALID` |

nonce の有効期間はここでは見ない。時間切れは次の判定 `freshness` で `EVIDENCE_STALE` として記録し、試行 1 回に数える（アップロード URL を取った時点では有効だったため）。

前段を通ったら提出を記録し、07 章の判定を行う。判定の合否は HTTP エラーではなく、200 の本文で返す。

```json
{
  "submission_id": "sub_01J9Z7...",
  "state": "INVALID",
  "reason_code": "EVIDENCE_OUTSIDE_GEOFENCE",
  "reason_message_ja": "店舗から 140 m 離れた位置で撮影されています。店舗の 80 m 以内に近づいて撮り直してください。",
  "retryable": true,
  "attempts_remaining": 2,
  "claim_state": "ACTIVE",
  "checks": { "task_nonce": "pass", "freshness": "pass", "geofence": "fail", "media_schema": "not_run", "replay": "not_run", "duplicate": "not_run" }
}
```

### 3.7 その他

- `POST /v1/worker/claims/{claim_id}/abandon`: ACTIVE なら ABANDONED にする。それ以外なら現在の状態をそのまま返す
- `GET /v1/worker/claims/{claim_id}`: クレームの状態、提出ごとの判定、理由、タスクの結果（自分の提出が valid のとき）
- `GET /v1/worker/payouts`: 自分が支払いを受けたタスク、金額、状態、Explorer の URL

## 4. 公開 API と運営者 API

`GET /v1/public/verifications/{id}` は 2.4 の VerificationResult から次を除いて返す: `checks` の内訳以外の提出ごとの情報、質問文、位置、証拠の URL。ID を知っている人だけが見られる前提で、一覧の API は作らない。

運営者 API は 08 章 6 節の障害対応で使う。すべて audit_events に `actor_type = operator` で残す。

## 5. Webhook（P1）

- 送信先は運営者が事前に登録する（`scripts/register-webhook.ts`）。https のみ、IP アドレスの直書き不可、DNS で引いた先がプライベート・ループバック・リンクローカルなら送らない、リダイレクトを追わない、タイムアウト 5 秒
- イベントは `api-contract.md` 11 節の 7 種類に、`verification.cancelled`（資金拘束の失敗を含むキャンセル）を足した 8 種類
- 署名ヘッダー: `ProofMarket-Signature: t=<unix秒>,v1=<hex(HMAC-SHA256(secret, t + "." + body))>`。受信側は 5 分以上ずれたものを捨てる
- 重複排除用に `ProofMarket-Event-Id: evt_...` を付ける。再送は同じ ID
- 再送は最大 6 回（30 秒、2 分、10 分、30 分、1 時間、2 時間）。Webhook の失敗は決済を一切動かさない

本文:

```json
{ "id": "evt_01J9Z8...", "type": "verification.settled", "created_at": "2026-10-09T03:15:02Z", "data": { "verification_id": "ver_01J9Z4K8...", "status": "SETTLED" } }
```

本文に結果全体は入れない。受信側は GET で取り直す（署名鍵が漏れても結果を偽装できないようにするため）。

## 6. MCP（P1）

`packages/mcp` は stdio で動く MCP サーバーで、環境変数 `PROOFMARKET_API_KEY`・`PROOFMARKET_BASE_URL`・`PROOFMARKET_PRINCIPAL_REF` を読み、`packages/sdk` 経由で REST を呼ぶ。

| ツール | 対応 API | 入力 |
|---|---|---|
| `request_reality_verification` | POST /v1/verifications | 作成 API の本文。`principal_ref` は省略可（環境変数 `PROOFMARKET_PRINCIPAL_REF` で補う）。`idempotency_key` は省略可で、省略時は引数を正規化した JSON の SHA-256 を使う |
| `get_reality_verification` | GET /v1/verifications/{id} | `verification_id`、`wait_seconds`（0〜20。指定すると状態が変わるまで最大その秒数だけ待ってから返す） |
| `cancel_reality_verification` | POST /v1/verifications/{id}/cancel | `verification_id` |

`request_reality_verification` の説明文（英語でそのまま登録する）:

> Ask a real human witness to check a fact about a public physical place (for example, whether a shop is open right now). This is asynchronous: a person must travel to the location, so results typically take 10–60 minutes. This tool returns a verification_id immediately; call get_reality_verification to read the result. Never assume or invent the outcome before the result status is VERIFIED, REJECTED or EXPIRED.

ツールは待ちきれなかった場合も現在の状態をそのまま返し、完了を装わない（`api-contract.md` 10 節）。

### 6.1 HTTP で公開する MCP（2026-10-03 追加）

stdio 版は、動かす人の手元でしか使えない。他人の PC やスマホの AI エージェントからも依頼を出せるように、同じツールを Web アプリから HTTP で公開する。

- 入口は `POST /mcp`。MCP の Streamable HTTP で、セッションの状態は持たない。GET と DELETE は 405 を返す
- 認証は `Authorization: Bearer <API キー>`。REST と同じ鍵を使い、停止・失効・レート制限・冪等性も REST と同じ規則で判定する。鍵が無いか無効なら 401 と `WWW-Authenticate: Bearer` を返す
- `principal_ref` を省略したら、鍵の持ち主の principal で補う
- ツールは stdio 版と同じ3つ。中では REST のハンドラを同じプロセスで呼ぶので、判定の規則は REST と一か所にまとまる
- `get_reality_verification` は最大20秒待つので、この関数の実行時間の上限は60秒にする
- Claude や ChatGPT のスマホアプリは API キーを書く欄が無く、OAuth で接続する。これは 6.2 で足す

## 7. x402 V2（Stretch）

x402 は残高への入金にだけ使い、タスクごとのエスクローとは分ける（`architecture.md` 6 節）。

- `POST /v1/balance/topup`（追加）: 支払いがなければ 402 と `PAYMENT-REQUIRED` ヘッダーを返す。クライアントが `PAYMENT-SIGNATURE` を付けて再送したら検証して決済し、`PAYMENT-RESPONSE` を返して `requester_ledger` に TOPUP を記帳する
- スキームは `exact`、ネットワークは CAIP-2 の `solana:EtWTRABZaYq6iMfeYKouRu166VU2xqa1`（Devnet）
- サーバーは `@x402/core`・`@x402/svm` を使う。V1 の `X-PAYMENT` ヘッダーは実装しない（REQ-P-007）
- 実装前に `https://solana.com/docs/payments/agentic-payments/x402` で最新の仕様を確認する

## 8. エラーコード一覧

| コード | HTTP | retryable | 出る場所 |
|---|---|---|---|
| `UNAUTHENTICATED` | 401 | false | 全体 |
| `FORBIDDEN` | 403 | false | 全体 |
| `CREDENTIAL_SUSPENDED` | 403 | false | requester |
| `PRINCIPAL_MISMATCH` | 403 | false | 作成 |
| `WORKER_NOT_ONBOARDED` | 403 | false | worker |
| `INVITE_INVALID` | 403 | false | 登録 |
| `VALIDATION_FAILED` | 400 | false | 全体 |
| `UNSUPPORTED_TASK_TYPE` | 400 | false | 作成 |
| `DEADLINE_OUT_OF_RANGE` | 400 | false | 作成 |
| `LOCATION_OUT_OF_PILOT_AREA` | 400 | false | 作成 |
| `LOCATION_NOT_ALLOWLISTED` | 400 | false | 作成 |
| `TASK_POLICY_VIOLATION` | 422 | false | 作成 |
| `TASK_AMOUNT_LIMIT_EXCEEDED` | 403 | false | 作成 |
| `DAILY_SPEND_LIMIT_EXCEEDED` | 403 | true | 作成（翌日に再試行可） |
| `INSUFFICIENT_BALANCE` | 402 | false | 作成 |
| `RATE_LIMITED` | 429 | true | 全体 |
| `IDEMPOTENCY_KEY_CONFLICT` | 409 | false | 作成・提出 |
| `IDEMPOTENCY_IN_PROGRESS` | 409 | true | 作成・提出 |
| `VERIFICATION_NOT_FOUND` | 404 | false | requester・worker |
| `TASK_NOT_CANCELLABLE` | 409 | 状況による | キャンセル |
| `EVIDENCE_ACCESS_REVOKED` | 403 | false | 証拠の取得 |
| `TASK_NOT_CLAIMABLE` | 409 | false | クレーム |
| `NO_OPEN_SLOT` | 409 | true | クレーム |
| `ALREADY_CLAIMED` | 409 | false | クレーム |
| `TASK_EXPIRED` | 410 | false | worker |
| `CLAIM_NOT_ACTIVE` | 409 | false | worker |
| `NONCE_INVALID` | 400 | false | アップロード・提出 |
| `NONCE_USED` | 409 | false | 提出 |
| `NONCE_EXPIRED` | 410 | true | チャレンジ・アップロード |
| `UPLOAD_NOT_FOUND` | 404 | false | 提出 |
| `ANSWER_INVALID` | 400 | false | 提出 |
| `MEDIA_TYPE_UNSUPPORTED` | 415 | false | アップロード |
| `MEDIA_TOO_LARGE` | 413 | false | アップロード |
| `FEATURE_DISABLED` | 503 | true | 全体（運営者のフラグ） |
| `INTERNAL_ERROR` | 500 | true | 全体 |

提出 API が 200 の本文で返す判定の理由コード（`EVIDENCE_STALE`、`LOCATION_ACCURACY_TOO_LOW`、`EVIDENCE_OUTSIDE_GEOFENCE`、`MEDIA_TYPE_UNSUPPORTED`、`MEDIA_TOO_LARGE`、`MEDIA_DECODE_FAILED`、`EVIDENCE_REPLAYED`、`EVIDENCE_NEAR_DUPLICATE`）は 07 章 3 節にある。
