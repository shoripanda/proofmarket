CREATE TABLE "audit_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"verification_id" text,
	"actor_type" text NOT NULL,
	"actor_ref" text,
	"event_type" text NOT NULL,
	"before_state" text,
	"after_state" text,
	"correlation_id" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_actor_chk" CHECK (actor_type in ('requester','worker','system','operator'))
);
--> statement-breakpoint
CREATE TABLE "challenges" (
	"id" text PRIMARY KEY NOT NULL,
	"claim_id" text NOT NULL,
	"nonce_hash" "bytea" NOT NULL,
	"state" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	CONSTRAINT "challenges_nonce_hash_unique" UNIQUE("nonce_hash"),
	CONSTRAINT "challenges_state_chk" CHECK (state in ('ISSUED','USED','SUPERSEDED','EXPIRED'))
);
--> statement-breakpoint
CREATE TABLE "claims" (
	"id" text PRIMARY KEY NOT NULL,
	"verification_id" text NOT NULL,
	"worker_id" text NOT NULL,
	"state" text NOT NULL,
	"attempts" smallint DEFAULT 0 NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	"close_reason" text,
	CONSTRAINT "claims_one_per_worker_uq" UNIQUE("verification_id","worker_id"),
	CONSTRAINT "claims_state_chk" CHECK (state in ('ACTIVE','ACCEPTED','REJECTED','ABANDONED','EXPIRED'))
);
--> statement-breakpoint
CREATE TABLE "evidence_checks" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"submission_id" text NOT NULL,
	"check_type" text NOT NULL,
	"status" text NOT NULL,
	"reason_code" text,
	"machine_details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ec_one_per_type_uq" UNIQUE("submission_id","check_type"),
	CONSTRAINT "ec_status_chk" CHECK (status in ('pass','fail','warning','not_run'))
);
--> statement-breakpoint
CREATE TABLE "evidence_objects" (
	"id" text PRIMARY KEY NOT NULL,
	"submission_id" text NOT NULL,
	"upload_id" text NOT NULL,
	"raw_object_key" text,
	"derived_object_key" text,
	"media_type" text NOT NULL,
	"byte_size" integer NOT NULL,
	"width" integer,
	"height" integer,
	"sha256" "bytea" NOT NULL,
	"dhash" bigint,
	"server_received_at" timestamp with time zone NOT NULL,
	"client_capture_at" timestamp with time zone,
	"raw_metadata_enc" "bytea",
	"retention_class" text DEFAULT 'raw_evidence' NOT NULL,
	"delete_after" timestamp with time zone NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "evidence_objects_upload_id_unique" UNIQUE("upload_id")
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"scope" text NOT NULL,
	"key_hash" "bytea" NOT NULL,
	"endpoint" text NOT NULL,
	"request_hash" "bytea" NOT NULL,
	"state" text NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_keys_scope_endpoint_key_hash_pk" PRIMARY KEY("scope","endpoint","key_hash"),
	CONSTRAINT "idem_state_chk" CHECK (state in ('IN_PROGRESS','COMPLETED'))
);
--> statement-breakpoint
CREATE TABLE "invite_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"code_hash" "bytea" NOT NULL,
	"max_uses" integer DEFAULT 1 NOT NULL,
	"used_count" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	CONSTRAINT "invite_codes_code_hash_unique" UNIQUE("code_hash")
);
--> statement-breakpoint
CREATE TABLE "location_observations" (
	"submission_id" text PRIMARY KEY NOT NULL,
	"coords_enc" "bytea",
	"accuracy_m" real NOT NULL,
	"distance_to_target_m" real NOT NULL,
	"geofence_pass" boolean NOT NULL,
	"client_timestamp" timestamp with time zone,
	"server_received_at" timestamp with time zone NOT NULL,
	"risk_flags" text[] DEFAULT '{}' NOT NULL,
	"delete_after" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbox_jobs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"state" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"run_after" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"locked_until" timestamp with time zone,
	"locked_by" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "outbox_jobs_dedupe_key_unique" UNIQUE("dedupe_key"),
	CONSTRAINT "outbox_kind_chk" CHECK (kind in ('FUND_TASK','FINALIZE_AND_SETTLE','REFUND_TASK','DELIVER_WEBHOOK','PURGE_EVIDENCE')),
	CONSTRAINT "outbox_state_chk" CHECK (state in ('PENDING','RUNNING','DONE','DEAD'))
);
--> statement-breakpoint
CREATE TABLE "payment_records" (
	"id" text PRIMARY KEY NOT NULL,
	"verification_id" text NOT NULL,
	"kind" text NOT NULL,
	"asset" text NOT NULL,
	"amount" numeric(20, 6) NOT NULL,
	"network" text NOT NULL,
	"status" text NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"last_signature" text,
	"signatures" text[] DEFAULT '{}' NOT NULL,
	"recipients" jsonb,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	CONSTRAINT "pr_task_kind_uq" UNIQUE("verification_id","kind"),
	CONSTRAINT "pr_kind_chk" CHECK (kind in ('FUND','FINALIZE_AND_SETTLE','REFUND')),
	CONSTRAINT "pr_status_chk" CHECK (status in ('PENDING','SUBMITTED','CONFIRMED','FAILED'))
);
--> statement-breakpoint
CREATE TABLE "places" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"lat" double precision NOT NULL,
	"lng" double precision NOT NULL,
	"category" text NOT NULL,
	"approved_by" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "places_category_chk" CHECK (category in ('retail','restaurant','service','public_facility')),
	CONSTRAINT "places_status_chk" CHECK (status in ('active','disabled'))
);
--> statement-breakpoint
CREATE TABLE "platform_flags" (
	"key" text PRIMARY KEY NOT NULL,
	"value" boolean NOT NULL,
	"updated_by" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_flags_key_chk" CHECK (key in ('tasks_create_enabled','claims_enabled','settlement_enabled','public_evidence_enabled'))
);
--> statement-breakpoint
CREATE TABLE "principals" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"display_name" text NOT NULL,
	"verification_status" text DEFAULT 'unverified' NOT NULL,
	"jurisdiction" text DEFAULT 'JP' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"contact_encrypted" "bytea",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "principals_type_chk" CHECK (type in ('person','organization')),
	CONSTRAINT "principals_verification_chk" CHECK (verification_status in ('unverified','verified')),
	CONSTRAINT "principals_status_chk" CHECK (status in ('active','suspended'))
);
--> statement-breakpoint
CREATE TABLE "rate_limit_counters" (
	"scope" text NOT NULL,
	"window_start" timestamp with time zone NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "rate_limit_counters_scope_window_start_pk" PRIMARY KEY("scope","window_start")
);
--> statement-breakpoint
CREATE TABLE "requester_credentials" (
	"id" text PRIMARY KEY NOT NULL,
	"principal_id" text NOT NULL,
	"requester_name" text NOT NULL,
	"key_prefix" text NOT NULL,
	"secret_hash" "bytea" NOT NULL,
	"allowed_task_types" text[] DEFAULT '{PLACE_STATUS_VERIFICATION}' NOT NULL,
	"max_task_amount" numeric(20, 6) NOT NULL,
	"daily_spend_limit" numeric(20, 6) NOT NULL,
	"rate_limit_per_min" integer DEFAULT 30 NOT NULL,
	"allowed_bbox" double precision[],
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "requester_credentials_key_prefix_unique" UNIQUE("key_prefix"),
	CONSTRAINT "requester_credentials_secret_hash_unique" UNIQUE("secret_hash"),
	CONSTRAINT "requester_credentials_status_chk" CHECK (status in ('active','suspended'))
);
--> statement-breakpoint
CREATE TABLE "requester_ledger" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"credential_id" text NOT NULL,
	"verification_id" text,
	"entry_type" text NOT NULL,
	"amount" numeric(20, 6) NOT NULL,
	"asset" text DEFAULT 'USDC' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "requester_ledger_task_entry_uq" UNIQUE("verification_id","entry_type"),
	CONSTRAINT "requester_ledger_entry_chk" CHECK (entry_type in ('TOPUP','RESERVE','RELEASE','REFUND'))
);
--> statement-breakpoint
CREATE TABLE "uploads" (
	"id" text PRIMARY KEY NOT NULL,
	"claim_id" text NOT NULL,
	"challenge_id" text NOT NULL,
	"object_key" text NOT NULL,
	"state" text NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uploads_object_key_unique" UNIQUE("object_key"),
	CONSTRAINT "uploads_state_chk" CHECK (state in ('PENDING','FINALIZED','DISCARDED'))
);
--> statement-breakpoint
CREATE TABLE "verification_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"credential_id" text NOT NULL,
	"principal_id" text NOT NULL,
	"type" text NOT NULL,
	"question" text NOT NULL,
	"answer_values" text[] NOT NULL,
	"target_lat" double precision NOT NULL,
	"target_lng" double precision NOT NULL,
	"place_id" text NOT NULL,
	"radius_m" integer NOT NULL,
	"deadline" timestamp with time zone NOT NULL,
	"freshness_max_age_s" integer NOT NULL,
	"evidence_photo_required" boolean DEFAULT true NOT NULL,
	"evidence_nonce_required" boolean DEFAULT true NOT NULL,
	"required_witnesses" smallint NOT NULL,
	"quorum" smallint NOT NULL,
	"bounty_asset" text NOT NULL,
	"bounty_amount" numeric(20, 6) NOT NULL,
	"bounty_network" text NOT NULL,
	"status" text NOT NULL,
	"funding_status" text DEFAULT 'NONE' NOT NULL,
	"settlement_status" text DEFAULT 'NONE' NOT NULL,
	"status_reason" text,
	"task_id_hash" "bytea" NOT NULL,
	"idempotency_key_hash" "bytea" NOT NULL,
	"request_hash" "bytea" NOT NULL,
	"policy_rule_version" text NOT NULL,
	"callback_endpoint_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "verification_requests_task_id_hash_unique" UNIQUE("task_id_hash"),
	CONSTRAINT "vr_idempotency_uq" UNIQUE("credential_id","idempotency_key_hash"),
	CONSTRAINT "vr_type_chk" CHECK (type = 'PLACE_STATUS_VERIFICATION'),
	CONSTRAINT "vr_question_len_chk" CHECK (char_length(question) <= 280),
	CONSTRAINT "vr_radius_chk" CHECK (radius_m between 25 and 500),
	CONSTRAINT "vr_freshness_chk" CHECK (freshness_max_age_s between 60 and 900),
	CONSTRAINT "vr_witnesses_chk" CHECK (required_witnesses between 1 and 5),
	CONSTRAINT "vr_quorum_chk" CHECK (quorum between 1 and required_witnesses),
	CONSTRAINT "vr_bounty_chk" CHECK (bounty_amount > 0),
	CONSTRAINT "vr_network_chk" CHECK (bounty_network = 'solana-devnet'),
	CONSTRAINT "vr_status_chk" CHECK (status in ('CREATED','FUNDED','OPEN','CLAIMED','SUBMITTED','VERIFYING','VERIFIED','SETTLED','REJECTED','EXPIRED','CANCELLED','REFUNDED')),
	CONSTRAINT "vr_funding_chk" CHECK (funding_status in ('NONE','PENDING','SUBMITTED','CONFIRMED','FAILED','ABANDONED')),
	CONSTRAINT "vr_settlement_chk" CHECK (settlement_status in ('NONE','PENDING','SUBMITTED','CONFIRMED','FAILED'))
);
--> statement-breakpoint
CREATE TABLE "verification_results" (
	"verification_id" text PRIMARY KEY NOT NULL,
	"outcome" text NOT NULL,
	"outcome_reason" text,
	"final_answer" text,
	"valid_witness_count" smallint NOT NULL,
	"required_witnesses" smallint NOT NULL,
	"quorum" smallint NOT NULL,
	"consensus_ratio" numeric(5, 4),
	"answer_counts" jsonb NOT NULL,
	"accepted_submission_ids" text[] NOT NULL,
	"evidence_bundle" jsonb NOT NULL,
	"evidence_root" "bytea" NOT NULL,
	"result_hash" "bytea" NOT NULL,
	"finalized_at" timestamp with time zone NOT NULL,
	CONSTRAINT "vres_outcome_chk" CHECK (outcome in ('VERIFIED','REJECTED','EXPIRED')),
	CONSTRAINT "vres_reason_chk" CHECK (outcome_reason is null or outcome_reason in ('NO_CONSENSUS','INSUFFICIENT_WITNESSES'))
);
--> statement-breakpoint
CREATE TABLE "webhook_deliveries" (
	"id" text PRIMARY KEY NOT NULL,
	"endpoint_id" text NOT NULL,
	"verification_id" text NOT NULL,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_status" integer,
	"delivered_at" timestamp with time zone,
	CONSTRAINT "wd_once_uq" UNIQUE("endpoint_id","verification_id","event_type")
);
--> statement-breakpoint
CREATE TABLE "webhook_endpoints" (
	"id" text PRIMARY KEY NOT NULL,
	"credential_id" text NOT NULL,
	"url" text NOT NULL,
	"secret_enc" "bytea" NOT NULL,
	"events" text[] NOT NULL,
	"status" text DEFAULT 'active' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "witness_submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"verification_id" text NOT NULL,
	"claim_id" text NOT NULL,
	"worker_id" text NOT NULL,
	"challenge_id" text NOT NULL,
	"answer" text NOT NULL,
	"state" text NOT NULL,
	"first_failed_check" text,
	"reason_code" text,
	"accepted_for_consensus" boolean DEFAULT false NOT NULL,
	"client_timestamp" timestamp with time zone,
	"server_received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"submission_hash" "bytea",
	"idempotency_key_hash" "bytea" NOT NULL,
	CONSTRAINT "witness_submissions_challenge_id_unique" UNIQUE("challenge_id"),
	CONSTRAINT "ws_idempotency_uq" UNIQUE("claim_id","idempotency_key_hash"),
	CONSTRAINT "ws_state_chk" CHECK (state in ('CHECKING','VALID','INVALID'))
);
--> statement-breakpoint
CREATE TABLE "worker_consents" (
	"worker_id" text NOT NULL,
	"document" text NOT NULL,
	"version" text NOT NULL,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "worker_consents_worker_id_document_version_pk" PRIMARY KEY("worker_id","document","version"),
	CONSTRAINT "worker_consents_doc_chk" CHECK (document in ('worker_terms','safety_rules','privacy_notice'))
);
--> statement-breakpoint
CREATE TABLE "workers" (
	"id" text PRIMARY KEY NOT NULL,
	"privy_user_id" text NOT NULL,
	"payout_pubkey" text NOT NULL,
	"invite_code_id" text NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"coarse_area" text,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workers_privy_user_id_unique" UNIQUE("privy_user_id"),
	CONSTRAINT "workers_payout_pubkey_unique" UNIQUE("payout_pubkey"),
	CONSTRAINT "workers_status_chk" CHECK (status in ('active','suspended'))
);
--> statement-breakpoint
ALTER TABLE "challenges" ADD CONSTRAINT "challenges_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_verification_id_verification_requests_id_fk" FOREIGN KEY ("verification_id") REFERENCES "public"."verification_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "claims" ADD CONSTRAINT "claims_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_checks" ADD CONSTRAINT "evidence_checks_submission_id_witness_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."witness_submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_objects" ADD CONSTRAINT "evidence_objects_submission_id_witness_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."witness_submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evidence_objects" ADD CONSTRAINT "evidence_objects_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_observations" ADD CONSTRAINT "location_observations_submission_id_witness_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."witness_submissions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_records" ADD CONSTRAINT "payment_records_verification_id_verification_requests_id_fk" FOREIGN KEY ("verification_id") REFERENCES "public"."verification_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requester_credentials" ADD CONSTRAINT "requester_credentials_principal_id_principals_id_fk" FOREIGN KEY ("principal_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requester_ledger" ADD CONSTRAINT "requester_ledger_credential_id_requester_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."requester_credentials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "requester_ledger" ADD CONSTRAINT "requester_ledger_verification_id_verification_requests_id_fk" FOREIGN KEY ("verification_id") REFERENCES "public"."verification_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "uploads" ADD CONSTRAINT "uploads_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_credential_id_requester_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."requester_credentials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_principal_id_principals_id_fk" FOREIGN KEY ("principal_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_place_id_places_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."places"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_callback_endpoint_id_webhook_endpoints_id_fk" FOREIGN KEY ("callback_endpoint_id") REFERENCES "public"."webhook_endpoints"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_results" ADD CONSTRAINT "verification_results_verification_id_verification_requests_id_fk" FOREIGN KEY ("verification_id") REFERENCES "public"."verification_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_deliveries" ADD CONSTRAINT "webhook_deliveries_endpoint_id_webhook_endpoints_id_fk" FOREIGN KEY ("endpoint_id") REFERENCES "public"."webhook_endpoints"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_endpoints" ADD CONSTRAINT "webhook_endpoints_credential_id_requester_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."requester_credentials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "witness_submissions" ADD CONSTRAINT "witness_submissions_verification_id_verification_requests_id_fk" FOREIGN KEY ("verification_id") REFERENCES "public"."verification_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "witness_submissions" ADD CONSTRAINT "witness_submissions_claim_id_claims_id_fk" FOREIGN KEY ("claim_id") REFERENCES "public"."claims"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "witness_submissions" ADD CONSTRAINT "witness_submissions_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "witness_submissions" ADD CONSTRAINT "witness_submissions_challenge_id_challenges_id_fk" FOREIGN KEY ("challenge_id") REFERENCES "public"."challenges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "worker_consents" ADD CONSTRAINT "worker_consents_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_verification_idx" ON "audit_events" USING btree ("verification_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "one_issued_challenge_per_claim" ON "challenges" USING btree ("claim_id") WHERE state = 'ISSUED';--> statement-breakpoint
CREATE INDEX "claims_task_state_idx" ON "claims" USING btree ("verification_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "evidence_sha256_unique" ON "evidence_objects" USING btree ("sha256");--> statement-breakpoint
CREATE INDEX "outbox_state_run_after_idx" ON "outbox_jobs" USING btree ("state","run_after");--> statement-breakpoint
CREATE UNIQUE INDEX "settle_xor_refund" ON "payment_records" USING btree ("verification_id") WHERE kind in ('FINALIZE_AND_SETTLE','REFUND');--> statement-breakpoint
CREATE UNIQUE INDEX "one_credit_back_per_task" ON "requester_ledger" USING btree ("verification_id") WHERE entry_type in ('RELEASE','REFUND');--> statement-breakpoint
CREATE INDEX "vr_status_deadline_idx" ON "verification_requests" USING btree ("status","deadline");--> statement-breakpoint
CREATE UNIQUE INDEX "one_checking_submission_per_claim" ON "witness_submissions" USING btree ("claim_id") WHERE state = 'CHECKING';--> statement-breakpoint
CREATE UNIQUE INDEX "one_valid_submission_per_claim" ON "witness_submissions" USING btree ("claim_id") WHERE state = 'VALID';