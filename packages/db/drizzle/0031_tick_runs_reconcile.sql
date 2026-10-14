-- Throughput measurement and the daily settlement reconciliation (docs/architecture 06 §4.2-4.3).
-- 1. One row per tick: when it started, how long each step took, how many jobs it ran. /v1/health/ready reads
--    the latest; rows older than seven days are purged by the daily bookkeeping.
CREATE TABLE "tick_runs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"duration_ms" integer NOT NULL,
	"steps" jsonb NOT NULL,
	"jobs_run" integer NOT NULL,
	"failed" text[] NOT NULL
);--> statement-breakpoint
CREATE INDEX "tick_runs_started_idx" ON "tick_runs" USING btree ("started_at");--> statement-breakpoint
ALTER TABLE "tick_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- 2. A daily job that compares yesterday's settlements with the Task accounts on chain.
ALTER TABLE "outbox_jobs" DROP CONSTRAINT "outbox_kind_chk";--> statement-breakpoint
ALTER TABLE "outbox_jobs" ADD CONSTRAINT "outbox_kind_chk" CHECK (kind in ('FUND_TASK','FINALIZE_AND_SETTLE','REFUND_TASK','DELIVER_WEBHOOK','PURGE_EVIDENCE','NOTIFY_WORKERS','RECONCILE_SETTLEMENTS'));
