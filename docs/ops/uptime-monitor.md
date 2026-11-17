# Uptime monitor with phone alerts

**Why:** the GitHub Actions check (`.github/workflows/uptime.yml`) asks for every 5 minutes, but GitHub throttles scheduled runs. In November 2026 it ran every 4 to 7 hours. When Vercel paused the team on 2026-11-06, the site answered 402 for almost two days before anyone noticed. GitHub's failure email was the only alert.

**What:** Better Stack (free plan) checks `/v1/health/ready` every 5 minutes and sends a push alert to the owner's phone. `scripts/betterstack-monitors.ts` creates the monitor, so its settings live in the repo. The GitHub job stays as a backup.

## What the endpoint tells the monitor

`GET https://proofmarket.fun/v1/health/ready` answers **200** when everything is fine and **503** otherwise. So the monitor only has to look at the status code: no keyword match is needed. A 503 means one of these failed:

| Check | Fails when |
|---|---|
| `database` | the database does not answer |
| `jobs_draining` | a job has waited more than 5 minutes |
| `deadlines_on_time` | a task deadline passed without being handled |
| `no_dead_jobs` | a job gave up after its retries |
| `tick_recent` | no tick started for 25 minutes (pg_cron or its gate stopped; the idle tick runs every 15 minutes) |

A Vercel pause (402), a DNS failure or a timeout also counts as down.

## Setup (owner, about 5 minutes)

1. Sign up at https://betterstack.com (free plan).
2. Install the Better Stack app on the phone, sign in and allow notifications. Push goes to team members who have the app.
3. Create an Uptime API token under Settings → API tokens and add `BETTERSTACK_API_TOKEN=<token>` to `~/.config/proofmarket/env.accounts`. Never put it in the repo.
4. Create the monitor:

   ```sh
   set -a && source ~/.config/proofmarket/env.accounts && set +a
   pnpm --filter @proofmarket/scripts run run betterstack-monitors.ts --dry-run   # shows create/update
   pnpm --filter @proofmarket/scripts run run betterstack-monitors.ts
   ```

   It is safe to run again: a monitor with the same URL is updated, not duplicated. It checks every 5 minutes with a 30-second timeout, re-checks once before raising an incident, and alerts by email and push.
5. Test once: pause and resume the monitor in the Better Stack app, or add a temporary monitor for `https://proofmarket.fun/v1/health/ready-nonexistent` (404) and check that the phone alert arrives. Delete the test monitor afterwards.

Any other service that checks an HTTPS URL and alerts on non-2xx (UptimeRobot's free plan, for example) works the same way if Better Stack is not wanted; set it up by hand with the same URL, interval and timeout.

## What not to do

- Do not monitor more often than every few minutes. Each check runs a function on Vercel. The ready check does four small queries; every 5 minutes costs very little, but every 30 seconds adds up (see the 2026-11-08 Hobby CPU entry in the CLAUDE.md failure log).
- Do not point the monitor at `/` (the top page renders on every request and is heavier than the ready check).
