-- Requester sign-ups get their API key by email at once (01 §4.28). contact_hash finds earlier sign-ups from the
-- same address (one key per address); credential_id records which key was sent. Both stay null for workers.
ALTER TABLE "participation_requests" ADD COLUMN "contact_hash" "bytea";--> statement-breakpoint
ALTER TABLE "participation_requests" ADD COLUMN "credential_id" text;--> statement-breakpoint
CREATE INDEX "participation_contact_hash_idx" ON "participation_requests" USING btree ("contact_hash");
