BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT no_plan();

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.commit_raptive_import(uuid,jsonb,date,date,text,uuid,jsonb)',
    'EXECUTE'
  ),
  'authenticated clients cannot invoke the historical financial import'
);
SELECT ok(
  has_function_privilege(
    'service_role',
    'public.commit_raptive_import(uuid,jsonb,date,date,text,uuid,jsonb)',
    'EXECUTE'
  ),
  'service role retains historical financial import access'
);

INSERT INTO public.users (id, wp_user_id, wp_site, email, display_name)
VALUES ('28000000-0000-0000-0000-000000000001', 2801, 'both', 'raptive-28@example.test', 'Raptive 28');
INSERT INTO public.tiers (id, name, label, sort_order)
VALUES ('28000000-0000-0000-0000-000000000002', 'raptive-28-tier', 'Raptive 28 Tier', 2801);
INSERT INTO public.entries (id, title, site, tier_id, created_by, wp_post_url)
VALUES
  ('28000000-0000-0000-0000-000000000003', 'PL import probe', 'pl', '28000000-0000-0000-0000-000000000002', '28000000-0000-0000-0000-000000000001', 'https://pitcherlist.com/shared/'),
  ('28000000-0000-0000-0000-000000000004', 'QB import probe', 'qb', '28000000-0000-0000-0000-000000000002', '28000000-0000-0000-0000-000000000001', 'https://football.pitcherlist.com/shared/');

INSERT INTO public.raptive_revenue (
  wp_site, date, page_url, earnings, rpm, page_rpm, sessions, pageviews
) VALUES ('qb', '2026-01-01', '/preserved/', 9, 1, 1, 1, 1);
INSERT INTO public.import_runs (id, import_type, file_name, requested_by)
VALUES ('28000000-0000-0000-0000-000000000010', 'raptive', 'pl-only.xlsx', '28000000-0000-0000-0000-000000000001');

SELECT is(
  public.commit_raptive_import(
    '28000000-0000-0000-0000-000000000010',
    '[{"wp_site":"pl","entry_id":"28000000-0000-0000-0000-000000000003","date":"2026-01-01","page_url":"/shared/","earnings":2,"rpm":1,"page_rpm":1,"sessions":1,"pageviews":1}]'::jsonb,
    '2026-01-01', '2026-01-01', 'pl-only.xlsx',
    '28000000-0000-0000-0000-000000000001', '{}'::jsonb
  ),
  1,
  'a one-site historical replacement commits its exact row count'
);
SELECT is(
  (SELECT count(*)::integer FROM public.raptive_revenue WHERE wp_site = 'qb' AND page_url = '/preserved/'),
  1,
  'a PL historical replacement preserves QB rows in the same date range'
);

INSERT INTO public.import_runs (id, import_type, file_name, requested_by)
VALUES ('28000000-0000-0000-0000-000000000011', 'raptive', 'both-sites.xlsx', '28000000-0000-0000-0000-000000000001');
SELECT is(
  public.commit_raptive_import(
    '28000000-0000-0000-0000-000000000011',
    '[
      {"wp_site":"pl","entry_id":null,"date":"2026-01-02","page_url":"/","earnings":2,"rpm":1,"page_rpm":1,"sessions":1,"pageviews":1},
      {"wp_site":"qb","entry_id":null,"date":"2026-01-02","page_url":"/","earnings":3,"rpm":1,"page_rpm":1,"sessions":1,"pageviews":1}
    ]'::jsonb,
    '2026-01-02', '2026-01-02', 'both-sites.xlsx',
    '28000000-0000-0000-0000-000000000001', '{}'::jsonb
  ),
  2,
  'identical paths remain separate financial rows for PL and QB'
);
SELECT results_eq(
  $$SELECT wp_site FROM public.raptive_revenue WHERE date = '2026-01-02' ORDER BY wp_site$$,
  $$VALUES ('pl'::text), ('qb'::text)$$,
  'both source-site identities are persisted'
);

INSERT INTO public.import_runs (id, import_type, file_name, requested_by)
VALUES ('28000000-0000-0000-0000-000000000012', 'raptive', 'mismatch.xlsx', '28000000-0000-0000-0000-000000000001');
SELECT throws_ok(
  $$SELECT public.commit_raptive_import(
    '28000000-0000-0000-0000-000000000012',
    '[{"wp_site":"qb","entry_id":"28000000-0000-0000-0000-000000000003","date":"2026-01-03","page_url":"/shared/","earnings":2,"rpm":1,"page_rpm":1,"sessions":1,"pageviews":1}]'::jsonb,
    '2026-01-03', '2026-01-03', 'mismatch.xlsx',
    '28000000-0000-0000-0000-000000000001', '{}'::jsonb
  )$$,
  '22023',
  'raptive_entry_site_mismatch',
  'an entry can never receive revenue from the other source site'
);
SELECT is(
  (SELECT status FROM public.import_runs WHERE id = '28000000-0000-0000-0000-000000000012'),
  'running',
  'a rejected transaction leaves its durable run available for explicit failure recording'
);

SELECT * FROM finish();
ROLLBACK;
