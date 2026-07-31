BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(7);

INSERT INTO public.users (
  id, wp_user_id, wp_site, email, display_name
) VALUES (
  '34000000-0000-0000-0000-000000000001',
  340001,
  'pl',
  'analytics-0034@example.test',
  'Analytics 0034 Writer'
);

INSERT INTO public.tiers (id, name, label, sort_order)
VALUES (
  '34000000-0000-0000-0000-000000000002',
  'Analytics 0034',
  'Analytics 0034',
  3400
);

INSERT INTO public.entries (
  id, title, site, tier_id, wp_post_url, publish_date,
  publish_date_precision, created_by
) VALUES (
  '34000000-0000-0000-0000-000000000003',
  'Raptive RPM article',
  'pl',
  '34000000-0000-0000-0000-000000000002',
  'https://pitcherlist.com/raptive-rpm-article/',
  '2026-07-27T12:00:00Z',
  'exact',
  '34000000-0000-0000-0000-000000000001'
);

INSERT INTO public.article_analytics (
  entry_id, date, pageviews, sessions, avg_time_on_page
) VALUES (
  '34000000-0000-0000-0000-000000000003',
  '2026-07-27',
  1000,
  500,
  30
);

INSERT INTO public.raptive_revenue (
  wp_site, entry_id, date, page_url, earnings, rpm, page_rpm, sessions, pageviews
) VALUES (
  'pl',
  '34000000-0000-0000-0000-000000000003',
  '2026-07-27',
  '/raptive-rpm-article/',
  50,
  500,
  500,
  0,
  100
);

SELECT is(
  (
    public.get_analytics_articles_v2(
      '2026-07-27', '2026-07-27', 'pl', NULL, NULL, NULL
    )->0->>'page_rpm'
  )::numeric,
  500::numeric,
  'article Page RPM uses Raptive pageviews'
);

SELECT isnt(
  (
    public.get_analytics_articles_v2(
      '2026-07-27', '2026-07-27', 'pl', NULL, NULL, NULL
    )->0->>'page_rpm'
  )::numeric,
  50::numeric,
  'article Page RPM does not divide by GA4 pageviews'
);

INSERT INTO public.raptive_revenue (
  wp_site, entry_id, date, page_url, earnings, rpm, page_rpm, sessions, pageviews
) VALUES (
  'pl',
  NULL,
  '2026-07-28',
  'https://pitcherlist.com/raptive-rpm-article/?source=raptive',
  10,
  100,
  100,
  0,
  100
);

SELECT is(
  (public.reconcile_raptive_entry_links()->>'liveRowsMatched')::integer,
  1,
  'reconciliation matches an existing unmatched live URL'
);

SELECT is(
  (
    SELECT entry_id
    FROM public.raptive_revenue
    WHERE date = '2026-07-28' AND page_url LIKE '%raptive-rpm-article%'
  ),
  '34000000-0000-0000-0000-000000000003'::uuid,
  'reconciliation assigns the correct entry'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.reconcile_raptive_entry_links()',
    'EXECUTE'
  ),
  'authenticated users cannot run revenue reconciliation'
);

SELECT is(
  (
    public.get_ga4_coverage_health(
      '2026-07-27', '2026-07-29'
    )->>'missingDays'
  )::integer,
  2,
  'GA4 coverage reports missing calendar days'
);

SELECT ok(
  NOT has_function_privilege(
    'authenticated',
    'public.get_ga4_coverage_health(date,date)',
    'EXECUTE'
  ),
  'authenticated users cannot inspect global GA4 coverage'
);

SELECT * FROM finish();
ROLLBACK;
