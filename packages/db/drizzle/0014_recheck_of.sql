-- A dispute creates one recheck task linked to the original (01 §4.12).
ALTER TABLE "verification_requests" ADD COLUMN "recheck_of" text;
--> statement-breakpoint
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_recheck_of_unique" UNIQUE ("recheck_of");
--> statement-breakpoint
ALTER TABLE "verification_requests" ADD CONSTRAINT "verification_requests_recheck_of_fk" FOREIGN KEY ("recheck_of") REFERENCES "verification_requests"("id");
