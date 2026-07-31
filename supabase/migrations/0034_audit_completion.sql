-- Use Raptive pageviews for Raptive Page RPM and attach verifiable source
-- hashes to the compact historical import ledger.

CREATE OR REPLACE FUNCTION public.analytics_article_path(p_url text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = public, pg_temp
AS $$
  SELECT lower(trim(BOTH '/' FROM split_part(split_part(
    regexp_replace(trim(p_url), '^https?://[^/]+', '', 'i'),
    '?', 1
  ), '#', 1)));
$$;

CREATE OR REPLACE FUNCTION public.reconcile_raptive_entry_links()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_live integer := 0;
BEGIN
  WITH unique_paths AS (
    SELECT e.site,
      public.analytics_article_path(e.wp_post_url) AS path,
      min(e.id::text)::uuid AS entry_id
    FROM public.entries e
    WHERE e.wp_post_url IS NOT NULL
      AND public.analytics_article_path(e.wp_post_url) <> ''
    GROUP BY e.site, public.analytics_article_path(e.wp_post_url)
    HAVING count(DISTINCT e.id) = 1
  )
  UPDATE public.raptive_revenue revenue
  SET entry_id = paths.entry_id
  FROM unique_paths paths
  WHERE revenue.entry_id IS NULL
    AND revenue.wp_site = paths.site
    AND public.analytics_article_path(revenue.page_url) = paths.path;
  GET DIAGNOSTICS v_live = ROW_COUNT;

  RETURN jsonb_build_object(
    'liveRowsMatched', v_live
  );
END;
$$;

REVOKE ALL ON FUNCTION public.analytics_article_path(text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reconcile_raptive_entry_links()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_article_path(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_raptive_entry_links() TO service_role;

CREATE OR REPLACE FUNCTION public.get_ga4_coverage_health(
  p_date_from date DEFAULT (current_date - 90),
  p_date_to date DEFAULT (current_date - 1)
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH expected AS (
    SELECT day::date AS date
    FROM generate_series(p_date_from, p_date_to, interval '1 day') day
    WHERE p_date_from <= p_date_to
  ),
  actual AS (
    SELECT DISTINCT analytics.date
    FROM public.article_analytics analytics
    WHERE analytics.date BETWEEN p_date_from AND p_date_to
  ),
  missing AS (
    SELECT expected.date
    FROM expected
    LEFT JOIN actual USING (date)
    WHERE actual.date IS NULL
  )
  SELECT jsonb_build_object(
    'dateFrom', p_date_from,
    'dateTo', p_date_to,
    'missingDays', count(missing.date),
    'firstMissingDate', min(missing.date),
    'lastMissingDate', max(missing.date),
    'latestDataDate', (
      SELECT max(analytics.date)
      FROM public.article_analytics analytics
      WHERE analytics.date <= p_date_to
    )
  )
  FROM missing;
$$;

REVOKE ALL ON FUNCTION public.get_ga4_coverage_health(date, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_ga4_coverage_health(date, date)
  TO service_role;

CREATE OR REPLACE FUNCTION public.get_analytics_articles_v2(
  p_date_from date,
  p_date_to date,
  p_site text DEFAULT NULL,
  p_tier_id uuid DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_author_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH filtered_entries AS (
    SELECT e.id, e.title, e.site, e.tier_id, e.publish_date, e.word_count
    FROM public.entries e
    WHERE e.is_archived = false
      AND (p_site IS NULL OR e.site = p_site)
      AND (p_tier_id IS NULL OR e.tier_id = p_tier_id)
      AND (p_category_id IS NULL OR e.category_id = p_category_id)
      AND (p_author_id IS NULL OR EXISTS (
        SELECT 1 FROM public.entry_authors ea
        WHERE ea.entry_id = e.id AND ea.user_id = p_author_id
      ))
  ),
  ga4 AS (
    SELECT aa.entry_id,
      sum(aa.pageviews)::bigint AS pageviews,
      sum(aa.sessions)::bigint AS sessions,
      CASE WHEN sum(aa.sessions) > 0
        THEN sum(aa.avg_time_on_page * aa.sessions) / sum(aa.sessions)
        ELSE 0
      END::numeric AS avg_session_duration
    FROM public.article_analytics aa
    JOIN filtered_entries e ON e.id = aa.entry_id
    WHERE aa.date BETWEEN p_date_from AND p_date_to
    GROUP BY aa.entry_id
  ),
  revenue_source AS (
    SELECT entry_id, wp_site, date, earnings, pageviews
    FROM public.raptive_revenue
    WHERE date BETWEEN p_date_from AND p_date_to
    UNION ALL
    SELECT entry_id, wp_site, date, earnings, pageviews
    FROM public.raptive_history_daily
    WHERE date BETWEEN p_date_from AND p_date_to
  ),
  revenue AS (
    SELECT r.entry_id,
      sum(r.earnings)::numeric AS earnings,
      sum(r.pageviews)::bigint AS pageviews
    FROM revenue_source r
    JOIN filtered_entries e ON e.id = r.entry_id
    WHERE r.entry_id IS NOT NULL
      AND (p_site IS NULL OR r.wp_site = p_site)
    GROUP BY r.entry_id
  ),
  authors AS (
    SELECT ea.entry_id,
      string_agg(u.display_name, ', ' ORDER BY
        CASE WHEN ea.role = 'primary' THEN 0 ELSE 1 END,
        u.display_name
      ) AS names
    FROM public.entry_authors ea
    JOIN public.users u ON u.id = ea.user_id
    JOIN filtered_entries e ON e.id = ea.entry_id
    GROUP BY ea.entry_id
  ),
  rows AS (
    SELECT e.id AS entry_id,
      e.title,
      e.site,
      coalesce(t.name, '?') AS tier_name,
      e.publish_date,
      coalesce(g.pageviews, 0)::bigint AS pageviews,
      coalesce(g.sessions, 0)::bigint AS sessions,
      coalesce(g.avg_session_duration, 0)::numeric AS avg_time_on_page,
      coalesce(r.earnings, 0)::numeric AS earnings,
      CASE WHEN coalesce(r.pageviews, 0) > 0
        THEN coalesce(r.earnings, 0) / r.pageviews * 1000
        ELSE 0
      END::numeric AS page_rpm,
      coalesce(a.names, '—') AS authors
    FROM filtered_entries e
    LEFT JOIN ga4 g ON g.entry_id = e.id
    LEFT JOIN revenue r ON r.entry_id = e.id
    LEFT JOIN authors a ON a.entry_id = e.id
    LEFT JOIN public.tiers t ON t.id = e.tier_id
    WHERE coalesce(g.pageviews, 0) > 0 OR coalesce(r.earnings, 0) > 0
  )
  SELECT coalesce(jsonb_agg(to_jsonb(rows) ORDER BY earnings DESC, entry_id), '[]'::jsonb)
  FROM rows;
$$;

UPDATE public.import_runs
SET summary = summary || jsonb_build_object(
  'sourceManifest', jsonb_build_array(
    jsonb_build_object(
      'file', 'Topline Overview + Top Earning URLs_ Topline Overview - Organization Level_20190206-20221231.xlsx',
      'sha256', 'e76e8d7aceb8d33d99fa3264d0c66de8dc49147e97ba019a6fdba55cd0b5d608'
    ),
    jsonb_build_object(
      'file', 'Topline Overview + Top Earning URLs_ Topline Overview - Organization Level_20230101-20231231.xlsx',
      'sha256', 'aa66a50331af48b0f9022acfaadfa4d85100dde22afb4f21cfc3cf515760279a'
    ),
    jsonb_build_object(
      'file', 'Topline Overview + Top Earning URLs_ Topline Overview - Organization Level_20240101-20241231.xlsx',
      'sha256', 'd3d699e813b27694b4410fa0e346c767b2bfa34fb51179b0369498c94073ae0b'
    ),
    jsonb_build_object(
      'file', 'Topline Overview + Top Earning URLs_ Topline Overview - Organization Level_20250101-20251231.xlsx',
      'sha256', '5b254328d67fbbc5c9a462929a722398d43c580a7f97107e3779e118e4706b52'
    ),
    jsonb_build_object(
      'file', 'Topline Overview + Top Earning URLs_ Topline Overview - Organization Level_20260101-20260510.xlsx',
      'sha256', 'aab8a67873df3c49d1c90ce9e2f81778244586676d281ab3a3b84215dacaf532'
    )
  ),
  'manifestRecordedByMigration', '0034'
)
WHERE import_type = 'raptive'
  AND file_name = 'legacy-compact-history-backfill'
  AND status = 'succeeded';

-- Rollback: restore get_analytics_articles_v2 from migration 0032, remove the
-- two reconciliation functions, and remove the manifest keys from the run.
