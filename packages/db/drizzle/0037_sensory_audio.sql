-- Sensory reports, part 2 (docs/architecture 16 §4, §9): audio clips on request, and hearing-only requests at a
-- place where the photo is optional. Existing rows keep the old behaviour (photo required, no clip).
ALTER TABLE "verification_requests" ADD COLUMN "photo_required" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "verification_requests" ADD COLUMN "audio_clip" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "verification_requests" ADD COLUMN "audio_max_s" integer;--> statement-breakpoint
ALTER TABLE "verification_requests" ADD CONSTRAINT "vr_audio_chk" CHECK (audio_clip in ('none','optional','required') and (audio_clip = 'none') = (audio_max_s is null) and (audio_max_s is null or audio_max_s between 5 and 15));--> statement-breakpoint
ALTER TABLE "evidence_objects" ADD COLUMN "duration_ms" integer;
