// Create or update the outside uptime monitors in Better Stack (12 §5 step 5). Safe to run again: a monitor with
// the same URL is updated, not duplicated.
//   BETTERSTACK_API_TOKEN=... run betterstack-monitors.ts            # apply
//   BETTERSTACK_API_TOKEN=... run betterstack-monitors.ts --dry-run  # show what would change
// The token is the "Uptime API token" (Better Stack → Settings → API tokens). Keep it in
// ~/.config/proofmarket/env.accounts, never in the repo.
//
// Why not only GitHub Actions: scheduled workflows are thinned out by GitHub. The "every 5 minutes" uptime.yml
// actually ran every 4–7 hours, and the 2026-11-06..08 outage went unnoticed for almost two days.
import { args } from "./lib.ts";

const API = "https://uptime.betterstack.com/api/v2/monitors";
const token = process.env.BETTERSTACK_API_TOKEN;
if (!token) {
  console.error("BETTERSTACK_API_TOKEN is required (Better Stack → Settings → API tokens → Uptime)");
  process.exit(2);
}
const dryRun = "dry-run" in args();

// What the free plan allows: 3-minute checks, email and push to the Better Stack phone app (no SMS or calls).
const common = {
  monitor_type: "status", // up when the answer is 2xx
  check_frequency: 180,
  request_timeout: 30,
  confirmation_period: 60, // re-check once before raising an incident, so one slow answer does not page
  recovery_period: 180,
  follow_redirects: true,
  email: true,
  push: true,
  sms: false,
  call: false,
  regions: ["us", "as"],
};

const monitors = [
  // DB answers and the job queue keeps up (apps/web/app/v1/health/ready). 503 tells which check failed.
  { pronounceable_name: "ProofMarket ready", url: "https://proofmarket.fun/v1/health/ready" },
  // The site itself, so a Vercel block (402) or DNS problem is told apart from an app problem.
  { pronounceable_name: "ProofMarket site", url: "https://proofmarket.fun/" },
];

async function call(method: string, url: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${text}`);
  return text ? JSON.parse(text) : {};
}

for (const m of monitors) {
  const want = { ...common, ...m };
  const found = await call("GET", `${API}?url=${encodeURIComponent(m.url)}`);
  const existing = (found.data ?? []).find((d: { attributes: { url: string } }) => d.attributes.url === m.url);
  if (dryRun) {
    console.log(`${existing ? `update ${existing.id}` : "create"}  ${m.url}`);
    continue;
  }
  const r = existing
    ? await call("PATCH", `${API}/${existing.id}`, want)
    : await call("POST", API, want);
  console.log(`${existing ? "updated" : "created"} ${r.data.id}  ${m.url}  status=${r.data.attributes.status}`);
}
process.exit(0);
