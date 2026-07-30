-- Aggregate analytics in Postgres so PostgREST row limits cannot silently
-- truncate dashboard results. Keep site revenue distinct from revenue that
-- can be attributed to a dashboard entry.

CREATE OR REPLACE FUNCTION public.get_analytics_overview_v2(
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
    SELECT e.id
    FROM public.entries e
    WHERE e.is_archived = false
      AND (p_site IS NULL OR e.site = p_site)
      AND (p_tier_id IS NULL OR e.tier_id = p_tier_id)
      AND (p_category_id IS NULL OR e.category_id = p_category_id)
      AND (p_author_id IS NULL OR EXISTS (
        SELECT 1
        FROM public.entry_authors ea
        WHERE ea.entry_id = e.id AND ea.user_id = p_author_id
      ))
  ),
  ga4_daily AS (
    SELECT aa.date,
      sum(aa.pageviews)::bigint AS pageviews,
      sum(aa.sessions)::bigint AS sessions,
      count(DISTINCT aa.entry_id)::bigint AS articles
    FROM public.article_analytics aa
    JOIN filtered_entries e ON e.id = aa.entry_id
    WHERE aa.date BETWEEN p_date_from AND p_date_to
    GROUP BY aa.date
  ),
  revenue_source AS (
    SELECT entry_id, wp_site, date, earnings
    FROM public.raptive_revenue
    WHERE date BETWEEN p_date_from AND p_date_to
    UNION ALL
    SELECT entry_id, wp_site, date, earnings
    FROM public.raptive_history_daily
    WHERE date BETWEEN p_date_from AND p_date_to
  ),
  site_revenue_daily AS (
    SELECT r.date, sum(r.earnings)::numeric AS earnings
    FROM revenue_source r
    WHERE p_site IS NULL OR r.wp_site = p_site
    GROUP BY r.date
  ),
  attributed_revenue_daily AS (
    SELECT r.date, sum(r.earnings)::numeric AS earnings,
      count(DISTINCT r.entry_id)::bigint AS articles
    FROM revenue_source r
    JOIN filtered_entries e ON e.id = r.entry_id
    WHERE r.entry_id IS NOT NULL
      AND (p_site IS NULL OR r.wp_site = p_site)
    GROUP BY r.date
  ),
  all_dates AS (
    SELECT date FROM ga4_daily
    UNION
    SELECT date FROM site_revenue_daily
    UNION
    SELECT date FROM attributed_revenue_daily
  ),
  daily AS (
    SELECT d.date,
      coalesce(g.pageviews, 0)::bigint AS pageviews,
      coalesce(g.sessions, 0)::bigint AS sessions,
      coalesce(s.earnings, 0)::numeric AS site_earnings,
      coalesce(a.earnings, 0)::numeric AS attributed_earnings
    FROM all_dates d
    LEFT JOIN ga4_daily g USING (date)
    LEFT JOIN site_revenue_daily s USING (date)
    LEFT JOIN attributed_revenue_daily a USING (date)
    ORDER BY d.date
  ),
  totals AS (
    SELECT
      coalesce((SELECT sum(pageviews) FROM ga4_daily), 0)::bigint AS pageviews,
      coalesce((SELECT sum(sessions) FROM ga4_daily), 0)::bigint AS sessions,
      coalesce((SELECT sum(earnings) FROM site_revenue_daily), 0)::numeric AS site_earnings,
      coalesce((SELECT sum(earnings) FROM attributed_revenue_daily), 0)::numeric AS attributed_earnings,
      (
        SELECT count(DISTINCT entry_id)
        FROM (
          SELECT aa.entry_id
          FROM public.article_analytics aa
          JOIN filtered_entries e ON e.id = aa.entry_id
          WHERE aa.date BETWEEN p_date_from AND p_date_to
          UNION
          SELECT r.entry_id
          FROM revenue_source r
          JOIN filtered_entries e ON e.id = r.entry_id
          WHERE r.entry_id IS NOT NULL
            AND (p_site IS NULL OR r.wp_site = p_site)
        ) active_entries
      )::bigint AS articles
  )
  SELECT jsonb_build_object(
    'articlesCount', t.articles,
    'totalPageviews', t.pageviews,
    'totalSessions', t.sessions,
    'totalEarnings', t.site_earnings,
    'attributedEarnings', t.attributed_earnings,
    'unattributedEarnings', greatest(t.site_earnings - t.attributed_earnings, 0),
    'attributionRate', CASE
      WHEN t.site_earnings > 0 THEN t.attributed_earnings / t.site_earnings
      ELSE 0
    END,
    'daily', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'date', d.date,
        'pageviews', d.pageviews,
        'sessions', d.sessions,
        'earnings', d.attributed_earnings,
        'siteEarnings', d.site_earnings
      ) ORDER BY d.date)
      FROM daily d
    ), '[]'::jsonb)
  )
  FROM totals t;
