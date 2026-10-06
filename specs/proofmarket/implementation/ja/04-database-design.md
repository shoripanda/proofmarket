# 04. データベース設計

作成日: 2026-10-02

## 1. 方針

- PostgreSQL（Supabase）を 1 つ使う。スキーマは `packages/db` の Drizzle 定義を正とし、ここに書く SQL はその意図を示す
- 冪等性・replay 防止・二重決済防止は、アプリのコードより先に一意制約で守る。アプリの検査が漏れても DB がはじく
- ID は接頭辞つきのランダム文字列（`ver_`、`clm_` など + 26 文字の ULID）。推測できず、時刻順に並ぶ
- 時刻はすべて `timestamptz`、判定は DB の `now()` を使う
- Supabase の PostgREST からは読めないようにする。全テーブルで RLS を有効にしてポリシーを作らず、サーバーは直接接続で操作する
- `offchain-data-model.md` の論理エンティティとの対応を各テーブルの見出しに書く

## 2. ER 概要

```text
principals 1─* requester_credentials 1─* verification_requests 1─* claims 1─* challenges
                    │                          │                    │
                    ├─* requester_ledger        │                    ├─* uploads
                    ├─* idempotency_keys        │                    └─* witness_submissions 1─* evidence_objects
                    └─* webhook_endpoints       │                              │            └─1 location_observations
                                                │                              └─* evidence_checks
workers 1─* claims                              ├─1 verification_results
workers 1─* worker_consents                     ├─* payment_records
                                                ├─* audit_events
                                                └─* outbox_jobs
```

## 3. テーブル定義

### 3.1 principals（Principal）

```sql
create table principals (
  id                  text primary key,              -- prn_...
  type                text not null check (type in ('person','organization')),
  display_name        text not null,
  verification_status text not null default 'unverified'
                      check (verification_status in ('unverified','verified')),
  jurisdiction        text not null default 'JP',
  status              text not null default 'active' check (status in ('active','suspended')),
  contact_encrypted   bytea,                          -- 連絡先は暗号化して別に持つ
  created_at          timestamptz not null default now()
);
```

### 3.2 requester_credentials（RequesterCredential）

```sql
create table requester_credentials (
  id                   text primary key,             -- key_...
  principal_id         text not null references principals(id),
  requester_name       text not null,
  key_prefix           text not null unique,          -- 表示用の先頭 8 文字
  secret_hash          bytea not null unique,         -- SHA-256(secret)。平文は発行時に 1 回だけ表示
  allowed_task_types   text[] not null default '{PLACE_STATUS_VERIFICATION}',
  max_task_amount      numeric(20,6) not null,        -- 1 件の総額（amount × witnesses）の上限
  daily_spend_limit    numeric(20,6) not null,
  rate_limit_per_min   int not null default 30,
  allowed_bbox         double precision[],            -- 任意。{minLat,minLng,maxLat,maxLng}。null なら PILOT_BBOX
  status               text not null default 'active' check (status in ('active','suspended')),
  created_at           timestamptz not null default now(),
  revoked_at           timestamptz
);
```

API キーは 256 ビットの乱数で、総当たりが現実的でないため遅いハッシュではなく SHA-256 で足りる。

### 3.3 requester_ledger（残高）

前払い残高を追記型の台帳で持つ。残高は合計で求める。

```sql
create table requester_ledger (
  id               bigserial primary key,
  credential_id    text not null references requester_credentials(id),
  verification_id  text references verification_requests(id),
  entry_type       text not null check (entry_type in
                   ('TOPUP','RESERVE','RELEASE','REFUND')),
  amount           numeric(20,6) not null,          -- 増えるとき正、減るとき負
  asset            text not null default 'USDC',
  created_at       timestamptz not null default now(),
  unique (verification_id, entry_type)               -- 1 タスクで同じ種類の記帳は 1 回
);
-- 1 タスクで戻し（RELEASE）と返金（REFUND）はどちらか一方だけ
create unique index one_credit_back_per_task
  on requester_ledger (verification_id) where entry_type in ('RELEASE','REFUND');
```

