# 04. Database Design

> English translation. The Japanese version in [`../ja/04-database-design.md`](../ja/04-database-design.md) is authoritative; if they differ, the Japanese version wins.

Created: 2026-10-02

## 1. Policy

- Use a single PostgreSQL instance (Supabase). The Drizzle definitions in `packages/db` are the source of truth for the schema; the SQL written here shows their intent
- Idempotency, replay prevention, and double-payment prevention are protected by unique constraints before application code. Even if an application check is missed, the DB rejects the write
- IDs are random strings with a prefix (`ver_`, `clm_`, etc. + a 26-character ULID). They cannot be guessed and sort in time order
- All timestamps are `timestamptz`, and decisions use the DB's `now()`
- Make the data unreadable from Supabase's PostgREST. Enable RLS on every table and create no policies; the server operates through a direct connection
- Each table heading states its correspondence to the logical entities in `offchain-data-model.md`

## 2. ER Overview

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

## 3. Table Definitions

### 3.1 principals (Principal)

```sql
create table principals (
  id                  text primary key,              -- prn_...
  type                text not null check (type in ('person','organization')),
  display_name        text not null,
  verification_status text not null default 'unverified'
                      check (verification_status in ('unverified','verified')),
  jurisdiction        text not null default 'JP',
  status              text not null default 'active' check (status in ('active','suspended')),
  contact_encrypted   bytea,                          -- contact details are encrypted and stored separately
  created_at          timestamptz not null default now()
);
```

### 3.2 requester_credentials (RequesterCredential)

```sql
create table requester_credentials (
  id                   text primary key,             -- key_...
  principal_id         text not null references principals(id),
  requester_name       text not null,
  key_prefix           text not null unique,          -- first 8 characters, for display
  secret_hash          bytea not null unique,         -- SHA-256(secret). The plaintext is shown only once, at issuance
  allowed_task_types   text[] not null default '{PLACE_STATUS_VERIFICATION}',
  max_task_amount      numeric(20,6) not null,        -- upper limit on the total for one task (amount × witnesses)
  daily_spend_limit    numeric(20,6) not null,
  rate_limit_per_min   int not null default 30,
  allowed_bbox         double precision[],            -- optional. {minLat,minLng,maxLat,maxLng}. If null, PILOT_BBOX
  status               text not null default 'active' check (status in ('active','suspended')),
  created_at           timestamptz not null default now(),
  revoked_at           timestamptz
);
```

An API key is a 256-bit random number and brute force is not realistic, so SHA-256 is sufficient; a slow hash is not needed.

### 3.3 requester_ledger (balance)

The prepaid balance is kept in an append-only ledger. The balance is computed as the sum.

```sql
create table requester_ledger (
  id               bigserial primary key,
  credential_id    text not null references requester_credentials(id),
  verification_id  text references verification_requests(id),
  entry_type       text not null check (entry_type in
                   ('TOPUP','RESERVE','RELEASE','REFUND')),
  amount           numeric(20,6) not null,          -- positive when the balance increases, negative when it decreases
  asset            text not null default 'USDC',
  created_at       timestamptz not null default now(),
  unique (verification_id, entry_type)               -- one entry of each type per task
);
-- For one task, only one of release (RELEASE) and refund (REFUND)
create unique index one_credit_back_per_task
  on requester_ledger (verification_id) where entry_type in ('RELEASE','REFUND');
```

The operator adds TOPUP from `scripts/` (replaced by deposits via x402 V2 in Stretch).

### 3.3a places (allowlist of public places that can be requested)

```sql
create table places (
  id           text primary key,                    -- plc_...
  name         text not null,                       -- operator's note. Not returned by the API
  lat          double precision not null,
  lng          double precision not null,
  category     text not null check (category in ('retail','restaurant','service','public_facility')),
  approved_by  text not null,
  status       text not null default 'active' check (status in ('active','disabled')),
  created_at   timestamptz not null default now()
);
```

