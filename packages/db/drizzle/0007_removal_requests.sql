-- Photo removal requests from the site's /rules (04 §3.21, 08 §6). Kept 1 year as a record of handling.
CREATE TABLE "removal_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"contact_enc" "bytea" NOT NULL,
	"verification_id" text,
	"place_note" text,
	"reason" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delete_after" timestamp with time zone NOT NULL,
	CONSTRAINT "removal_place_note_chk" CHECK (place_note is null or char_length(place_note) <= 200),
	CONSTRAINT "removal_reason_chk" CHECK (char_length(reason) between 1 and 1000),
	CONSTRAINT "removal_status_chk" CHECK (status in ('new','handled','rejected'))
);
--> statement-breakpoint
ALTER TABLE "removal_requests" ENABLE ROW LEVEL SECURITY;
