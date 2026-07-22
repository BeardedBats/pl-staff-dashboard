BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT no_plan();

SELECT ok(
  (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid = 'public.raptive_connections'::regclass),
  'Raptive connection state has forced row-level security'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.raptive_connections', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.raptive_connections', 'SELECT'),
  'client roles cannot read Raptive connection state'
);
SELECT ok(
  has_table_privilege('service_role', 'public.raptive_connections', 'SELECT,INSERT,UPDATE,DELETE'),
  'service role can manage Raptive connection state'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.configure_raptive_connection(text,text,text,text,uuid)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.set_raptive_connection_enabled(text,boolean)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.fail_raptive_live_sync(text,text,date,text)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.commit_raptive_live_sync(text,text,date,jsonb,jsonb)', 'EXECUTE')
  AND NOT has_function_privilege('authenticated', 'public.assign_raptive_revenue_site()', 'EXECUTE'),
  'authenticated clients cannot invoke Raptive control or write RPCs'
);
SELECT ok(
  has_function_privilege('service_role', 'public.configure_raptive_connection(text,text,text,text,uuid)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.set_raptive_connection_enabled(text,boolean)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.fail_raptive_live_sync(text,text,date,text)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.commit_raptive_live_sync(text,text,date,jsonb,jsonb)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.assign_raptive_revenue_site()', 'EXECUTE'),
  'service role can invoke Raptive control and write RPCs'
);

INSERT INTO public.users (id, wp_user_id, wp_site, email, display_name)
VALUES ('27000000-0000-0000-0000-000000000001', 2701, 'pl', 'raptive-27@example.test', 'Raptive 27');
INSERT INTO public.tiers (id, name, label, sort_order)
VALUES ('27000000-0000-0000-0000-000000000002', 'raptive-27-tier', 'Raptive 27 Tier', 2701);
INSERT INTO public.entries (id, title, site, tier_id, created_by)
VALUES (
  '27000000-0000-0000-0000-000000000003',
  'Raptive site attribution probe',
  'pl',
  '27000000-0000-0000-0000-000000000002',
  '27000000-0000-0000-0000-000000000001'
);
INSERT INTO public.raptive_revenue (
  entry_id, date, page_url, earnings, rpm, page_rpm, sessions, pageviews
) VALUES (
  '27000000-0000-0000-0000-000000000003',
  '2026-07-19',
  'https://pitcherlist.com/attributed/',
  1, 1, 1, 0, 1
);
SELECT is(
  (SELECT wp_site FROM public.raptive_revenue WHERE page_url = 'https://pitcherlist.com/attributed/'),
  'pl',
  'historical rows inherit site attribution from their matched entry'
);

SELECT public.configure_raptive_connection(
  'pl', 'raptive-pl', 'Pitcher List', 'https://pitcherlist.com', NULL
);
SELECT public.configure_raptive_connection(
  'qb', 'raptive-qb', 'QB List', 'https://football.pitcherlist.com', NULL
);
SELECT is(
  (SELECT enabled FROM public.raptive_connections WHERE wp_site = 'pl'),
  false,
  'new connections remain disabled until explicitly enabled'
);
SELECT ok(public.set_raptive_connection_enabled('pl', true), 'PL connection can be enabled');
SELECT ok(public.set_raptive_connection_enabled('qb', true), 'QB connection can be enabled');

INSERT INTO public.raptive_revenue (
  date, page_url, earnings, rpm, page_rpm, sessions, pageviews, wp_site
) VALUES
  ('2026-07-20', 'https://pitcherlist.com/old/', 99, 1, 1, 0, 1, 'pl'),
  ('2026-07-20', 'https://football.pitcherlist.com/preserved/', 88, 1, 1, 0, 1, 'qb');