If there is no active place within 30 m of the requested location, the creation is rejected (REQ-X-T-104). The matched place is recorded in `verification_requests.place_id`. Registration is done with `scripts/register-place.ts` and recorded in audit_events.

### 3.4 verification_requests (VerificationRequest)

```sql
create table verification_requests (
  id                      text primary key,          -- ver_...
  credential_id           text not null references requester_credentials(id),
  principal_id            text not null references principals(id),
  type                    text not null check (type = 'PLACE_STATUS_VERIFICATION'),
  question                text not null check (char_length(question) <= 280),
  answer_values           text[] not null,            -- e.g. {OPEN,CLOSED,UNCLEAR}
  target_lat              double precision not null,  -- public location of the place. Shown to workers
  target_lng              double precision not null,
  place_id                text not null references places(id), -- allowlisted place that matched (G-14, REQ-X-T-104)
  radius_m                int not null check (radius_m between 25 and 500),
  deadline                timestamptz not null,
  freshness_max_age_s     int not null check (freshness_max_age_s between 60 and 900),
  evidence_photo_required boolean not null default true,
  evidence_nonce_required boolean not null default true,
  required_witnesses      smallint not null check (required_witnesses between 1 and 5),
  quorum                  smallint not null,
  bounty_asset            text not null,
  bounty_amount           numeric(20,6) not null check (bounty_amount > 0),  -- per worker
  bounty_network          text not null check (bounty_network = 'solana-devnet'),
  status                  text not null,              -- Chapter 03, Section 2
  funding_status          text not null default 'NONE',
  settlement_status       text not null default 'NONE',
  status_reason           text,                       -- FUNDING_FAILED, etc.
  task_id_hash            bytea not null unique,      -- on-chain PDA seed
  idempotency_key_hash    bytea not null,
  request_hash            bytea not null,             -- SHA-256 of the normalized request body
  policy_rule_version     text not null,
  callback_endpoint_id    text references webhook_endpoints(id),
  recheck_of              text unique references verification_requests(id), -- original task when this is a dispute recheck (01 §4.12)
  min_worker_tier         text check (min_worker_tier in ('standard','trusted')), -- 01 §4.11; null = no requirement
  allow_reuse             boolean not null default false, -- other requesters may reuse the result (01 §4.9)
  evidence_access_revoked boolean not null default false, -- operator stopped evidence access (08 §6)
  featured_at             timestamptz,                -- when the operator featured it on the top page (05 §4); null = not listed
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  check (quorum between 1 and required_witnesses),
  unique (credential_id, idempotency_key_hash)
);
create index on verification_requests (status, deadline);
```

The worker's list search takes rows that are OPEN / CLAIMED / SUBMITTED with open_slots > 0, narrows them by bounding box, and then sorts by distance. The pilot has few rows, so PostGIS is not introduced.

### 3.5 workers (WorkerProfile) and worker_consents

```sql
create table workers (
  id                 text primary key,              -- wkr_...
  privy_user_id      text not null unique,
  payout_pubkey      text not null unique,          -- address of the Privy embedded wallet
  invite_code_id     text not null,
  status             text not null default 'active' check (status in ('active','suspended')),
  coarse_area        text,                          -- about "Shibuya ward" level. No exact location is stored
  yen_payout_interest_at timestamptz,               -- when the worker asked for yen payouts (01 §4.10); no bank data is kept
  stats              jsonb not null default '{}',   -- count aggregates only. Reputation score is P2
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

### 3.6 claims (Claim)

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
  unique (verification_id, worker_id)               -- one worker, one task, one time
);
create index on claims (verification_id, state);
```

### 3.7 challenges

```sql
create table challenges (
  id          text primary key,                     -- chl_...
  claim_id    text not null references claims(id),
  nonce_hash  bytea not null unique,                -- SHA-256(nonce). The plaintext is returned only once, in the response
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

### 3.9 witness_submissions (WitnessSubmission)

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
  submission_hash          bytea,                     -- SHA-256 of one submission within the evidence bundle
  idempotency_key_hash     bytea not null,
  unique (claim_id, idempotency_key_hash),
  unique (challenge_id)                               -- one submission per nonce
);
create unique index one_checking_submission_per_claim
  on witness_submissions (claim_id) where state = 'CHECKING';
create unique index one_valid_submission_per_claim
  on witness_submissions (claim_id) where state = 'VALID';
```