TOPUP は運営者が `scripts/` から入れる。x402 で払われた依頼では、支払いの確定後にサーバーが入れる（01 §4.19）。

### 3.3a places（依頼できる公開店舗の許可リスト）

```sql
create table places (
  id           text primary key,                    -- plc_...
  name         text not null,                       -- 運営者のメモ。API では返さない
  lat          double precision not null,
  lng          double precision not null,
  category     text not null check (category in ('retail','restaurant','service','public_facility')),
  approved_by  text not null,
  status       text not null default 'active' check (status in ('active','disabled')),
  created_at   timestamptz not null default now()
);
```

依頼の位置から 30 m 以内に active な地点が一つも無ければ、作成を断る（REQ-X-T-104）。照合した地点は `verification_requests.place_id` に記録する。登録は `scripts/register-place.ts` で行い、audit_events に残す。

### 3.4 verification_requests（VerificationRequest）

```sql
create table verification_requests (
  id                      text primary key,          -- ver_...
  credential_id           text not null references requester_credentials(id),
  principal_id            text not null references principals(id),
  type                    text not null check (type = 'PLACE_STATUS_VERIFICATION'),
  question                text not null check (char_length(question) <= 280),
  answer_values           text[] not null,            -- 例 {OPEN,CLOSED,UNCLEAR}
  target_lat              double precision not null,  -- 公開の店舗位置。worker には見せる
  target_lng              double precision not null,
  place_id                text not null references places(id), -- 照合した許可リストの地点（G-14、REQ-X-T-104）
  radius_m                int not null check (radius_m between 25 and 500),
  deadline                timestamptz not null,
  freshness_max_age_s     int not null check (freshness_max_age_s between 60 and 900),
  evidence_photo_required boolean not null default true,
  evidence_nonce_required boolean not null default true,
  required_witnesses      smallint not null check (required_witnesses between 1 and 5),
  quorum                  smallint not null,
  bounty_asset            text not null,
  bounty_amount           numeric(20,6) not null check (bounty_amount > 0),  -- 1 人あたり
  bounty_network          text not null check (bounty_network = 'solana-devnet'),
  status                  text not null,              -- 03 章 2 節
  funding_status          text not null default 'NONE',
  settlement_status       text not null default 'NONE',
  status_reason           text,                       -- FUNDING_FAILED など
  task_id_hash            bytea not null unique,      -- オンチェーンの PDA シード
  idempotency_key_hash    bytea not null,
  request_hash            bytea not null,             -- 正規化した依頼本文の SHA-256
  policy_rule_version     text not null,
  callback_endpoint_id    text references webhook_endpoints(id),
  recheck_of              text unique references verification_requests(id), -- 異議で作った再確認なら元の依頼（01 §4.12）
  min_worker_tier         text check (min_worker_tier in ('standard','trusted')), -- 01 §4.11。null は条件なし
  allow_reuse             boolean not null default false, -- 他の依頼者への再利用を許す（01 §4.9）
  evidence_access_revoked boolean not null default false, -- 運営者が証拠の閲覧を止めた（08 §6）
  featured_at             timestamptz,                -- 運営者がトップに掲載した時刻（05 §4）。null は非掲載
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  check (quorum between 1 and required_witnesses),
  unique (credential_id, idempotency_key_hash)
);
create index on verification_requests (status, deadline);
```

worker の一覧検索は、OPEN / CLAIMED / SUBMITTED で open_slots > 0 の行を、矩形で絞ってから距離で並べる。件数が少ないパイロットなので PostGIS は入れない。

### 3.5 workers（WorkerProfile）と worker_consents

