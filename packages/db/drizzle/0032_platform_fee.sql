-- Platform fee, 15% on top of the bounty (docs/architecture 13 §6.1, owner decision D3 of 2026-10-16).
-- platform_fee_amount already exists (0 for every row so far). fee_rate_bps keeps the rate a request was created
-- at, so a later change of rate never re-prices old requests; platform_fee_earned is the part kept at settlement
-- (the paid witnesses' share). Existing rows keep rate 0 and no fee.
ALTER TABLE "verification_requests" ADD COLUMN "fee_rate_bps" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "verification_requests" ADD COLUMN "platform_fee_earned" numeric(20, 6);--> statement-breakpoint
ALTER TABLE "verification_requests" ADD CONSTRAINT "vr_fee_rate_chk" CHECK (fee_rate_bps between 0 and 5000);--> statement-breakpoint
ALTER TABLE "verification_requests" ADD CONSTRAINT "vr_fee_earned_chk" CHECK (platform_fee_earned is null or (platform_fee_earned >= 0 and platform_fee_earned <= platform_fee_amount));
