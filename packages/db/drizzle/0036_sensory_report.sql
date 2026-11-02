-- Sensory reports (docs/architecture 16): the five senses as a verification type. Keys that already allow every
-- earlier type are given the new one too; keys limited to some types stay as they are.
ALTER TABLE "verification_requests" DROP CONSTRAINT "vr_type_chk";--> statement-breakpoint
ALTER TABLE "verification_requests" ADD CONSTRAINT "vr_type_chk" CHECK (type in ('PLACE_STATUS_VERIFICATION','QUEUE_LENGTH','NOTICE_POSTED','CROWD_LEVEL','SEAT_AVAILABILITY','PARKING_AVAILABILITY','STOCK_CHECK','PRICE_CHECK','SIGN_TRANSCRIPTION','SITE_REPORT','DOCUMENT_TRANSCRIPTION','DOCUMENT_QA','PRODUCT_INSPECTION','PHONE_INQUIRY','MEASUREMENT','CUSTOM_CHOICE','CUSTOM_TASK','SENSORY_REPORT'));--> statement-breakpoint
UPDATE "requester_credentials" SET "allowed_task_types" = array_append("allowed_task_types", 'SENSORY_REPORT')
WHERE "allowed_task_types" @> ARRAY['PLACE_STATUS_VERIFICATION','QUEUE_LENGTH','NOTICE_POSTED','CROWD_LEVEL','SEAT_AVAILABILITY','PARKING_AVAILABILITY','STOCK_CHECK','PRICE_CHECK','SIGN_TRANSCRIPTION','SITE_REPORT','DOCUMENT_TRANSCRIPTION','DOCUMENT_QA','PRODUCT_INSPECTION','PHONE_INQUIRY','MEASUREMENT','CUSTOM_CHOICE','CUSTOM_TASK']::text[]
  AND NOT ('SENSORY_REPORT' = ANY("allowed_task_types"));
