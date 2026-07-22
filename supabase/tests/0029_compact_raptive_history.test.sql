BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT no_plan();

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.raptive_history_daily', 'SELECT'),
  'compact financial history is unavailable to authenticated clients'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.upsert_raptive_history_batch(jsonb)', 'EXECUTE'),
  'authenticated clients cannot invoke compact history import'
);
SELECT ok(
  has_function_privilege('service_role', 'public.upsert_raptive_history_batch(jsonb)', 'EXECUTE'),
  'service role can invoke compact history import'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.get_raptive_entry_rollup(date,date,text)', 'EXECUTE'),
  'authenticated clients cannot invoke financial entry rollups'
);

INSERT INTO public.users (id, wp_user_id, wp_site, email, display_name)
VALUES ('29000000-0000-0000-0000-000000000001', 2901, 'both', 'raptive-29@example.test', 'Raptive 29');
INSERT INTO public.tiers (id, name, label, sort_order)
VALUES ('29000000-0000-0000-0000-000000000002', 'raptive-29-tier', 'Raptive 29 Tier', 2901);
INSERT INTO public.entries (id, title, site, tier_id, created_by)
VALUES
  ('29000000-0000-0000-0000-000000000003', 'PL history probe', 'pl', '29000000-0000-0000-0000-000000000002', '29000000-0000-0000-0000-000000000001'),
  ('29000000-0000-0000-0000-000000000004', 'QB history probe', 'qb', '29000000-0000-0000-0000-000000000002', '29000000-0000-0000-0000-000000000001');

SELECT is(
  public.upsert_raptive_history_batch('[
    {"wp_site":"pl","date":"2025-01-01","entry_id":"29000000-0000-0000-0000-000000000003","earnings":2.5,"sessions":10,"pageviews":20},
    {"wp_site":"pl","date":"2025-01-01","entry_id":null,"earnings":1.5,"sessions":5,"pageviews":8}
  ]'::jsonb),
  2,
  'compact history batch stores attributable and unmatched daily totals'
);
SELECT is(
  public.upsert_raptive_history_batch('[
    {"wp_site":"pl","date":"2025-01-01","entry_id":null,"earnings":3.5,"sessions":7,"pageviews":9}
  ]'::jsonb),
  1,
  'null-entry site/day totals are idempotently replaced'
);
SELECT is(
  (SELECT count(*)::integer FROM public.raptive_history_daily),
  2,
  'repeat import does not duplicate compact history rows'
);
INSERT INTO public.raptive_revenue (
  entry_id, wp_site, date, page_url, earnings, sessions, pageviews
) VALUES (
  '29000000-0000-0000-0000-000000000003', 'pl', '2025-01-02',
  '/live-probe/', 1, 2, 3
);
SELECT results_eq(
  $$SELECT entry_id, earnings, sessions, pageviews
    FROM public.get_raptive_entry_rollup('2025-01-01', '2025-01-02', 'pl')$$,
  $$VALUES (
    '29000000-0000-0000-0000-000000000003'::uuid,
    3.5000::numeric, 12::bigint, 23::bigint
  )$$,
  'entry rollup combines non-overlapping live and compact days without unmatched totals'
);
SELECT throws_ok(
  $$SELECT public.upsert_raptive_history_batch('[
    {"wp_site":"qb","date":"2025-01-02","entry_id":"29000000-0000-0000-0000-000000000003","earnings":1,"sessions":1,"pageviews":1}
  ]'::jsonb)$$,
  'P0001',
  'history entry/site mismatch',
  'cross-site history attribution is rejected'
);
SELECT results_eq(
  $$SELECT wp_site, rows, earnings, sessions, pageviews FROM public.get_raptive_history_summary()$$,
  $$VALUES ('pl'::text, 2::bigint, 6.0000::numeric, 17::bigint, 29::bigint)$$,
  'summary reconciles exact stored financial and traffic totals'
);

SELECT * FROM finish();
ROLLBACK;
