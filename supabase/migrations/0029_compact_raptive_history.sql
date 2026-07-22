-- Compact, daily historical Raptive facts. The live/raw table retains source
-- URLs for reconciliation; this table stores only the dimensions consumed by
-- analytics so multi-year history fits safely inside the free database quota.

CREATE TABLE public.raptive_history_daily (
  wp_site text NOT NULL CHECK (wp_site IN ('pl', 'qb')),
  date date NOT NULL,
  entry_id uuid REFERENCES public.entries(id),
  earnings numeric(12,4) NOT NULL DEFAULT 0,
  sessions integer NOT NULL DEFAULT 0 CHECK (sessions >= 0),
  pageviews integer NOT NULL DEFAULT 0 CHECK (pageviews >= 0),
  UNIQUE NULLS NOT DISTINCT (wp_site, date, entry_id)
);

CREATE INDEX raptive_history_daily_date_idx
  ON public.raptive_history_daily (date, wp_site);

ALTER TABLE public.raptive_history_daily ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raptive_history_daily FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.raptive_history_daily FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.raptive_history_daily TO service_role;

CREATE OR REPLACE FUNCTION public.upsert_raptive_history_batch(p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) < 1
     OR jsonb_array_length(p_rows) > 1000 THEN
    RAISE EXCEPTION 'history batch must contain 1..1000 rows';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_to_recordset(p_rows) AS row(
      wp_site text, date date, entry_id uuid, earnings numeric(12,4),
      sessions integer, pageviews integer
    )
    WHERE row.wp_site NOT IN ('pl', 'qb')
       OR row.wp_site IS NULL OR row.date IS NULL OR row.earnings IS NULL
       OR row.sessions IS NULL OR row.sessions < 0
       OR row.pageviews IS NULL OR row.pageviews < 0
  ) THEN
    RAISE EXCEPTION 'invalid compact history row';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_rows) AS row(
      wp_site text, date date, entry_id uuid, earnings numeric(12,4),
      sessions integer, pageviews integer
    )
    JOIN public.entries entry ON entry.id = row.entry_id
    WHERE entry.site <> row.wp_site
  ) OR EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_rows) AS row(
      wp_site text, date date, entry_id uuid, earnings numeric(12,4),
      sessions integer, pageviews integer
    )
    WHERE row.entry_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM public.entries entry WHERE entry.id = row.entry_id)
  ) THEN
    RAISE EXCEPTION 'history entry/site mismatch';
  END IF;

  INSERT INTO public.raptive_history_daily AS target (
    wp_site, date, entry_id, earnings, sessions, pageviews
  )
  SELECT wp_site, date, entry_id, earnings, sessions, pageviews
  FROM jsonb_to_recordset(p_rows) AS row(
    wp_site text, date date, entry_id uuid, earnings numeric(12,4),
    sessions integer, pageviews integer
  )
  ON CONFLICT (wp_site, date, entry_id) DO UPDATE SET
    earnings = EXCLUDED.earnings,
    sessions = EXCLUDED.sessions,
    pageviews = EXCLUDED.pageviews;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_raptive_history_batch(jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_raptive_history_batch(jsonb)
  TO service_role;

CREATE OR REPLACE FUNCTION public.get_raptive_history_summary()
RETURNS TABLE (
  wp_site text,
  rows bigint,
  date_start date,
  date_end date,
  earnings numeric,
  sessions bigint,
  pageviews bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT history.wp_site,
    count(*), min(history.date), max(history.date),
    sum(history.earnings), sum(history.sessions), sum(history.pageviews)
  FROM public.raptive_history_daily history
  GROUP BY history.wp_site
  ORDER BY history.wp_site;
$$;

REVOKE ALL ON FUNCTION public.get_raptive_history_summary()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_raptive_history_summary()
  TO service_role;

CREATE OR REPLACE FUNCTION public.get_raptive_entry_rollup(
  p_date_from date,
  p_date_to date,
  p_site text DEFAULT NULL
)
RETURNS TABLE (
  entry_id uuid,
  earnings numeric,
  sessions bigint,
  pageviews bigint
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT revenue.entry_id,
    sum(revenue.earnings), sum(revenue.sessions), sum(revenue.pageviews)
  FROM (
    SELECT entry_id, wp_site, date, earnings, sessions, pageviews
    FROM public.raptive_revenue
    UNION ALL
    SELECT entry_id, wp_site, date, earnings, sessions, pageviews
    FROM public.raptive_history_daily
  ) revenue
  WHERE revenue.entry_id IS NOT NULL
    AND revenue.date >= p_date_from AND revenue.date <= p_date_to
    AND (p_site IS NULL OR revenue.wp_site = p_site)
  GROUP BY revenue.entry_id;
$$;

REVOKE ALL ON FUNCTION public.get_raptive_entry_rollup(date, date, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_raptive_entry_rollup(date, date, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.get_analytics_overview(
  p_date_from date,
  p_date_to date,
  p_site text DEFAULT NULL,
  p_tier_id uuid DEFAULT NULL,
  p_category_id uuid DEFAULT NULL,
  p_author_id uuid DEFAULT NULL
)
RETURNS TABLE (
  entry_id uuid,
  title text,
  site text,
  tier_id uuid,
  category_id uuid,
  publish_date timestamptz,
  word_count integer,
  date date,
  pageviews integer,
  sessions integer,
  avg_time_on_page real,
  earnings decimal
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT
    e.id,
    e.title,
    e.site,
    e.tier_id,
    e.category_id,
    e.publish_date,
    e.word_count,
    aa.date,
    aa.pageviews,
    aa.sessions,
    aa.avg_time_on_page,
    COALESCE(rr.earnings, 0)
  FROM public.article_analytics aa
  JOIN public.entries e ON e.id = aa.entry_id
  LEFT JOIN (
    SELECT revenue.entry_id, SUM(revenue.earnings) AS earnings
    FROM (
      SELECT entry_id, earnings, date FROM public.raptive_revenue
      UNION ALL
      SELECT entry_id, earnings, date FROM public.raptive_history_daily
    ) revenue
    WHERE revenue.date >= p_date_from AND revenue.date <= p_date_to
      AND revenue.entry_id IS NOT NULL
    GROUP BY revenue.entry_id
  ) rr ON rr.entry_id = aa.entry_id
  WHERE aa.date >= p_date_from
    AND aa.date <= p_date_to
    AND e.is_archived = false
    AND (p_site IS NULL OR e.site = p_site)
    AND (p_tier_id IS NULL OR e.tier_id = p_tier_id)
    AND (p_category_id IS NULL OR e.category_id = p_category_id)
    AND (p_author_id IS NULL OR EXISTS (
      SELECT 1 FROM public.entry_authors ea
      WHERE ea.entry_id = e.id AND ea.user_id = p_author_id
    ));
$$;

-- Rollback: drop raptive_history_daily and upsert_raptive_history_batch, then
-- restore get_analytics_overview from 0011. Preserve exported history first.
