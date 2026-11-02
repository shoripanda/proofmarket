// Supabase setup (12-deploy-runbook §3): private evidence buckets with size/type limits (01 §4.7, 16 §9),
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
const photo = { public: false, fileSizeLimit: 8 * 1024 * 1024, allowedMimeTypes: ["image/jpeg"] };
// Sensory audio clips (docs/architecture 16 §9): their own bucket, 2 MiB, the two formats phones record.
const audio = {
  public: false,
  fileSizeLimit: 2 * 1024 * 1024,
  allowedMimeTypes: ["audio/mp4", "audio/webm"],
};
for (const [id, opts] of [
  ["evidence-raw", photo],
  ["evidence-derived", photo],
  ["evidence-audio", audio],
] as const) {
  const o = { ...opts, allowedMimeTypes: [...opts.allowedMimeTypes] };
  const existing = await sb.storage.getBucket(id);
  const r = existing.data ? await sb.storage.updateBucket(id, o) : await sb.storage.createBucket(id, o);
  if (r.error) {
    console.error(`${id}: ${r.error.message}`);
    process.exit(1);
  }
  console.log(
    `bucket ${id}: private, ${o.fileSizeLimit / 1024 / 1024} MiB, ${o.allowedMimeTypes.join(", ")}`,
  );
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
