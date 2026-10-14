-- Spend policy, quotes, the x402 flag and the list index (docs/architecture 09 §4). Apply before the code.
-- 1. A null limit means "no ceiling" (04 §4.3); existing rows keep their values.
ALTER TABLE "requester_credentials" ALTER COLUMN "max_task_amount" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "requester_credentials" ALTER COLUMN "daily_spend_limit" DROP NOT NULL;--> statement-breakpoint
-- 2. Quotes (04 §4.2): the cost of a request, held for five minutes, consumed by one create.
CREATE TABLE "verification_quotes" (
	"id" text PRIMARY KEY NOT NULL,
	"credential_id" text NOT NULL,
	"request_hash" "bytea" NOT NULL,
	"asset" text NOT NULL,
	"total" numeric(20, 6) NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"verification_id" text,
	CONSTRAINT "vq_total_chk" CHECK (total > 0)
);--> statement-breakpoint
ALTER TABLE "verification_quotes" ADD CONSTRAINT "verification_quotes_credential_id_requester_credentials_id_fk" FOREIGN KEY ("credential_id") REFERENCES "public"."requester_credentials"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_quotes" ADD CONSTRAINT "verification_quotes_verification_id_verification_requests_id_fk" FOREIGN KEY ("verification_id") REFERENCES "public"."verification_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "vq_credential_created_idx" ON "verification_quotes" USING btree ("credential_id","created_at");--> statement-breakpoint
ALTER TABLE "verification_quotes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
-- 3. The x402 window can be stopped on its own (08 §4.3). On by default, like the other service flags.
ALTER TABLE "platform_flags" DROP CONSTRAINT "platform_flags_key_chk";--> statement-breakpoint
ALTER TABLE "platform_flags" ADD CONSTRAINT "platform_flags_key_chk" CHECK (key in ('tasks_create_enabled','claims_enabled','settlement_enabled','public_evidence_enabled','external_review_enabled','x402_enabled'));--> statement-breakpoint
INSERT INTO "platform_flags" ("key", "value", "updated_by") VALUES ('x402_enabled', true, 'migration') ON CONFLICT DO NOTHING;--> statement-breakpoint
-- 4. GET /v1/verifications (04 §4.1): newest first per credential.
CREATE INDEX "vr_credential_created_idx" ON "verification_requests" USING btree ("credential_id","created_at" DESC);
