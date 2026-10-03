-- Two more task types visible from outside a shop (01 §4.8). Accepted only for keys that allow them.
ALTER TABLE "verification_requests" DROP CONSTRAINT "vr_type_chk";
--> statement-breakpoint
ALTER TABLE "verification_requests" ADD CONSTRAINT "vr_type_chk" CHECK (type in ('PLACE_STATUS_VERIFICATION','QUEUE_LENGTH','NOTICE_POSTED'));