```sql
create table workers (
  id                 text primary key,              -- wkr_...
  privy_user_id      text not null unique,
  payout_pubkey      text not null unique,          -- Privy の埋め込みウォレットのアドレス
  invite_code_id     text not null,
  status             text not null default 'active' check (status in ('active','suspended')),
  coarse_area        text,                          -- 「渋谷区」程度。正確な位置は持たない
  yen_payout_interest_at timestamptz,               -- 円での受け取りを希望した時刻（01 §4.10）。口座情報は持たない
  stats              jsonb not null default '{}',   -- 件数の集計だけ。評判スコアは P2
  created_at         timestamptz not null default now()
);

create table worker_consents (
  worker_id     text not null references workers(id),
  document      text not null check (document in ('worker_terms','safety_rules','privacy_notice')),
  version       text not null,
  accepted_at   timestamptz not null default now(),
  primary key (worker_id, document, version)
);

create table invite_codes (
  id           text primary key,
  code_hash    bytea not null unique,
  max_uses     int not null default 1,
  used_count   int not null default 0,
  expires_at   timestamptz not null
);
```

### 3.6 claims（Claim）

```sql
create table claims (
  id               text primary key,               -- clm_...
  verification_id  text not null references verification_requests(id),
  worker_id        text not null references workers(id),
  state            text not null check (state in ('ACTIVE','ACCEPTED','REJECTED','ABANDONED','EXPIRED')),
  attempts         smallint not null default 0,
  accepted_at      timestamptz not null default now(),
  expires_at       timestamptz not null,
  closed_at        timestamptz,
  close_reason     text,
  unique (verification_id, worker_id)               -- 1 人 1 タスク 1 回
);
create index on claims (verification_id, state);
```

### 3.7 challenges

```sql
create table challenges (
  id          text primary key,                     -- chl_...
  claim_id    text not null references claims(id),
  nonce_hash  bytea not null unique,                -- SHA-256(nonce)。平文は応答で 1 回だけ返す
  state       text not null check (state in ('ISSUED','USED','SUPERSEDED','EXPIRED')),
  issued_at   timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz
);
create unique index one_issued_challenge_per_claim
  on challenges (claim_id) where state = 'ISSUED';
```

### 3.8 uploads

```sql
create table uploads (
  id            text primary key,                   -- upl_...
  claim_id      text not null references claims(id),
  challenge_id  text not null references challenges(id),
  object_key    text not null unique,               -- evidence-raw/{verification_id}/{claim_id}/{upload_id}
  state         text not null check (state in ('PENDING','FINALIZED','DISCARDED')),
  issued_at     timestamptz not null default now()
);
```

### 3.9 witness_submissions（WitnessSubmission）

```sql
create table witness_submissions (
  id                       text primary key,         -- sub_...
  verification_id          text not null references verification_requests(id),
  claim_id                 text not null references claims(id),
  worker_id                text not null references workers(id),
  challenge_id             text not null references challenges(id),
  answer                   text not null,
  state                    text not null check (state in ('CHECKING','VALID','INVALID')),
  first_failed_check       text,
  reason_code              text,
  accepted_for_consensus   boolean not null default false,
  client_timestamp         timestamptz,
  server_received_at       timestamptz not null default now(),
  submission_hash          bytea,                     -- evidence バンドル内の 1 提出分の SHA-256
  idempotency_key_hash     bytea not null,
  unique (claim_id, idempotency_key_hash),
  unique (challenge_id)                               -- nonce 1 つで提出 1 回
);
create unique index one_checking_submission_per_claim
  on witness_submissions (claim_id) where state = 'CHECKING';
create unique index one_valid_submission_per_claim
  on witness_submissions (claim_id) where state = 'VALID';
```

### 3.10 evidence_objects（EvidenceObject）

```sql
create table evidence_objects (
  id                 text primary key,              -- evd_...
  submission_id      text not null references witness_submissions(id),
  upload_id          text not null unique references uploads(id),
  raw_object_key     text,                          -- 保持期限後に null
  derived_object_key text,                          -- EXIF を除いた縮小版
  media_type         text not null,
  byte_size          int not null,
  width              int,
  height             int,
  sha256             bytea not null,                -- 元ファイルの SHA-256
  dhash              bigint,                        -- 64 ビットの差分ハッシュ（P1）
  -- 前段の検査を通った提出は、判定の合否に関係なくすべてここに記録する（replay の比較対象）
  server_received_at timestamptz not null,
  client_capture_at  timestamptz,
  raw_metadata_enc   bytea,                         -- EXIF 等。暗号化して保持期限まで
  retention_class    text not null default 'raw_evidence',
  delete_after       timestamptz not null,
  deleted_at         timestamptz
);
create unique index evidence_sha256_unique on evidence_objects (sha256);  -- 完全一致の replay を全タスク横断で拒否
```

