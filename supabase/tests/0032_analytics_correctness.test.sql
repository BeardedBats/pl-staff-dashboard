BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(11);

INSERT INTO public.users (
  id, wp_user_id, wp_site, email, display_name
) VALUES (
  '32000000-0000-0000-0000-000000000001',
  320001,
  'pl',
  'analytics-0032@example.test',
  'Analytics Writer'
);

INSERT INTO public.tiers (id, name, label, sort_order)
VALUES (
  '32000000-0000-0000-0000-000000000002',
  'Analytics 0032',
  'Analytics 0032',
  3200
);

INSERT INTO public.entries (
  id, title, site, tier_id, publish_date, publish_date_precision, created_by
) VALUES (
  '32000000-0000-0000-0000-000000000003',
  'Complete analytics article',
  'pl',
  '32000000-0000-0000-0000-000000000002',
  '2026-01-01T12:00:00Z',
  'exact',
  '32000000-0000-0000-0000-000000000001'
);

INSERT INTO public.entry_authors (entry_id, user_id, role)
VALUES (
  '32000000-0000-0000-0000-000000000003',
  '32000000-0000-0000-0000-000000000001',
  'primary'
);

INSERT INTO public.article_analytics (
  entry_id, date, pageviews, sessions, avg_time_on_page
) VALUES
  ('32000000-0000-0000-0000-000000000003', '2026-01-01', 100, 50, 20),
  ('32000000-0000-0000-0000-000000000003', '2026-01-02', 200, 100, 40);

INSERT INTO public.raptive_history_daily (
  wp_site, date, entry_id, earnings, sessions, pageviews
) VALUES
  ('pl', '2026-01-01', '32000000-0000-0000-0000-000000000003', 25, 50, 100),
  ('pl', '2026-01-01', NULL, 75, 100, 200),
  ('pl', '2026-01-02', '32000000-0000-0000-0000-000000000003', 10, 100, 200);

SELECT is(
  (public.get_analytics_overview_v2(
    '2026-01-01', '2026-01-02', 'pl', NULL, NULL, NULL
  )->>'totalPageviews')::bigint,
  300::bigint,
  'overview aggregates every GA4 row'
);

SELECT is(
  (public.get_analytics_overview_v2(
    '2026-01-01', '2026-01-02', 'pl', NULL, NULL, NULL
  )->>'totalEarnings')::numeric,
  110::numeric,
  'overview includes unmatched site revenue'
);

SELECT is(
  (public.get_analytics_overview_v2(
    '2026-01-01', '2026-01-02', 'pl', NULL, NULL, NULL
  )->>'attributedEarnings')::numeric,
  35::numeric,
  'overview reports entry-attributed revenue separately'
);

SELECT is(
  (
    public.get_analytics_overview_v2(
      '2026-01-01', '2026-01-02', 'pl', NULL, NULL, NULL
    )->'daily'->0->>'siteEarnings'
  )::numeric,
  100::numeric,
  'daily trend uses actual site revenue for the date'
);

SELECT is(
  jsonb_array_length(public.get_analytics_articles_v2(
    '2026-01-01', '2026-01-02', 'pl', NULL, NULL, NULL
  )),
  1,
  'article rollup returns the complete filtered result'
);

SELECT is(
  (
    public.get_analytics_articles_v2(
      '2026-01-01', '2026-01-02', 'pl', NULL, NULL, NULL
    )->0->>'earnings'
  )::numeric,
  35::numeric,
  'article rollup uses actual attributed earnings'
);

SELECT is(
  round((
    public.get_analytics_articles_v2(
      '2026-01-01', '2026-01-02', 'pl', NULL, NULL, NULL
    )->0->>'avg_time_on_page'
  )::numeric, 2),
  33.33::numeric,
  'session duration is weighted by sessions'
);

SELECT is(
  (
    public.get_analytics_writers_v2(
      '2026-01-01', '2026-01-02', 'pl', NULL, NULL, NULL
    )->0->>'earnings'
  )::numeric,
  35::numeric,
  'writer rollup includes all attributed revenue'
);

SELECT is(
  jsonb_array_length(public.get_analytics_trends_v2(
    '2026-01-01', '2026-01-02', 'pl', NULL, NULL, NULL, 30
  )->'curve'),
  31,
  'publish-to-peak curve has the requested complete range'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.get_analytics_overview_v2(date,date,text,uuid,uuid,uuid)',
    'EXECUTE'
  ),
  'anonymous users cannot execute analytics aggregation'
);

SELECT ok(
  has_function_privilege(
    'service_role',
    'public.get_analytics_overview_v2(date,date,text,uuid,uuid,uuid)',
    'EXECUTE'
  ),
  'service role can execute analytics aggregation'
);

SELECT * FROM finish();
ROLLBACK;
