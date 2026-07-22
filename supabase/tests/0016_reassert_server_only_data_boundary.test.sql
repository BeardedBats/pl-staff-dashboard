BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(15);

SELECT is(
  (SELECT count(*)::integer FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity),
  0,
  'every public table has RLS enabled'
);
SELECT is(
  (SELECT count(*)::integer FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND NOT c.relforcerowsecurity),
  0,
  'every public table forces RLS'
);
SELECT ok((SELECT relforcerowsecurity FROM pg_class WHERE oid = 'public.cron_runs'::regclass), 'cron ledger forces RLS');

SELECT is(
  (SELECT count(*)::integer FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND has_table_privilege('anon', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')),
  0,
  'anon has no public table privileges'
);
SELECT is(
  (SELECT count(*)::integer FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p') AND has_table_privilege('authenticated', c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')),
  0,
  'authenticated has no public table privileges'
);

SELECT is(
  (SELECT count(*)::integer FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND has_function_privilege('anon', p.oid, 'EXECUTE')),
  0,
  'anon cannot execute public functions'
);
SELECT is(
  (SELECT count(*)::integer FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND has_function_privilege('authenticated', p.oid, 'EXECUTE')),
  0,
  'authenticated cannot execute public functions'
);
SELECT is(
  (SELECT count(*)::integer FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'public' AND NOT has_function_privilege('service_role', p.oid, 'EXECUTE')),
  0,
  'service role can execute every server function'
);
SELECT ok(NOT has_function_privilege('anon', 'public.get_analytics_overview(date,date,text,uuid,uuid,uuid)', 'EXECUTE'), 'analytics RPC is not public');
SELECT ok(NOT has_function_privilege('authenticated', 'public.set_updated_at()', 'EXECUTE'), 'trigger helper is not directly authenticated-callable');

SELECT is((SELECT count(*)::integer FROM storage.buckets WHERE id = 'graphics'), 1, 'graphics bucket exists');
SELECT ok(NOT (SELECT public FROM storage.buckets WHERE id = 'graphics'), 'graphics bucket is private');
SELECT is((SELECT file_size_limit FROM storage.buckets WHERE id = 'graphics'), 10485760::bigint, 'graphics bucket enforces the 10 MB limit');
SELECT is(
  (SELECT allowed_mime_types FROM storage.buckets WHERE id = 'graphics'),
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']::text[],
  'graphics bucket enforces the image MIME allowlist'
);
SELECT is(
  (SELECT count(*)::integer FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects'),
  0,
  'storage objects have no direct client policies'
);

SELECT * FROM finish();
ROLLBACK;