### 3.10 evidence_objects (EvidenceObject)

```sql
create table evidence_objects (
  id                 text primary key,              -- evd_...
  submission_id      text not null references witness_submissions(id),
  upload_id          text not null unique references uploads(id),
  raw_object_key     text,                          -- null after the retention period
  derived_object_key text,                          -- reduced-size version with EXIF removed
  media_type         text not null,
  byte_size          int not null,
  width              int,
  height             int,
  sha256             bytea not null,                -- SHA-256 of the original file
  dhash              bigint,                        -- 64-bit difference hash (P1)
  -- Every submission that passes the preliminary checks is recorded here, regardless of whether the decision passes or fails (the comparison target for replay)
  server_received_at timestamptz not null,
  client_capture_at  timestamptz,
  raw_metadata_enc   bytea,                         -- EXIF, etc. Encrypted and kept until the retention period ends
  retention_class    text not null default 'raw_evidence',
  delete_after       timestamptz not null,
  deleted_at         timestamptz
);
create unique index evidence_sha256_unique on evidence_objects (sha256);  -- rejects exact-match replay across all tasks
```

The unique constraint on `sha256` keeps working even after the original file is deleted, because the row remains.

### 3.11 location_observations (LocationObservation)

```sql
create table location_observations (
  submission_id        text primary key references witness_submissions(id),
  coords_enc           bytea,                        -- AES-256-GCM(lat,lng). null after the retention period
  accuracy_m           real not null,
  distance_to_target_m real not null,
  geofence_pass        boolean not null,
  client_timestamp     timestamptz,
  server_received_at   timestamptz not null,
  risk_flags           text[] not null default '{}',
  delete_after         timestamptz not null
);
```

Only `geofence_pass` and the rounded distance (in 10 m units) are returned to the requester and the public page.

### 3.12 evidence_checks (EvidenceCheck)

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

### 3.13 verification_results (VerificationResult)

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
  evidence_bundle       jsonb not null,               -- the bundle before normalization (only content that may be made public)
  evidence_root         bytea not null,
  result_hash           bytea not null,
  finalized_at          timestamptz not null      -- decided once by the app; the same value goes into the bundle
);
```

### 3.14 payment_records (PaymentRecord)

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
  signatures       text[] not null default '{}',     -- all signatures sent (including resends)
  recipients       jsonb,                            -- [{worker_id, pubkey, amount}]
  last_error       text,
  created_at       timestamptz not null default now(),
  confirmed_at     timestamptz,
  unique (verification_id, kind)
);
```

```sql
-- For one task, only one of payment and refund
create unique index settle_xor_refund
  on payment_records (verification_id) where kind in ('FINALIZE_AND_SETTLE','REFUND');
```

The mutual exclusion of payment and refund is protected twice: by this partial unique index and by the on-chain state (Chapter 06, Section 3.1). Even in an emergency when the on-chain side is unavailable (Chapter 10, Section 4), the exclusion holds on the DB side alone.

### 3.15 audit_events (AuditEvent)

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
  metadata        jsonb not null default '{}',       -- no coordinates, photos, or secrets
  created_at      timestamptz not null default now()
);
create function forbid_audit_mutation() returns trigger language plpgsql as $$
begin raise exception 'audit_events is append-only'; end $$;
create trigger audit_events_append_only before update or delete on audit_events
  for each row execute function forbid_audit_mutation();
