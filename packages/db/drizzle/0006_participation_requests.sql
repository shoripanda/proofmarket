-- Sign-ups from the site's /join (04 §3.20). Email is encrypted; rows are deleted after 90 days.
CREATE TABLE "participation_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"role" text NOT NULL,
	"contact_enc" "bytea" NOT NULL,
	"area" text,
	"note" text,
	"consent_version" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"delete_after" timestamp with time zone NOT NULL,
	CONSTRAINT "participation_role_chk" CHECK (role in ('worker','requester')),
	CONSTRAINT "participation_area_chk" CHECK (area is null or area in ('shibuya','shinjuku','other')),
	CONSTRAINT "participation_note_chk" CHECK (note is null or char_length(note) <= 500),
	CONSTRAINT "participation_status_chk" CHECK (status in ('new','contacted','closed'))
);
--> statement-breakpoint
ALTER TABLE "participation_requests" ENABLE ROW LEVEL SECURITY;
