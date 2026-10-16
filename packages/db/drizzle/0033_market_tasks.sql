-- General tasks next to verifications (docs/architecture 13, owner decisions D1-D6 of 2026-10-16).
-- Five new tables, kept apart from the verification flow: a task, its applications, its seats (one on-chain Task
-- per seat), deliveries, and chain operations per seat. The ledger gains market_task_id / seat_id so a task's
-- RESERVE and each seat's REFUND sit in the same balance. Off until the operator sets tasks_enabled.
CREATE TABLE "market_tasks" (
	"id" text PRIMARY KEY NOT NULL,
	"credential_id" text NOT NULL,
	"principal_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"completion_criteria" text NOT NULL,
	"evidence_types" text[] NOT NULL,
	"application_questions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"area" text,
	"remote_ok" boolean DEFAULT false NOT NULL,
	"asset" text NOT NULL,
	"network" text NOT NULL,
	"price" numeric(20, 6) NOT NULL,
	"seats" smallint NOT NULL,
	"fee_rate_bps" integer NOT NULL,
	"fee_per_seat" numeric(20, 6) NOT NULL,
	"selection_mode" text NOT NULL,
	"auto_accept" boolean DEFAULT false NOT NULL,
	"release_mode" text NOT NULL,
	"completion_window_h" smallint NOT NULL,
	"deadline" timestamp with time zone NOT NULL,
	"status" text NOT NULL,
	"idempotency_key_hash" "bytea" NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	CONSTRAINT "mt_idempotency_uq" UNIQUE("credential_id","idempotency_key_hash"),
	CONSTRAINT "mt_status_chk" CHECK (status in ('OPEN','CLOSED','DONE','CANCELLED')),
	CONSTRAINT "mt_selection_chk" CHECK (selection_mode in ('first_come','application')),
	CONSTRAINT "mt_release_chk" CHECK (release_mode in ('manual','auto')),
	CONSTRAINT "mt_seats_chk" CHECK (seats between 1 and 50),
	CONSTRAINT "mt_window_chk" CHECK (completion_window_h between 1 and 168),
	CONSTRAINT "mt_price_chk" CHECK (price > 0),
	CONSTRAINT "mt_fee_chk" CHECK (fee_per_seat >= 0 and fee_rate_bps between 0 and 5000),
	CONSTRAINT "mt_title_chk" CHECK (char_length(title) between 5 and 200),
	CONSTRAINT "mt_description_chk" CHECK (char_length(description) between 20 and 5000),
	CONSTRAINT "mt_criteria_chk" CHECK (char_length(completion_criteria) between 5 and 2000),
	CONSTRAINT "mt_place_chk" CHECK (area is not null or remote_ok)
);--> statement-breakpoint
CREATE TABLE "seat_payments" (
	"id" text PRIMARY KEY NOT NULL,
	"seat_id" text NOT NULL,
	"kind" text NOT NULL,
	"amount" numeric(20, 6) NOT NULL,
	"status" text NOT NULL,
	"signatures" text[] DEFAULT '{}' NOT NULL,
	"last_error" text,
	"created_at" timestamp with time zone NOT NULL,
	"confirmed_at" timestamp with time zone,
	CONSTRAINT "sp_seat_kind_uq" UNIQUE("seat_id","kind"),
	CONSTRAINT "sp_kind_chk" CHECK (kind in ('FUND','SETTLE','REFUND')),
	CONSTRAINT "sp_status_chk" CHECK (status in ('PENDING','SUBMITTED','CONFIRMED','FAILED'))
);--> statement-breakpoint
CREATE TABLE "task_applications" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"worker_id" text NOT NULL,
	"answers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"note" text,
	"state" text NOT NULL,
	"decision_reason" text,
	"created_at" timestamp with time zone NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "ta_one_per_worker_uq" UNIQUE("task_id","worker_id"),
	CONSTRAINT "ta_state_chk" CHECK (state in ('pending','accepted','rejected','withdrawn')),
	CONSTRAINT "ta_note_chk" CHECK (note is null or char_length(note) <= 1000)
);--> statement-breakpoint
CREATE TABLE "task_seats" (
	"id" text PRIMARY KEY NOT NULL,
	"task_id" text NOT NULL,
	"seat_no" smallint NOT NULL,
	"round" smallint NOT NULL,
	"worker_id" text NOT NULL,
	"application_id" text,
	"state" text NOT NULL,
	"task_id_hash" "bytea" NOT NULL,
	"funded_at" timestamp with time zone,
	"assigned_at" timestamp with time zone NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"submitted_at" timestamp with time zone,
	"review_due_at" timestamp with time zone,
	"revisions" smallint DEFAULT 0 NOT NULL,
	"decided_at" timestamp with time zone,
	"decision_reason" text,
	"released_by" text,
	CONSTRAINT "task_seats_task_id_hash_unique" UNIQUE("task_id_hash"),
	CONSTRAINT "seat_round_uq" UNIQUE("task_id","seat_no","round"),
	CONSTRAINT "seat_state_chk" CHECK (state in ('ASSIGNED','IN_REVIEW','RELEASED','REJECTED','EXPIRED','CANCELLED')),
	CONSTRAINT "seat_revisions_chk" CHECK (revisions between 0 and 3),
	CONSTRAINT "seat_released_by_chk" CHECK (released_by is null or released_by in ('requester','timeout','auto'))
);--> statement-breakpoint
CREATE TABLE "task_submissions" (
	"id" text PRIMARY KEY NOT NULL,
	"seat_id" text NOT NULL,
	"round" smallint NOT NULL,
	"body" text NOT NULL,
	"links" text[] NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	CONSTRAINT "tsub_round_uq" UNIQUE("seat_id","round"),
	CONSTRAINT "tsub_body_chk" CHECK (char_length(body) between 1 and 5000)
);--> statement-breakpoint
ALTER TABLE "requester_ledger" ADD COLUMN "market_task_id" text;--> statement-breakpoint
ALTER TABLE "requester_ledger" ADD COLUMN "seat_id" text;--> statement-breakpoint
ALTER TABLE "market_tasks" ADD CONSTRAINT "market_tasks_credential_id_requester_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."requester_credentials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_tasks" ADD CONSTRAINT "market_tasks_principal_id_principals_id_fk" FOREIGN KEY ("principal_id") REFERENCES "public"."principals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "seat_payments" ADD CONSTRAINT "seat_payments_seat_id_task_seats_id_fk" FOREIGN KEY ("seat_id") REFERENCES "public"."task_seats"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_applications" ADD CONSTRAINT "task_applications_task_id_market_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."market_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_applications" ADD CONSTRAINT "task_applications_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_seats" ADD CONSTRAINT "task_seats_task_id_market_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."market_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_seats" ADD CONSTRAINT "task_seats_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_seats" ADD CONSTRAINT "task_seats_application_id_task_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."task_applications"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_submissions" ADD CONSTRAINT "task_submissions_seat_id_task_seats_id_fk" FOREIGN KEY ("seat_id") REFERENCES "public"."task_seats"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mt_status_deadline_idx" ON "market_tasks" USING btree ("status","deadline");--> statement-breakpoint
CREATE INDEX "mt_credential_created_idx" ON "market_tasks" USING btree ("credential_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "sp_settle_xor_refund" ON "seat_payments" USING btree ("seat_id") WHERE kind in ('SETTLE','REFUND');--> statement-breakpoint
CREATE UNIQUE INDEX "one_live_seat" ON "task_seats" USING btree ("task_id","seat_no") WHERE state in ('ASSIGNED','IN_REVIEW');--> statement-breakpoint
CREATE UNIQUE INDEX "one_live_seat_per_worker" ON "task_seats" USING btree ("task_id","worker_id") WHERE state in ('ASSIGNED','IN_REVIEW');--> statement-breakpoint
CREATE INDEX "seat_state_due_idx" ON "task_seats" USING btree ("state","due_at");--> statement-breakpoint
CREATE INDEX "seat_state_review_idx" ON "task_seats" USING btree ("state","review_due_at");--> statement-breakpoint
ALTER TABLE "requester_ledger" ADD CONSTRAINT "requester_ledger_market_task_id_market_tasks_id_fk" FOREIGN KEY ("market_task_id") REFERENCES "public"."market_tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "requester_ledger_market_entry_uq" ON "requester_ledger" USING btree ("market_task_id",coalesce(seat_id, ''),"entry_type") WHERE market_task_id is not null;--> statement-breakpoint
ALTER TABLE "market_tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "task_applications" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "task_seats" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "task_submissions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "seat_payments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "outbox_jobs" DROP CONSTRAINT "outbox_kind_chk";--> statement-breakpoint
ALTER TABLE "outbox_jobs" ADD CONSTRAINT "outbox_kind_chk" CHECK (kind in ('FUND_TASK','FINALIZE_AND_SETTLE','REFUND_TASK','DELIVER_WEBHOOK','PURGE_EVIDENCE','NOTIFY_WORKERS','RECONCILE_SETTLEMENTS','FUND_SEAT','SETTLE_SEAT','REFUND_SEAT'));--> statement-breakpoint
ALTER TABLE "platform_flags" DROP CONSTRAINT "platform_flags_key_chk";--> statement-breakpoint
ALTER TABLE "platform_flags" ADD CONSTRAINT "platform_flags_key_chk" CHECK (key in ('tasks_create_enabled','claims_enabled','settlement_enabled','public_evidence_enabled','external_review_enabled','x402_enabled','tasks_enabled'));--> statement-breakpoint
INSERT INTO "platform_flags" ("key", "value", "updated_by") VALUES ('tasks_enabled', false, 'migration') ON CONFLICT DO NOTHING;
