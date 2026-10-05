-- Public map (01 §4.22): the requester may publish a result. Off unless asked for.
ALTER TABLE "verification_requests" ADD COLUMN "publish_result" boolean DEFAULT false NOT NULL;