SELECT is(
  public.commit_raptive_live_sync(
    'pl',
    'raptive-pl',
    '2026-07-20',
    '[
      {"entry_id":null,"date":"2026-07-20","page_url":"https://pitcherlist.com/a/","earnings":10.25,"rpm":5,"page_rpm":5,"sessions":0,"pageviews":100},
      {"entry_id":null,"date":"2026-07-20","page_url":"https://pitcherlist.com/b/","earnings":20.75,"rpm":6,"page_rpm":6,"sessions":0,"pageviews":200}
    ]'::jsonb,
    '{"api_rows":2,"canonical_rows":2,"matched_rows":0,"unmatched_rows":2,"total_earnings":31}'::jsonb
  ),
  2,
  'daily live sync returns its exact inserted row count'
);
SELECT is(
  (SELECT count(*)::integer FROM public.raptive_revenue WHERE wp_site = 'pl' AND date = '2026-07-20'),
  2,
  'live sync replaces only the requested PL day'
);
SELECT is(
  (SELECT count(*)::integer FROM public.raptive_revenue WHERE page_url = 'https://football.pitcherlist.com/preserved/'),
  1,
  'PL replacement preserves the QB resource boundary'
);
SELECT is(
  (SELECT last_row_count FROM public.raptive_connections WHERE wp_site = 'pl'),
  2,
  'connection state reconciles the inserted row count'
);
SELECT is(
  (SELECT last_earnings FROM public.raptive_connections WHERE wp_site = 'pl'),
  31.0000::numeric,
  'connection state reconciles total earnings from inserted rows'
);
SELECT is(
  (SELECT last_successful_date FROM public.raptive_connections WHERE wp_site = 'pl'),
  '2026-07-20'::date,
  'connection state records the successful calendar day'
);

SELECT throws_ok(
  $$SELECT public.commit_raptive_live_sync(
    'pl', 'raptive-pl', '2026-07-20',
    '[
      {"entry_id":null,"date":"2026-07-20","page_url":"https://pitcherlist.com/duplicate/","earnings":1,"rpm":1,"page_rpm":1,"sessions":0,"pageviews":1},
      {"entry_id":null,"date":"2026-07-20","page_url":"https://pitcherlist.com/duplicate/","earnings":2,"rpm":2,"page_rpm":2,"sessions":0,"pageviews":2}
    ]'::jsonb,
    '{}'::jsonb
  )$$,
  '22023',
  'raptive_duplicate_rows',
  'database rejects duplicate page identities defensively'
);
SELECT is(
  (SELECT sum(earnings) FROM public.raptive_revenue WHERE wp_site = 'pl' AND date = '2026-07-20'),
  31.0000::numeric,
  'failed validation leaves the prior committed day intact'
);

INSERT INTO public.raptive_revenue (
  date, page_url, earnings, rpm, page_rpm, sessions, pageviews
) VALUES (
  '2026-07-21', '/unattributed-historical/', 7, 1, 1, 0, 1
);
SELECT throws_ok(
  $$SELECT public.commit_raptive_live_sync(
    'pl', 'raptive-pl', '2026-07-21',
    '[{"entry_id":null,"date":"2026-07-21","page_url":"https://pitcherlist.com/live/","earnings":5,"rpm":1,"page_rpm":1,"sessions":0,"pageviews":1}]'::jsonb,
    '{}'::jsonb
  )$$,
  '22023',
  'raptive_unattributed_overlap',
  'live sync refuses an overlapping historical day with ambiguous site attribution'
);
SELECT is(
  (SELECT earnings FROM public.raptive_revenue WHERE page_url = '/unattributed-historical/'),
  7.0000::numeric,
  'ambiguous overlap refusal preserves the historical row'
);

SELECT ok(
  public.fail_raptive_live_sync('pl', 'raptive-pl', '2026-07-21', 'raptive_http_429'),
  'enabled matching connection records a safe failure code'
);
SELECT is(
  (SELECT last_error_code FROM public.raptive_connections WHERE wp_site = 'pl'),
  'raptive_http_429',
  'failure state exposes only the safe code'
);

SELECT ok(public.set_raptive_connection_enabled('pl', false), 'PL connection can be disabled');
SELECT throws_ok(
  $$SELECT public.commit_raptive_live_sync(
    'pl', 'raptive-pl', '2026-07-21', '[]'::jsonb, '{}'::jsonb
  )$$,
  '42501',
  'raptive_connection_disabled',
  'disabled connection cannot write financial rows'
);
SELECT is(
  (SELECT count(*)::integer FROM public.raptive_revenue WHERE wp_site = 'pl' AND date = '2026-07-21'),
  0,
  'disabled write attempt leaves the requested day untouched'
);

SELECT public.configure_raptive_connection(
  'pl', 'raptive-pl-new', 'Pitcher List', 'https://pitcherlist.com', NULL
);
SELECT ok(
  (SELECT NOT enabled AND last_successful_date IS NULL AND last_error_code IS NULL
   FROM public.raptive_connections WHERE wp_site = 'pl'),
  'reconfiguration disables the connector and clears stale reconciliation state'
);

SELECT * FROM finish();
ROLLBACK;
