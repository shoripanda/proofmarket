-- More task types, number/text answers and optional location (01 §4.15).
ALTER TABLE "verification_requests" DROP CONSTRAINT "vr_type_chk";--> statement-breakpoint
ALTER TABLE "verification_requests" DROP CONSTRAINT "vr_question_len_chk";--> statement-breakpoint
ALTER TABLE "verification_requests" DROP CONSTRAINT "vr_freshness_chk";--> statement-breakpoint
ALTER TABLE "verification_requests" ALTER COLUMN "target_lat" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "verification_requests" ALTER COLUMN "target_lng" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "verification_requests" ALTER COLUMN "place_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "verification_requests" ALTER COLUMN "radius_m" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "verification_requests" ADD COLUMN "answer_kind" text DEFAULT 'enum' NOT NULL;--> statement-breakpoint
ALTER TABLE "verification_requests" ADD COLUMN "answer_spec" jsonb;--> statement-breakpoint
ALTER TABLE "verification_requests" ADD CONSTRAINT "vr_answer_kind_chk" CHECK (answer_kind in ('enum','number','text'));--> statement-breakpoint
ALTER TABLE "verification_requests" ADD CONSTRAINT "vr_location_chk" CHECK ((target_lat is null) = (target_lng is null) and (target_lat is null) = (radius_m is null));--> statement-breakpoint
ALTER TABLE "verification_requests" ADD CONSTRAINT "vr_type_chk" CHECK (type in ('PLACE_STATUS_VERIFICATION','QUEUE_LENGTH','NOTICE_POSTED','CROWD_LEVEL','SEAT_AVAILABILITY','PARKING_AVAILABILITY','STOCK_CHECK','PRICE_CHECK','SIGN_TRANSCRIPTION','SITE_REPORT','DOCUMENT_TRANSCRIPTION','DOCUMENT_QA','PRODUCT_INSPECTION','PHONE_INQUIRY','MEASUREMENT','CUSTOM_CHOICE','CUSTOM_TASK'));--> statement-breakpoint
ALTER TABLE "verification_requests" ADD CONSTRAINT "vr_question_len_chk" CHECK (char_length(question) <= 1000);--> statement-breakpoint
ALTER TABLE "verification_requests" ADD CONSTRAINT "vr_freshness_chk" CHECK (freshness_max_age_s between 60 and 3600);
