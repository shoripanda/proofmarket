-- Requesters may require a minimum worker trust tier (01 §4.11).
ALTER TABLE "verification_requests" ADD COLUMN "min_worker_tier" text;
--> statement-breakpoint
ALTER TABLE "verification_requests" ADD CONSTRAINT "vr_min_tier_chk" CHECK (min_worker_tier is null or min_worker_tier in ('standard','trusted'));
