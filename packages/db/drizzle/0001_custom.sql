-- Custom SQL that Drizzle cannot express (04-database-design.md §1, §3.15, §3.19).

-- audit_events is append-only. Retention purges temporarily disable this trigger via the operator runbook (08 §6).
CREATE FUNCTION forbid_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only';
END $$;
--> statement-breakpoint
CREATE TRIGGER audit_events_append_only BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION forbid_audit_mutation();
--> statement-breakpoint

-- Supabase exposes tables through PostgREST. Enable RLS with NO policies so anon/authenticated roles
-- can read nothing; the server connects directly with a privileged role.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'principals','requester_credentials','requester_ledger','places','webhook_endpoints',
    'verification_requests','workers','worker_consents','invite_codes','claims','challenges','uploads',
    'witness_submissions','evidence_objects','location_observations','evidence_checks',
    'verification_results','payment_records','audit_events','idempotency_keys','outbox_jobs',
    'webhook_deliveries','platform_flags','rate_limit_counters'
  ] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
  END LOOP;
END $$;
--> statement-breakpoint

-- Kill switches start enabled (08 §6).
INSERT INTO platform_flags (key, value, updated_by) VALUES
  ('tasks_create_enabled', true, 'migration'),
  ('claims_enabled', true, 'migration'),
  ('settlement_enabled', true, 'migration'),
  ('public_evidence_enabled', true, 'migration')
ON CONFLICT (key) DO NOTHING;