`sha256` の一意制約は、元ファイルを消した後も行を残すことで効き続ける。

### 3.11 location_observations（LocationObservation）

```sql
create table location_observations (
  submission_id        text primary key references witness_submissions(id),
  coords_enc           bytea,                        -- AES-256-GCM(lat,lng)。保持期限後に null
  accuracy_m           real not null,
  distance_to_target_m real not null,
  geofence_pass        boolean not null,
  client_timestamp     timestamptz,
  server_received_at   timestamptz not null,
  risk_flags           text[] not null default '{}',
  delete_after         timestamptz not null
);
```

requester と公開ページに返すのは `geofence_pass` と、丸めた距離（10 m 単位）だけにする。

### 3.12 evidence_checks（EvidenceCheck）

```sql
create table evidence_checks (
  id             bigserial primary key,
  submission_id  text not null references witness_submissions(id),
  check_type     text not null check (check_type in
                 ('claim_binding','task_window','task_nonce','freshness','geofence',
                  'media_schema','replay','duplicate','answer_schema','vision_consistency')),
  status         text not null check (status in ('pass','fail','warning','not_run')),
  reason_code    text,
  machine_details jsonb not null default '{}',
  created_at     timestamptz not null default now(),
  unique (submission_id, check_type)
);
```

### 3.13 verification_results（VerificationResult）

```sql
create table verification_results (
  verification_id       text primary key references verification_requests(id),
  outcome               text not null check (outcome in ('VERIFIED','REJECTED','EXPIRED')),
  outcome_reason        text,                         -- NO_CONSENSUS / INSUFFICIENT_WITNESSES
  final_answer          text,
  valid_witness_count   smallint not null,
  required_witnesses    smallint not null,
  quorum                smallint not null,
  consensus_ratio       numeric(5,4),
  answer_counts         jsonb not null,
  accepted_submission_ids text[] not null,
  evidence_bundle       jsonb not null,               -- 正規化前のバンドル（公開してよい内容だけ）
  evidence_root         bytea not null,
  result_hash           bytea not null,
  finalized_at          timestamptz not null      -- アプリが 1 回だけ決めて、バンドルと同じ値を入れる
);
```

### 3.14 payment_records（PaymentRecord）

```sql
create table payment_records (
  id               text primary key,                 -- pay_...
  verification_id  text not null references verification_requests(id),
  kind             text not null check (kind in ('FUND','FINALIZE_AND_SETTLE','REFUND')),
  asset            text not null,
  amount           numeric(20,6) not null,
  network          text not null,
  status           text not null check (status in ('PENDING','SUBMITTED','CONFIRMED','FAILED')),
  attempt_count    int not null default 0,
  last_signature   text,
  signatures       text[] not null default '{}',     -- 送った全署名（再送を含む）
  recipients       jsonb,                            -- [{worker_id, pubkey, amount}]
  last_error       text,
  created_at       timestamptz not null default now(),
  confirmed_at     timestamptz,
  unique (verification_id, kind)
);
```

```sql
-- 支払いと返金は 1 タスクにどちらか一方だけ
create unique index settle_xor_refund
  on payment_records (verification_id) where kind in ('FINALIZE_AND_SETTLE','REFUND');
```

支払いと返金の排他は、この部分一意インデックスとオンチェーンの状態（06 章 3.1）の二重で守る。オンチェーン側が使えない非常時（10 章 4 節）でも、DB 側だけで排他が成り立つ。

### 3.15 audit_events（AuditEvent）

```sql
create table audit_events (
  id              bigserial primary key,
  verification_id text,
  actor_type      text not null check (actor_type in ('requester','worker','system','operator')),
  actor_ref       text,
  event_type      text not null,
  before_state    text,
  after_state     text,
  correlation_id  text not null,
  metadata        jsonb not null default '{}',       -- 座標・写真・秘密は入れない
  created_at      timestamptz not null default now()
);
create function forbid_audit_mutation() returns trigger language plpgsql as $$
begin raise exception 'audit_events is append-only'; end $$;
create trigger audit_events_append_only before update or delete on audit_events
  for each row execute function forbid_audit_mutation();
```

