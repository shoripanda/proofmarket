-- Watches (01 §4.23): a schedule can run every N minutes, stop after N runs, and stop when an answer matches.
ALTER TABLE "verification_schedules" ADD COLUMN "every_minutes" integer;--> statement-breakpoint
ALTER TABLE "verification_schedules" ADD COLUMN "max_runs" integer;--> statement-breakpoint
ALTER TABLE "verification_schedules" ADD COLUMN "runs" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "verification_schedules" ADD COLUMN "stop_when" jsonb;--> statement-breakpoint
ALTER TABLE "verification_schedules" ADD COLUMN "stopped_reason" text;--> statement-breakpoint
ALTER TABLE "verification_schedules" ADD COLUMN "matched_verification_id" text;
