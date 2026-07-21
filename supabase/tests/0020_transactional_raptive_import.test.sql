BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT no_plan();

SELECT ok(
  to_regprocedure('public.commit_raptive_import(jsonb,date,date,text,uuid)') IS NULL,
  'legacy untracked Raptive import signature is removed'
);
SELECT ok(
  has_function_privilege('service_role', 'public.commit_raptive_import(uuid,jsonb,date,date,text,uuid,jsonb)', 'EXECUTE'),
  'service role can commit tracked Raptive imports'
);

INSERT INTO public.users (id, wp_user_id, wp_site, email, display_name)
VALUES ('20000000-0000-0000-0000-000000000001', 2001, 'both', 'raptive-20@example.test', 'Raptive 20');

INSERT INTO public.import_runs (id, import_type, file_name, requested_by)
VALUES (
  '20100000-0000-0000-0000-000000000001',
  'raptive',
  'valid.xlsx',
  '20000000-0000-0000-0000-000000000001'
);

INSERT INTO public.raptive_revenue (
  date, page_url, earnings, rpm, page_rpm, sessions, pageviews
) VALUES (
  '2026-01-01', 'https://pitcherlist.com/old-row/', 1, 1, 1, 1, 1
);

SELECT is(
  public.commit_raptive_import(
    '20100000-0000-0000-0000-000000000001',
    '[
      {"entry_id":null,"date":"2026-01-01","page_url":"https://pitcherlist.com/a/","earnings":10.5,"rpm":2,"page_rpm":3,"sessions":4,"pageviews":5},
      {"entry_id":null,"date":"2026-01-02","page_url":"https://pitcherlist.com/b/","earnings":20.5,"rpm":4,"page_rpm":5,"sessions":6,"pageviews":7}
    ]'::jsonb,
    '2026-01-01',
    '2026-01-02',
    'valid.xlsx',
    '20000000-0000-0000-0000-000000000001',
    '{"matched_count":2,"unmatched_count":0}'::jsonb
  ),
  2,
  'atomic import returns the exact inserted row count'
);
SELECT is(
  (SELECT count(*)::integer FROM public.raptive_revenue WHERE date BETWEEN '2026-01-01' AND '2026-01-02'),
  2,
  'replacement range contains only the new complete dataset'
);
SELECT is(
  (SELECT count(*)::integer FROM public.raptive_revenue WHERE page_url = 'https://pitcherlist.com/old-row/'),
  0,
  'successful replacement removes the prior range'
);
SELECT is(
  (SELECT rows_imported FROM public.raptive_uploads WHERE file_name = 'valid.xlsx'),
  2,
  'upload history commits with the revenue rows'
);
SELECT is(
  (SELECT status FROM public.import_runs WHERE id = '20100000-0000-0000-0000-000000000001'),
  'succeeded',
  'successful replacement completes its durable import run'
);
SELECT is(
  (SELECT import_run_id FROM public.raptive_uploads WHERE file_name = 'valid.xlsx'),
  '20100000-0000-0000-0000-000000000001'::uuid,
  'upload history links to the exact durable import run'
);

INSERT INTO public.raptive_revenue (
  date, page_url, earnings, rpm, page_rpm, sessions, pageviews
) VALUES (
  '2026-02-01', 'https://pitcherlist.com/preserved/', 99, 9, 9, 9, 9
);

INSERT INTO public.import_runs (id, import_type, file_name, requested_by)
VALUES (
  '20100000-0000-0000-0000-000000000002',
  'raptive',
  'interrupted.xlsx',
  '20000000-0000-0000-0000-000000000001'
);

SELECT throws_ok(
  $$SELECT public.commit_raptive_import(
    '20100000-0000-0000-0000-000000000002',
    '[
      {"entry_id":null,"date":"2026-02-01","page_url":"https://pitcherlist.com/replacement/","earnings":10,"rpm":2,"page_rpm":3,"sessions":4,"pageviews":5},
      {"entry_id":null,"date":"2026-02-02","page_url":"https://pitcherlist.com/bad/","earnings":20,"rpm":4,"page_rpm":5,"sessions":-1,"pageviews":7}
    ]'::jsonb,
    '2026-02-01',
    '2026-02-02',
    'interrupted.xlsx',
    '20000000-0000-0000-0000-000000000001',
    '{}'::jsonb
  )$$,
  '23514',
  NULL,
  'a later-row constraint failure aborts the whole replacement'
);
SELECT is(
  (SELECT earnings::numeric FROM public.raptive_revenue WHERE page_url = 'https://pitcherlist.com/preserved/'),
  99::numeric,
  'failed replacement restores the prior range'
);
SELECT is(
  (SELECT count(*)::integer FROM public.raptive_revenue WHERE page_url IN ('https://pitcherlist.com/replacement/', 'https://pitcherlist.com/bad/')),
  0,
  'failed replacement leaves no partial new rows'
);
SELECT is(
  (SELECT count(*)::integer FROM public.raptive_uploads WHERE file_name = 'interrupted.xlsx'),
  0,
  'failed replacement writes no false-success history'
);
SELECT is(
  (SELECT status FROM public.import_runs WHERE id = '20100000-0000-0000-0000-000000000002'),
  'running',
  'a rolled-back replacement leaves its pre-existing run visible for failure recovery'
);

INSERT INTO public.import_runs (id, import_type, file_name, requested_by)
VALUES (
  '20100000-0000-0000-0000-000000000003',
  'raptive',
  'duplicate.xlsx',
  '20000000-0000-0000-0000-000000000001'
);

SELECT throws_ok(
  $$SELECT public.commit_raptive_import(
    '20100000-0000-0000-0000-000000000003',
    '[
      {"entry_id":null,"date":"2026-03-01","page_url":"https://pitcherlist.com/duplicate/","earnings":1,"rpm":1,"page_rpm":1,"sessions":1,"pageviews":1},
      {"entry_id":null,"date":"2026-03-01","page_url":"https://pitcherlist.com/duplicate/","earnings":1,"rpm":1,"page_rpm":1,"sessions":1,"pageviews":1}
    ]'::jsonb,
    '2026-03-01',
    '2026-03-01',
    'duplicate.xlsx',
    '20000000-0000-0000-0000-000000000001',
    '{}'::jsonb
  )$$,
  '22023',
  'raptive_duplicate_rows',
  'RPC rejects duplicate date and URL keys defensively'
);

SELECT * FROM finish();
ROLLBACK;
