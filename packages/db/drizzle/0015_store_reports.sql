-- Shops report their own status through a secret link (01 §4.13). Context for requesters only.
CREATE TABLE "place_owner_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"place_id" text NOT NULL REFERENCES "places"("id"),
	"token_hash" "bytea" NOT NULL UNIQUE,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "place_status_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"place_id" text NOT NULL REFERENCES "places"("id"),
	"token_id" text NOT NULL REFERENCES "place_owner_tokens"("id"),
	"status" text NOT NULL,
	"valid_until" timestamp with time zone NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "psr_status_chk" CHECK (status in ('CLOSED_TODAY','OPEN_AS_USUAL')),
	CONSTRAINT "psr_note_chk" CHECK (note is null or char_length(note) <= 200)
);
--> statement-breakpoint
CREATE INDEX "place_status_reports_place_created_idx" ON "place_status_reports" USING btree ("place_id","created_at");
--> statement-breakpoint
ALTER TABLE "place_owner_tokens" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "place_status_reports" ENABLE ROW LEVEL SECURITY;