```

Deletion at the end of the retention period is done only through an operator procedure that temporarily disables the trigger (Chapter 08).

### 3.16 idempotency_keys

```sql
create table idempotency_keys (
  scope            text not null,                    -- credential_id or worker_id
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

The retention period is 24 hours.

### 3.17 outbox_jobs

```sql
create table outbox_jobs (
  id              bigserial primary key,
  kind            text not null check (kind in
                  ('FUND_TASK','FINALIZE_AND_SETTLE','REFUND_TASK','DELIVER_WEBHOOK','PURGE_EVIDENCE')),
  dedupe_key      text not null unique,               -- e.g. FUND_TASK:ver_xxx
  payload         jsonb not null,
  state           text not null check (state in ('PENDING','RUNNING','DONE','DEAD')),
  attempts        int not null default 0,
  run_after       timestamptz not null default now(),
  last_error      text,
  locked_until    timestamptz,                        -- lease expiry (Chapter 02, Section 4.1)
  locked_by       text,
  updated_at      timestamptz not null default now()
);
create index on outbox_jobs (state, run_after);
```

Retries use exponential backoff (starting at 10 seconds, up to 10 minutes). After 50 failures the job becomes DEAD and the operator is notified. Once the cause is fixed, the operator API can return it to PENDING. Chain jobs have no on-chain deadline, so the path to payment does not close as time passes (D-11).

### 3.18 webhook_endpoints and webhook_deliveries

```sql
create table webhook_endpoints (
  id              text primary key,                  -- whk_...
  credential_id   text not null references requester_credentials(id),
  url             text not null,                     -- https only. Pre-registration required
  secret_enc      bytea not null,
  events          text[] not null,
  status          text not null default 'active'
);

create table webhook_deliveries (
  id              text primary key,                  -- evt_... (used by the receiver for deduplication)
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

### 3.19 platform_flags and rate_limit_counters

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

Rate limiting uses a fixed 1-minute window and counts with a single statement: `insert ... on conflict do update set count = count + 1 returning count`.

### 3.20 participation_requests (sign-ups, added 2026-10-04)

Requests to join as a worker or to get an API key, sent from the site's `/join`. The operator reads them and issues invite codes or API keys.

```sql
create table participation_requests (
  id           text primary key,                 -- par_<ULID>
  role         text not null check (role in ('worker','requester')),
  contact_enc  bytea not null,                   -- AES-256-GCM(email address), key LOCATION_ENC_KEY
  area         text check (area in ('shibuya','shinjuku','other')),  -- workers only; no precise location
  note         text check (char_length(note) <= 500),
  consent_version text not null,                 -- version of the notice the person agreed to
  status       text not null default 'new' check (status in ('new','contacted','closed')),
  created_at   timestamptz not null default now(),
  delete_after timestamptz not null              -- created_at + 90 days
);
```

### 3.21 removal_requests (photo removal requests, added 2026-10-04)

Requests from shops or people in a photo to remove or stop showing evidence, sent from the site's `/rules`. The operator reads them and acts, e.g. with `revoke-access` (08 §6).

```sql
create table removal_requests (
  id              text primary key,              -- rmv_<ULID>
  contact_enc     bytea not null,                -- AES-256-GCM(email address), key LOCATION_ENC_KEY
  verification_id text,                          -- if known; not a foreign key (a wrong ID is still accepted)
  place_note      text check (char_length(place_note) <= 200),
  reason          text not null check (char_length(reason) between 1 and 1000),
  status          text not null default 'new' check (status in ('new','handled','rejected')),
  created_at      timestamptz not null default now(),
  delete_after    timestamptz not null           -- created_at + 365 days (kept as a record of handling)
);
```

### 3.22 push_subscriptions (push notification endpoints, added 2026-10-04)

When a new task opens in an area a worker chose, notify them with Web Push. No location is used; the area is derived from the task's location with `PILOT_AREAS` (within 2 km of the Shibuya or Shinjuku centre, otherwise other).

```sql
create table push_subscriptions (
  id            text primary key,                -- psb_<ULID>
  worker_id     text not null references workers(id),
  endpoint_hash bytea not null unique,           -- SHA-256(endpoint); re-registering a device overwrites
  endpoint_enc  bytea not null,                  -- AES-256-GCM({endpoint, keys}), key LOCATION_ENC_KEY
  areas         text[] not null,                 -- subset of shibuya / shinjuku / other
  failures      int not null default 0,
  created_at    timestamptz not null default now(),
  last_sent_at  timestamptz
);
```

Sending happens once in the `NOTIFY_WORKERS` job with no retries (a missed notification is still visible in the task list). An endpoint answering 404 or 410 is deleted.

### 3.23 verification_schedules (recurring checks, added 2026-10-04)

Creates the same request at fixed times, e.g. "is this shop open at 9:00 on weekdays". The per-minute tick picks up due schedules and runs the normal create path (05 §2.1), so balance, limits, policy checks and funding work exactly as for any request. The idempotency key is `schedule:<id>:<scheduled time>`, so overlapping ticks still make one task per run.

```sql
create table verification_schedules (
  id                   text primary key,          -- sch_<ULID>
  credential_id        text not null references requester_credentials(id),
  template             jsonb not null,            -- 05 §2.1 body without deadline (assurance normalized to counts)
  deadline_minutes     int not null check (deadline_minutes between 10 and 1440),
  times_jst            text[] not null,           -- "HH:MM" Japan time, 1 to 24 entries
  days_jst             smallint[] not null,       -- 0=Sun ... 6=Sat, 1 to 7 entries
  ends_at              timestamptz,
  active               boolean not null default true,
  next_run_at          timestamptz not null,
  last_run_at          timestamptz,
  last_verification_id text,
  last_error           text,                      -- error code of the latest failure
  consecutive_failures int not null default 0,    -- 3 failures in a row set active=false
  created_at           timestamptz not null default now()
);
create index on verification_schedules (active, next_run_at);
```

At most 10 active schedules per API key. Suspending the key stops its schedules.

### 3.24 place_owner_tokens and place_status_reports (reports from shops, added 2026-10-04)

```sql
create table place_owner_tokens (
  id          text primary key,                  -- pot_<ULID>
  place_id    text not null references places(id),
  token_hash  bytea not null unique,             -- SHA-256(token); the token is shown once when issued
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz
);

create table place_status_reports (
  id          text primary key,                  -- psr_<ULID>
  place_id    text not null references places(id),
  token_id    text not null references place_owner_tokens(id),
  status      text not null check (status in ('CLOSED_TODAY','OPEN_AS_USUAL')),
  valid_until timestamptz not null,
  note        text check (char_length(note) <= 200), -- operator only
  created_at  timestamptz not null default now()
);
create index on place_status_reports (place_id, created_at);
```

## 4. Retention and Deletion

| Retention class | Target | Period | How it is deleted |
|---|---|---|---|
| raw_evidence | original photo, derived image, EXIF | 30 days | Delete the Storage object and set the key and `raw_metadata_enc` to null. `sha256` and `dhash` are kept |
| precise_location | `location_observations.coords_enc` | 30 days | Set to null. `geofence_pass`, distance, and accuracy are kept |
| task_metadata | requests, results, decisions | 1 year | Delete the rows (the production period is subject to legal review) |
| payment | payment_records, requester_ledger | 1 year | Same as above |
| audit | audit_events | 1 year | Same as above |
| participation | participation_requests | 90 days | Delete the rows |
| removal | removal_requests | 1 year | Delete the rows |

Deletion is performed once a day by the outbox `PURGE_EVIDENCE` job, and the counts are recorded in audit_events.

## 5. Migrations and Seed

- Apply drizzle-kit migrations with `pnpm db:migrate`. Apply them to the production-equivalent environment (demo) using only the migration files, and do not run SQL by hand (`acceptance-criteria.md` A7, "do not rely on hidden manual DB edits")
- `pnpm db:seed` runs only on local and preview. It inserts a test principal, API key, invite code, and the initial values of platform_flags
- The demo environment's principal, API key, and invite code are issued with `scripts/issue-api-key.ts` and `scripts/issue-invite.ts`, and the issuance is recorded in audit_events
