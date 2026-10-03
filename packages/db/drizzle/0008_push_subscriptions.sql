-- Web Push endpoints per worker and the coarse areas they chose (04 §3.22), and the NOTIFY_WORKERS job kind.
ALTER TABLE "outbox_jobs" DROP CONSTRAINT "outbox_kind_chk";
--> statement-breakpoint
ALTER TABLE "outbox_jobs" ADD CONSTRAINT "outbox_kind_chk" CHECK (kind in ('FUND_TASK','FINALIZE_AND_SETTLE','REFUND_TASK','DELIVER_WEBHOOK','PURGE_EVIDENCE','NOTIFY_WORKERS'));
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"worker_id" text NOT NULL REFERENCES "workers"("id"),
	"endpoint_hash" "bytea" NOT NULL UNIQUE,
	"endpoint_enc" "bytea" NOT NULL,
	"areas" text[] NOT NULL,
	"failures" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_sent_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "push_subscriptions" ENABLE ROW LEVEL SECURITY;
