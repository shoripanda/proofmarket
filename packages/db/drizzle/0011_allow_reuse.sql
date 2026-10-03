-- Requesters opt in to sharing a result with later requests for the same place (01 §4.9).
ALTER TABLE "verification_requests" ADD COLUMN "allow_reuse" boolean DEFAULT false NOT NULL;
