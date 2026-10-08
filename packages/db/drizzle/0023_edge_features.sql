-- Edge features (13-edge-features.md §8): rising bounty, optimistic verification, attestation.
ALTER TABLE "verification_requests" ADD COLUMN "bounty_max_amount" numeric(20, 6);--> statement-breakpoint
ALTER TABLE "verification_requests" ADD COLUMN "bounty_ramp_minutes" integer;--> statement-breakpoint
ALTER TABLE "verification_requests" ADD COLUMN "bounty_final_amount" numeric(20, 6);--> statement-breakpoint
ALTER TABLE "verification_requests" ADD COLUMN "challenge_minutes" integer;--> statement-breakpoint
ALTER TABLE "verification_requests" ADD COLUMN "provisional_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "verification_requests" ADD COLUMN "attestation" jsonb;--> statement-breakpoint
ALTER TABLE "verification_requests" ADD COLUMN "location_privacy" text DEFAULT 'exact' NOT NULL;--> statement-breakpoint
ALTER TABLE "verification_requests" ADD CONSTRAINT "vr_location_privacy_chk" CHECK (location_privacy in ('exact','coarse'));--> statement-breakpoint
ALTER TABLE "verification_requests" ADD CONSTRAINT "vr_bounty_max_chk" CHECK (bounty_max_amount is null or bounty_max_amount >= bounty_amount);--> statement-breakpoint
ALTER TABLE "verification_requests" ADD CONSTRAINT "vr_bounty_ramp_chk" CHECK (bounty_ramp_minutes is null or bounty_ramp_minutes between 10 and 1440);--> statement-breakpoint
ALTER TABLE "verification_requests" ADD CONSTRAINT "vr_challenge_chk" CHECK (challenge_minutes is null or challenge_minutes between 10 and 120);--> statement-breakpoint
ALTER TABLE "claims" ADD COLUMN "reward_amount" numeric(20, 6);--> statement-breakpoint
CREATE TABLE "verification_challenges" (
	"id" text PRIMARY KEY NOT NULL,
	"verification_id" text NOT NULL UNIQUE REFERENCES "verification_requests"("id"),
	"challenger_credential_id" text NOT NULL REFERENCES "requester_credentials"("id"),
	"bond_amount" numeric(20, 6) NOT NULL,
	"recheck_verification_id" text REFERENCES "verification_requests"("id"),
	"state" text DEFAULT 'OPEN' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	CONSTRAINT "vc_state_chk" CHECK (state in ('OPEN','UPHELD','OVERTURNED'))
);
--> statement-breakpoint
ALTER TABLE "verification_challenges" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "payout_adjustments" (
	"id" text PRIMARY KEY NOT NULL,
	"worker_id" text NOT NULL REFERENCES "workers"("id"),
	"verification_id" text NOT NULL REFERENCES "verification_requests"("id"),
	"amount" numeric(20, 6) NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"paid_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "payout_adjustments" ENABLE ROW LEVEL SECURITY;
