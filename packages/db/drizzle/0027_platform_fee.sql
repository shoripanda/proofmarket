-- Platform fee per request (01 §4.1): 0 during the MVP; the column is here so a rate can be recorded later
-- without another migration. Nothing reads it yet.
ALTER TABLE "verification_requests" ADD COLUMN "platform_fee_amount" numeric(20, 6) NOT NULL DEFAULT 0;--> statement-breakpoint
ALTER TABLE "verification_requests" ADD CONSTRAINT "vr_platform_fee_chk" CHECK (platform_fee_amount >= 0);