保持期限による削除は、トリガーを一時的に外す運営者用の手順でだけ行う（08 章）。

### 3.16 idempotency_keys

```sql
create table idempotency_keys (
  scope            text not null,                    -- credential_id または worker_id
  key_hash         bytea not null,
  endpoint         text not null,
  request_hash     bytea not null,
  state            text not null check (state in ('IN_PROGRESS','COMPLETED')),
  response_status  int,
  response_body    jsonb,
  created_at       timestamptz not null default now(),
  primary key (scope, endpoint, key_hash)
);
```

保存期間は 24 時間。

### 3.17 outbox_jobs

```sql
create table outbox_jobs (
  id              bigserial primary key,
  kind            text not null check (kind in
                  ('FUND_TASK','FINALIZE_AND_SETTLE','REFUND_TASK','DELIVER_WEBHOOK','PURGE_EVIDENCE')),
  dedupe_key      text not null unique,               -- 例 FUND_TASK:ver_xxx
  payload         jsonb not null,
  state           text not null check (state in ('PENDING','RUNNING','DONE','DEAD')),
  attempts        int not null default 0,
  run_after       timestamptz not null default now(),
  last_error      text,
  locked_until    timestamptz,                        -- リースの期限（02 章 4.1）
  locked_by       text,
  updated_at      timestamptz not null default now()
);
create index on outbox_jobs (state, run_after);
```

再試行は指数バックオフ（10 秒から始めて最大 10 分）。50 回失敗したら DEAD にして運営者に知らせる。原因を直したら運営者 API で PENDING に戻せる。チェーンのジョブにオンチェーンの期限は無いので、時間がたっても支払いの道は閉じない（D-11）。

### 3.18 webhook_endpoints と webhook_deliveries

```sql
create table webhook_endpoints (
  id              text primary key,                  -- whk_...
  credential_id   text not null references requester_credentials(id),
  url             text not null,                     -- https のみ。事前登録制
  secret_enc      bytea not null,
  events          text[] not null,
  status          text not null default 'active'
);

create table webhook_deliveries (
  id              text primary key,                  -- evt_...（受信側の重複排除に使う）
  endpoint_id     text not null references webhook_endpoints(id),
  verification_id text not null,
  event_type      text not null,
  payload         jsonb not null,
  attempts        int not null default 0,
  last_status     int,
  delivered_at    timestamptz,
  unique (endpoint_id, verification_id, event_type)
);
```

### 3.19 platform_flags と rate_limit_counters

```sql
create table platform_flags (
  key        text primary key check (key in
             ('tasks_create_enabled','claims_enabled','settlement_enabled','public_evidence_enabled')),
  value      boolean not null,
  updated_by text not null,
  updated_at timestamptz not null default now()
);

create table rate_limit_counters (
  scope         text not null,
  window_start  timestamptz not null,
  count         int not null,
  primary key (scope, window_start)
);
```

レート制限は 1 分の固定窓で、`insert ... on conflict do update set count = count + 1 returning count` の 1 文で数える。

### 3.20 participation_requests（参加の申し込み、2026-10-04 追加）

サイトの `/join` から届く、worker としての参加と API キーの申し込み。運営者が読んで招待コードや API キーを出す。

```sql
create table participation_requests (
  id           text primary key,                 -- par_<ULID>
  role         text not null check (role in ('worker','requester')),
  contact_enc  bytea not null,                   -- AES-256-GCM(メールアドレス)。鍵は LOCATION_ENC_KEY
  area         text check (area in ('shibuya','shinjuku','other')),  -- worker のみ。正確な位置は取らない
  note         text check (char_length(note) <= 500),
  consent_version text not null,                 -- 同意した説明文の版
  status       text not null default 'new' check (status in ('new','contacted','closed')),
  created_at   timestamptz not null default now(),
  delete_after timestamptz not null              -- created_at + 90 日
);
```

