BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT no_plan();

SELECT has_table('public', 'operational_alerts', 'operational alert ledger exists');
SELECT has_table('public', 'import_runs', 'import-run ledger exists');
SELECT ok(
  (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'public.operational_alerts'::regclass),
  'operational alerts use forced RLS'
);
SELECT ok(
  (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'public.import_runs'::regclass),
  'import runs use forced RLS'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.operational_alerts', 'SELECT'),
  'authenticated clients cannot read operational alerts'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.import_runs', 'SELECT'),
  'authenticated clients cannot read import runs'
);
SELECT ok(
  has_table_privilege('service_role', 'public.operational_alerts', 'SELECT,INSERT,UPDATE,DELETE'),
  'service role manages operational alerts'
);
SELECT ok(
  has_table_privilege('service_role', 'public.import_runs', 'SELECT,INSERT,UPDATE,DELETE'),
  'service role manages import runs'
);

SELECT ok(
  NOT has_function_privilege('authenticated', 'public.record_operational_alert(text,text,text,text,text,text,text,jsonb)', 'EXECUTE'),
  'authenticated clients cannot record operational alerts'
);
SELECT ok(
  has_function_privilege('service_role', 'public.record_operational_alert(text,text,text,text,text,text,text,jsonb)', 'EXECUTE'),
  'service role can record operational alerts'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.begin_import_run(text,text,uuid)', 'EXECUTE'),
  'authenticated clients cannot begin import runs'
);
SELECT ok(
  has_function_privilege('service_role', 'public.begin_import_run(text,text,uuid)', 'EXECUTE'),
  'service role can begin import runs'
);

INSERT INTO public.users (id, wp_user_id, wp_site, email, display_name)
VALUES ('22000000-0000-0000-0000-000000000001', 2201, 'both', 'observability@example.test', 'Observability');

SELECT lives_ok(
  $$SELECT public.record_operational_alert(
    'cron:wp-sync:task',
    'critical',
    'cron',
    'cron.task_failed',
    'http_500',
    'WordPress synchronization failed.',
    'Open Settings > Sync and run WordPress sync after checking connectivity.',
    '{"job":"wp-sync"}'::jsonb
  )$$,
  'operational failures can be recorded without raw exception text'
);
SELECT is(
  (SELECT occurrence_count FROM public.operational_alerts WHERE fingerprint = 'cron:wp-sync:task'),
  1,
  'first alert occurrence starts at one'
);

SELECT lives_ok(
  $$SELECT public.record_operational_alert(
    'cron:wp-sync:task',
    'critical',
    'cron',
    'cron.task_failed',
    'http_502',
    'WordPress synchronization failed.',
    'Open Settings > Sync and run WordPress sync after checking connectivity.',
    '{"job":"wp-sync"}'::jsonb
  )$$,
  'repeated alert updates the stable fingerprint'
);
SELECT is(
  (SELECT occurrence_count FROM public.operational_alerts WHERE fingerprint = 'cron:wp-sync:task'),
  2,
  'open repeated alert increments occurrence count'
);
SELECT is(
  (SELECT error_code FROM public.operational_alerts WHERE fingerprint = 'cron:wp-sync:task'),
  'http_502',
  'repeated alert retains the latest safe error code'
);

SELECT ok(
  public.resolve_operational_alert('cron:wp-sync:task'),
  'successful recovery resolves an open alert'
);
SELECT ok(
  (SELECT resolved_at IS NOT NULL FROM public.operational_alerts WHERE fingerprint = 'cron:wp-sync:task'),
  'resolved alert records its recovery timestamp'
);
SELECT ok(
  NOT public.resolve_operational_alert('cron:wp-sync:task'),
  'resolving an already-resolved alert is idempotent'
);

SELECT lives_ok(
  $$SELECT public.record_operational_alert(
    'cron:wp-sync:task',
    'warning',
    'cron',
    'cron.task_failed',
    'timeout',
    'WordPress synchronization timed out.',
    'Retry WordPress sync from Settings > Sync.',
    '{"job":"wp-sync"}'::jsonb
  )$$,
  'a later incident reopens the stable alert'
);
SELECT is(
  (SELECT occurrence_count FROM public.operational_alerts WHERE fingerprint = 'cron:wp-sync:task'),
  1,
  'a reopened incident starts a new occurrence count'
);
SELECT ok(
  (SELECT resolved_at IS NULL FROM public.operational_alerts WHERE fingerprint = 'cron:wp-sync:task'),
  'repeated incident is open again'
);

SELECT lives_ok(
  $$SELECT public.begin_import_run(
    'raptive',
    'observability.xlsx',
    '22000000-0000-0000-0000-000000000001'
  )$$,
  'service-side import workflow can begin a durable run'
);
SELECT is(
  (SELECT count(*)::integer FROM public.import_runs WHERE file_name = 'observability.xlsx' AND status = 'running'),
  1,
  'new import run is visibly running'
);

INSERT INTO public.import_runs (
  id, import_type, file_name, requested_by
) VALUES (
  '22100000-0000-0000-0000-000000000001',
  'raptive',
  'failed.xlsx',
  '22000000-0000-0000-0000-000000000001'
);
SELECT ok(
  public.finish_import_run(
    '22100000-0000-0000-0000-000000000001',
    false,
    NULL,
    'database_unavailable',
    '{"stage":"commit"}'::jsonb
  ),
  'failed import run can be completed with a safe code'
);
SELECT is(
  (SELECT status FROM public.import_runs WHERE id = '22100000-0000-0000-0000-000000000001'),
  'failed',
  'failed import remains visible'
);
SELECT is(
  (SELECT error_code FROM public.import_runs WHERE id = '22100000-0000-0000-0000-000000000001'),
  'database_unavailable',
  'failed import stores a bounded safe error code'
);
SELECT ok(
  NOT public.finish_import_run(
    '22100000-0000-0000-0000-000000000001',
    true,
    10,
    NULL,
    '{}'::jsonb
  ),
  'completed import outcome cannot be overwritten'
);

SELECT * FROM finish();
ROLLBACK;
