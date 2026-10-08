-- Requester-defined work (01 §4.25): what the requester will accept, shown to the worker and the AI review.
-- Form answers reuse answer_kind = 'text' with answer_spec.fields; no new column.
ALTER TABLE "verification_requests" ADD COLUMN "acceptance_criteria" text;--> statement-breakpoint
ALTER TABLE "verification_requests" ADD CONSTRAINT "vr_acceptance_len_chk" CHECK (acceptance_criteria is null or char_length(acceptance_criteria) <= 500);
