// Supabase setup (12-deploy-runbook §3): private evidence buckets with size/type limits (01 §4.7),
// and the pg_cron job that calls /api/internal/tick every minute (02 §4.1).
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... run supabase-setup.ts --app-url https://<app> [--print-cron-sql]
// The cron SQL contains INTERNAL_CRON_SECRET; it is printed to run once in the Supabase SQL editor, never saved.
import { createClient } from "@supabase/supabase-js";
import { args, need } from "./lib.ts";

const a = args();
const url = process.env.SUPABASE_URL ?? need(a, "supabase-url");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!key) {
  console.error("SUPABASE_SERVICE_ROLE_KEY is required");
  process.exit(2);
}
const sb = createClient(url, key, { auth: { persistSession: false } });
for (const id of ["evidence-raw", "evidence-derived"]) {
  const opts = { public: false, fileSizeLimit: 8 * 1024 * 1024, allowedMimeTypes: ["image/jpeg"] };
  const existing = await sb.storage.getBucket(id);
  const r = existing.data ? await sb.storage.updateBucket(id, opts) : await sb.storage.createBucket(id, opts);
  if (r.error) {
    console.error(`${id}: ${r.error.message}`);
    process.exit(1);
  }
  console.log(`bucket ${id}: private, 8 MiB, image/jpeg`);
}

if (a["print-cron-sql"] === "true") {
  const appUrl = need(a, "app-url").replace(/\/$/, "");
  const secret = process.env.INTERNAL_CRON_SECRET;
  if (!secret) {
    console.error("INTERNAL_CRON_SECRET is required to print the cron SQL");
    process.exit(2);
  }
  console.log(`
-- Run once in the Supabase SQL editor.
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule('proofmarket-tick') where exists (select 1 from cron.job where jobname = 'proofmarket-tick');
select cron.schedule('proofmarket-tick', '* * * * *', $$
  select net.http_post(
    url := '${appUrl}/api/internal/tick',
    headers := jsonb_build_object('x-internal-secret', '${secret}', 'content-type', 'application/json'),
    body := '{}'::jsonb,
    timeout_milliseconds := 55000
  );
$$);`);
}
process.exit(0);
