-- Flag that holds submissions for the outside AI reviewer (01 §4.17).
ALTER TABLE "platform_flags" DROP CONSTRAINT "platform_flags_key_chk";--> statement-breakpoint
ALTER TABLE "platform_flags" ADD CONSTRAINT "platform_flags_key_chk" CHECK (key in ('tasks_create_enabled','claims_enabled','settlement_enabled','public_evidence_enabled','external_review_enabled'));