$$;

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
    SELECT entry_id, wp_site, date, earnings
    FROM public.raptive_revenue
    WHERE date BETWEEN p_date_from AND p_date_to
    UNION ALL
    SELECT entry_id, wp_site, date, earnings
    FROM public.raptive_history_daily
    WHERE date BETWEEN p_date_from AND p_date_to
  ),
  revenue AS (
    SELECT r.entry_id, sum(r.earnings)::numeric AS earnings
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
      CASE WHEN coalesce(g.pageviews, 0) > 0
        THEN coalesce(r.earnings, 0) / g.pageviews * 1000
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

CREATE OR REPLACE FUNCTION public.get_analytics_writers_v2(
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
    SELECT e.id, e.word_count
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
    SELECT aa.entry_id, sum(aa.pageviews)::bigint AS pageviews
    FROM public.article_analytics aa
    JOIN filtered_entries e ON e.id = aa.entry_id
    WHERE aa.date BETWEEN p_date_from AND p_date_to
    GROUP BY aa.entry_id
  ),
  revenue_source AS (
    SELECT entry_id, wp_site, date, earnings
    FROM public.raptive_revenue
    WHERE date BETWEEN p_date_from AND p_date_to
    UNION ALL
    SELECT entry_id, wp_site, date, earnings
    FROM public.raptive_history_daily
    WHERE date BETWEEN p_date_from AND p_date_to
  ),
  revenue AS (
    SELECT r.entry_id, sum(r.earnings)::numeric AS earnings
    FROM revenue_source r
    JOIN filtered_entries e ON e.id = r.entry_id
    WHERE r.entry_id IS NOT NULL
      AND (p_site IS NULL OR r.wp_site = p_site)
    GROUP BY r.entry_id
  ),
  rows AS (
    SELECT u.id AS user_id,
      u.display_name,
      u.avatar_url,
      count(DISTINCT e.id)::bigint AS articles,
      sum(coalesce(g.pageviews, 0))::bigint AS pageviews,
      sum(coalesce(r.earnings, 0))::numeric AS earnings,
      CASE WHEN sum(e.word_count) > 0
        THEN sum(coalesce(r.earnings, 0)) / sum(e.word_count)
        ELSE 0
      END::numeric AS revenue_per_word
    FROM filtered_entries e
    JOIN public.entry_authors ea
      ON ea.entry_id = e.id AND ea.role = 'primary'
    JOIN public.users u ON u.id = ea.user_id
    LEFT JOIN ga4 g ON g.entry_id = e.id
    LEFT JOIN revenue r ON r.entry_id = e.id
    WHERE coalesce(g.pageviews, 0) > 0 OR coalesce(r.earnings, 0) > 0
    GROUP BY u.id, u.display_name, u.avatar_url
  )
  SELECT coalesce(jsonb_agg(to_jsonb(rows) ORDER BY earnings DESC, user_id), '[]'::jsonb)
  FROM rows;
$$;

CREATE OR REPLACE FUNCTION public.get_analytics_trends_v2(
  p_date_from date,
  p_date_to date,
  p_site text DEFAULT NULL,
  p_tier_id uuid DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_author_id uuid DEFAULT NULL,
  p_max_days integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH filtered_entries AS (
    SELECT e.id, e.publish_date::date AS publish_date
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
  peak_raw AS (
    SELECT (aa.date - e.publish_date)::integer AS day,
      sum(aa.pageviews)::bigint AS pageviews,
      count(DISTINCT aa.entry_id)::bigint AS article_count
    FROM public.article_analytics aa
    JOIN filtered_entries e ON e.id = aa.entry_id
    WHERE aa.date BETWEEN p_date_from AND p_date_to
      AND e.publish_date IS NOT NULL
      AND aa.date - e.publish_date BETWEEN 0 AND p_max_days
    GROUP BY aa.date - e.publish_date
  ),
  curve AS (
    SELECT days.day,
      CASE WHEN coalesce(p.article_count, 0) > 0
        THEN p.pageviews::numeric / p.article_count
        ELSE 0
      END AS avg_pageviews,
      coalesce(p.article_count, 0)::bigint AS article_count
    FROM generate_series(0, p_max_days) AS days(day)
    LEFT JOIN peak_raw p ON p.day = days.day
  ),
  heat AS (
    SELECT
      (aa.date - extract(dow FROM aa.date)::integer)::date AS week_start,
      extract(dow FROM aa.date)::integer AS day_of_week,
      sum(aa.pageviews)::bigint AS pageviews
    FROM public.article_analytics aa
    JOIN filtered_entries e ON e.id = aa.entry_id
    WHERE aa.date BETWEEN p_date_from AND p_date_to
    GROUP BY
      aa.date - extract(dow FROM aa.date)::integer,
      extract(dow FROM aa.date)::integer
  )
  SELECT jsonb_build_object(
    'curve', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'day', c.day,
        'avgPageviews', c.avg_pageviews,
        'articleCount', c.article_count
      ) ORDER BY c.day)
      FROM curve c
    ), '[]'::jsonb),
    'heat', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'weekStart', h.week_start,
        'dayOfWeek', h.day_of_week,
        'pageviews', h.pageviews
      ) ORDER BY h.week_start, h.day_of_week)
      FROM heat h
    ), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.get_analytics_overview_v2(date, date, text, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_analytics_articles_v2(date, date, text, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_analytics_writers_v2(date, date, text, uuid, uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_analytics_trends_v2(date, date, text, uuid, uuid, uuid, integer)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_analytics_overview_v2(date, date, text, uuid, uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.get_analytics_articles_v2(date, date, text, uuid, uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.get_analytics_writers_v2(date, date, text, uuid, uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.get_analytics_trends_v2(date, date, text, uuid, uuid, uuid, integer)
  TO service_role;

-- Rollback: drop the four *_v2 functions. The existing v1 functions remain.
