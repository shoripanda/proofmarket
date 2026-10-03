-- Recurring checks (04 §3.23): the tick creates a normal verification from the template at each due time.
CREATE TABLE "verification_schedules" (
	"id" text PRIMARY KEY NOT NULL,
	"credential_id" text NOT NULL REFERENCES "requester_credentials"("id"),
	"template" jsonb NOT NULL,
	"deadline_minutes" integer NOT NULL,
	"times_jst" text[] NOT NULL,
	"days_jst" smallint[] NOT NULL,
	"ends_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"next_run_at" timestamp with time zone NOT NULL,
	"last_run_at" timestamp with time zone,
	"last_verification_id" text,
	"last_error" text,
	"consecutive_failures" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_deadline_chk" CHECK (deadline_minutes between 10 and 1440)
);
--> statement-breakpoint
CREATE INDEX "verification_schedules_active_next_idx" ON "verification_schedules" USING btree ("active","next_run_at");
--> statement-breakpoint
ALTER TABLE "verification_schedules" ENABLE ROW LEVEL SECURITY;