### 3.21 removal_requests（写真の削除依頼、2026-10-04 追加）

サイトの `/rules` から届く、店舗や写り込んだ人からの削除・公開停止の依頼。運営者が読み、`revoke-access` などで対応する（08 §6）。

```sql
create table removal_requests (
  id              text primary key,              -- rmv_<ULID>
  contact_enc     bytea not null,                -- AES-256-GCM(メールアドレス)。鍵は LOCATION_ENC_KEY
  verification_id text,                          -- 分かれば。外部キーにはしない（誤った ID でも受け付ける）
  place_note      text check (char_length(place_note) <= 200),
  reason          text not null check (char_length(reason) between 1 and 1000),
  status          text not null default 'new' check (status in ('new','handled','rejected')),
  created_at      timestamptz not null default now(),
  delete_after    timestamptz not null           -- created_at + 365 日（対応の記録として残す）
);
```

### 3.22 push_subscriptions（プッシュ通知の宛先、2026-10-04 追加）

worker が選んだ地域で新しい依頼が OPEN になったら、Web Push で知らせる。位置は使わず、地域は `PILOT_AREAS`（渋谷・新宿の中心から 2 km、それ以外は other）で依頼の場所から決める。

```sql
create table push_subscriptions (
  id            text primary key,                -- psb_<ULID>
  worker_id     text not null references workers(id),
  endpoint_hash bytea not null unique,           -- SHA-256(endpoint)。同じ端末の登録し直しを上書きする
  endpoint_enc  bytea not null,                  -- AES-256-GCM({endpoint, keys})。鍵は LOCATION_ENC_KEY
  areas         text[] not null,                 -- shibuya / shinjuku / other の部分集合。空なら場所を問わない依頼だけ（01 §4.20）
  failures      int not null default 0,
  created_at    timestamptz not null default now(),
  last_sent_at  timestamptz
);
```

送信は `NOTIFY_WORKERS` ジョブで 1 回だけ行い、再試行しない（通知は届かなくても依頼一覧で見られる）。宛先が 404・410 を返したら行を消す。

### 3.23 verification_schedules（定期確認、2026-10-04 追加）

「平日の朝 9 時に、この店が開いているか」のように、同じ依頼を決まった時刻に繰り返し出す。毎分の tick が期限の来た予定を拾い、通常の作成（05 §2.1）をそのまま通すので、残高・上限・ポリシー検査・資金拘束はふつうの依頼と同じに働く。冪等キーは `schedule:<id>:<予定時刻>` で、tick が重なっても 1 回に 1 件しかできない。

```sql
create table verification_schedules (
  id                   text primary key,          -- sch_<ULID>
  credential_id        text not null references requester_credentials(id),
  template             jsonb not null,            -- 05 §2.1 の本文から deadline を除いたもの（assurance は人数に直したもの）
  deadline_minutes     int not null check (deadline_minutes between 10 and 1440),
  times_jst            text[] not null,           -- "HH:MM"（日本時間）。1〜24 個
  days_jst             smallint[] not null,       -- 0=日〜6=土。1〜7 個
  ends_at              timestamptz,
  active               boolean not null default true,
  next_run_at          timestamptz not null,
  last_run_at          timestamptz,
  last_verification_id text,
  last_error           text,                      -- 直近の失敗のエラーコード
  consecutive_failures int not null default 0,    -- 3 回続けて失敗したら active=false
  created_at           timestamptz not null default now(),
  -- 見守り依頼（01 §4.23、2026-10-05 追加）
  every_minutes        int,                       -- 間隔で回すとき。15〜1440。times_jst/days_jst は空配列
  max_runs             int,                       -- 回数の上限
  runs                 int not null default 0,    -- 作った依頼の数
  stop_when            jsonb,                     -- 止める条件。answer / answer_in / number
  stopped_reason       text,                      -- condition_met / max_runs / ended / failures / suspended / stopped
  matched_verification_id text                    -- 条件に合った依頼
);
create index on verification_schedules (active, next_run_at);
```

