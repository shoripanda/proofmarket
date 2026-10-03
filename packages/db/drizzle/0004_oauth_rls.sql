-- 0003 added the OAuth tables without the RLS that 0001 gives every other table (04 §1).
-- Same rule: RLS on, no policies, so PostgREST's anon/authenticated roles read nothing.
ALTER TABLE "oauth_clients" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "oauth_codes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "oauth_tokens" ENABLE ROW LEVEL SECURITY;
