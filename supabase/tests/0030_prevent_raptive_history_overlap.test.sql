BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT no_plan();

INSERT INTO public.raptive_history_daily (
  wp_site, date, entry_id, earnings, sessions, pageviews
) VALUES ('pl', '2026-07-01', NULL, 1, 1, 1);

SELECT throws_ok(
  $$INSERT INTO public.raptive_revenue (
      wp_site, date, page_url, earnings, sessions, pageviews
    ) VALUES ('pl', '2026-07-01', '/overlap/', 1, 1, 1)$$,
  '22023',
  'raptive_compact_history_overlap',
  'raw/live revenue cannot overlap compact history for one site/day'
);
SELECT lives_ok(
  $$INSERT INTO public.raptive_revenue (
      wp_site, date, page_url, earnings, sessions, pageviews
    ) VALUES ('qb', '2026-07-01', '/other-site/', 1, 1, 1)$$,
  'the same date remains independent across source sites'
);
SELECT is(
  (SELECT count(*)::integer FROM public.raptive_revenue WHERE wp_site = 'pl'),
  0,
  'a rejected overlap leaves no partial raw rows'
);

INSERT INTO public.raptive_revenue (
  wp_site, date, page_url, earnings, sessions, pageviews
) VALUES ('pl', '2026-07-02', '/raw-first/', 1, 1, 1);

SELECT throws_ok(
  $$INSERT INTO public.raptive_history_daily (
      wp_site, date, entry_id, earnings, sessions, pageviews
    ) VALUES ('pl', '2026-07-02', NULL, 1, 1, 1)$$,
  '22023',
  'raptive_raw_history_overlap',
  'compact history cannot overlap an existing raw/live site/day'
);
SELECT is(
  (SELECT count(*)::integer FROM public.raptive_history_daily
    WHERE wp_site = 'pl' AND date = '2026-07-02'),
  0,
  'a rejected compact overlap leaves no partial history rows'
);

SELECT * FROM finish();
ROLLBACK;