API キー 1 つあたり、動いている予定は 10 件まで。キーが止められたら予定も止める。

### 3.24 place_owner_tokens と place_status_reports（店舗からの申告、2026-10-04 追加）

```sql
create table place_owner_tokens (
  id          text primary key,                  -- pot_<ULID>
  place_id    text not null references places(id),
  token_hash  bytea not null unique,             -- SHA-256(token)。token そのものは発行時に一度だけ表示
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz
);

create table place_status_reports (
  id          text primary key,                  -- psr_<ULID>
  place_id    text not null references places(id),
  token_id    text not null references place_owner_tokens(id),
  status      text not null check (status in ('CLOSED_TODAY','OPEN_AS_USUAL')),
  valid_until timestamptz not null,
  note        text check (char_length(note) <= 200), -- 運営者だけが見る
  created_at  timestamptz not null default now()
);
create index on place_status_reports (place_id, created_at);
```

### 3.25 console_sessions（requester 用画面のセッション、2026-10-04 追加）

```sql
create table console_sessions (
  id            text primary key,                -- cse_<ULID>
  credential_id text not null references requester_credentials(id),
  token_hash    bytea not null unique,           -- SHA-256(Cookie の値)
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null             -- created_at + 12 時間
);
```

### 3.26 x402_wallets と x402_payments（x402 の支払い、2026-10-04 追加）

01 §4.19。移行は 0019。どちらも RLS を有効にする。

`x402_wallets`: 支払い元のウォレットと principal の対応。

| 列 | 型 | 説明 |
|---|---|---|
| pubkey | text PK | 支払い元（TransferChecked の権限者）の公開鍵 |
| principal_id | text FK → principals | 初回の支払いで作る |
| created_at | timestamptz | |

`x402_payments`: 支払いの取引 1 件につき 1 行。二重の決済を防ぐ。

| 列 | 型 | 説明 |
|---|---|---|
| signature | text PK | 取引 ID（手数料の支払者の署名） |
| payer | text | 支払い元の公開鍵 |
| amount | numeric(20,6) | 受け取った額（USDC） |
| state | text | `PENDING`（送信中）・`CONFIRMED`・`FAILED` |
| request_hash | bytea | 本文のハッシュ。同じ支払いで別の依頼を作らせない |
| credential_id | text FK NULL | この支払いで発行したキー |
| verification_id | text FK NULL | この支払いで作った依頼 |
| error | text NULL | 送信に失敗した理由 |
| created_at / updated_at | timestamptz | `PENDING` のまま 120 秒たてば送り直してよい |

## 4. 保持期間と削除

| 保持区分 | 対象 | 期間 | 削除のしかた |
|---|---|---|---|
| raw_evidence | 元写真、派生画像、EXIF | 30 日 | Storage のオブジェクトを消し、キーと `raw_metadata_enc` を null に。`sha256`・`dhash` は残す |
| precise_location | `location_observations.coords_enc` | 30 日 | null にする。`geofence_pass`・距離・精度は残す |
| task_metadata | 依頼・結果・判定 | 1 年 | 行を消す（本番の期間は法務確認後） |
| payment | payment_records、requester_ledger | 1 年 | 同上 |
| audit | audit_events | 1 年 | 同上 |
| participation | participation_requests | 90 日 | 行を消す |
| removal | removal_requests | 1 年 | 行を消す |

削除は outbox の `PURGE_EVIDENCE` ジョブが 1 日 1 回行い、件数を audit_events に残す。

## 5. マイグレーションと seed

- `pnpm db:migrate` で drizzle-kit のマイグレーションを当てる。本番相当（demo）にはマイグレーションのファイルだけで当て、手で SQL を流さない（`acceptance-criteria.md` A7「hidden manual DB edits に頼らない」）
- `pnpm db:seed` は local と preview だけで動く。テスト用 principal・API キー・招待コード・platform_flags の初期値を入れる
- demo 環境の principal・API キー・招待コードは `scripts/issue-api-key.ts` と `scripts/issue-invite.ts` で発行し、発行は audit_events に残す
