-- Results the operator lists on the site's top page (05 §4). Null = not listed.
ALTER TABLE "verification_requests" ADD COLUMN "featured_at" timestamp with time zone;
