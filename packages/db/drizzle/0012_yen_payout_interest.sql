-- Workers can register interest in yen payouts (01 §4.10). No bank details are stored.
ALTER TABLE "workers" ADD COLUMN "yen_payout_interest_at" timestamp with time zone;
