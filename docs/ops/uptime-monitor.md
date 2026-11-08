# Uptime monitor with phone alerts

**Why:** the GitHub Actions check (`.github/workflows/uptime.yml`) asks for every 5 minutes, but GitHub throttles scheduled runs. In November 2026 it ran every 4 to 7 hours. When Vercel paused the team on 2026-11-06, the site answered 402 for almost two days before anyone noticed. GitHub's failure email was the only alert.

**What:** an outside uptime service checks `/v1/health/ready` every 5 minutes and sends a push alert to the owner's phone. The GitHub job stays as a backup.

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

UptimeRobot's free plan is enough (5-minute checks and push alerts from its phone app). Any service that checks an HTTPS URL and alerts on non-2xx works the same way.

1. Sign up at https://uptimerobot.com.
2. Add a monitor: type **HTTP(s)**, URL `https://proofmarket.fun/v1/health/ready`, interval **5 minutes**, timeout **30 seconds**.
3. Install the UptimeRobot app on the phone, sign in, and allow notifications. Add the app as an alert contact on the monitor (email can stay as a second contact).
4. Test once: pause the monitor and resume it, or point a second monitor at `https://proofmarket.fun/v1/health/ready-nonexistent` (404) for a minute and check that the phone alert arrives. Delete the test monitor afterwards.

## What not to do

- Do not monitor more often than every few minutes. Each check runs a function on Vercel. The ready check does four small queries; every 5 minutes costs very little, but every 30 seconds adds up (see the 2026-11-08 Hobby CPU entry in the CLAUDE.md failure log).
- Do not point the monitor at `/` (the top page renders on every request and is heavier than the ready check).
