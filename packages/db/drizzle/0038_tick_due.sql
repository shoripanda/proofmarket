-- Lean tick (2026-11-08): pg_cron asks this function every minute and calls /api/internal/tick only when it
-- returns true, so an idle minute costs the app nothing. On 2026-11-06 the once-a-minute tick used up the Vercel
-- Hobby CPU allowance and the team was paused.
--
-- true when any tick step has something to do now, or when no tick has run for `idle_max` (the periodic pass:
-- deposit polling, discarding unfinished uploads, operator warnings, the daily purge and reconcile, cancelled
-- general tasks). Each line mirrors one step in apps/web/lib/services/jobs.ts; a step missing here still runs
-- within `idle_max`. Any error answers true, so a broken gate never stops the tick.
CREATE FUNCTION proofmarket_tick_due(at timestamptz DEFAULT now(), idle_max interval DEFAULT interval '15 minutes')
RETURNS boolean LANGUAGE plpgsql STABLE AS $$
BEGIN
  RETURN
    -- periodic pass
    NOT EXISTS (SELECT 1 FROM tick_runs WHERE started_at > at - idle_max)
    -- 7. jobs due, or leases that expired
    OR EXISTS (SELECT 1 FROM outbox_jobs
                WHERE (state = 'PENDING' AND run_after <= at) OR (state = 'RUNNING' AND locked_until < at))
    -- 2. task deadlines
    OR EXISTS (SELECT 1 FROM verification_requests
                WHERE status IN ('FUNDED', 'OPEN', 'CLAIMED', 'SUBMITTED') AND deadline <= at
                  AND provisional_at IS NULL)
    -- 1. optimistic answers whose challenge window closed, and challenges whose recheck has a result
    OR EXISTS (SELECT 1 FROM verification_requests vr
                WHERE vr.status = 'SUBMITTED' AND vr.provisional_at IS NOT NULL
                  AND vr.provisional_at + vr.challenge_minutes * interval '1 minute' <= at
                  AND NOT EXISTS (SELECT 1 FROM verification_challenges vc WHERE vc.verification_id = vr.id))
    OR EXISTS (SELECT 1 FROM verification_challenges vc
                 JOIN verification_results r ON r.verification_id = vc.recheck_verification_id
                WHERE vc.state = 'OPEN')
    -- 0. submissions the outside reviewer never answered (REVIEW_WAIT_MAX_MS = 30 min)
    OR EXISTS (SELECT 1 FROM witness_submissions
                WHERE state = 'CHECKING' AND server_received_at <= at - interval '30 minutes')
    -- 3. claims and challenges past expiry
    OR EXISTS (SELECT 1 FROM claims c
                WHERE c.state = 'ACTIVE' AND c.expires_at <= at
                  AND NOT EXISTS (SELECT 1 FROM witness_submissions ws
                                   WHERE ws.claim_id = c.id AND ws.state = 'CHECKING'))
    OR EXISTS (SELECT 1 FROM challenges WHERE state = 'ISSUED' AND expires_at <= at)
    -- 5. recurring checks that are due
    OR EXISTS (SELECT 1 FROM verification_schedules WHERE active AND next_run_at <= at)
    -- 5b. general tasks, only while the feature is on (sweepMarketTasks returns early otherwise)
    OR (COALESCE((SELECT value FROM platform_flags WHERE key = 'tasks_enabled'), false) AND (
         EXISTS (SELECT 1 FROM task_seats
                  WHERE (state = 'IN_REVIEW' AND review_due_at <= at) OR (state = 'ASSIGNED' AND due_at <= at))
      OR EXISTS (SELECT 1 FROM market_tasks WHERE (status = 'OPEN' AND deadline <= at) OR status = 'CLOSED')));
EXCEPTION WHEN OTHERS THEN
  RETURN true;
END
$$;
