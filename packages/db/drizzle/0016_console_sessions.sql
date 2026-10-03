-- Requester console sessions (01 §4.14). The cookie value is random; only its hash is stored.
CREATE TABLE "console_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"credential_id" text NOT NULL REFERENCES "requester_credentials"("id"),
	"token_hash" "bytea" NOT NULL UNIQUE,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "console_sessions" ENABLE ROW LEVEL SECURITY;
