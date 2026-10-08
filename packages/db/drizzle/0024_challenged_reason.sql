-- Optimistic verification (13-edge-features.md §3): a result overturned by a recheck is REJECTED with reason CHALLENGED.
ALTER TABLE "verification_results" DROP CONSTRAINT "vres_reason_chk";--> statement-breakpoint
ALTER TABLE "verification_results" ADD CONSTRAINT "vres_reason_chk" CHECK (outcome_reason is null or outcome_reason in ('NO_CONSENSUS','INSUFFICIENT_WITNESSES','CHALLENGED'));
