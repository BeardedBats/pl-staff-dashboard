CREATE OR REPLACE FUNCTION get_analytics_overview(
  p_date_from DATE,
  p_date_to DATE,
  p_site TEXT DEFAULT NULL,
  p_tier_id UUID DEFAULT NULL,
  p_category_id UUID DEFAULT NULL,
  p_author_id UUID DEFAULT NULL
)
RETURNS TABLE (
  entry_id UUID,
  title TEXT,
  site TEXT,
  tier_id UUID,
  category_id UUID,
  publish_date TIMESTAMPTZ,
  word_count INTEGER,
  date DATE,
  pageviews INTEGER,
  sessions INTEGER,
  avg_time_on_page REAL,
  earnings DECIMAL
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    e.id AS entry_id,
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
    COALESCE(rr.earnings, 0) AS earnings
  FROM article_analytics aa
  JOIN entries e ON e.id = aa.entry_id
  LEFT JOIN (
    SELECT entry_id, SUM(earnings) AS earnings
    FROM raptive_revenue
    WHERE date >= p_date_from AND date <= p_date_to
    GROUP BY entry_id
  ) rr ON rr.entry_id = aa.entry_id
  WHERE aa.date >= p_date_from
    AND aa.date <= p_date_to
    AND e.is_archived = false
    AND (p_site IS NULL OR e.site = p_site)
    AND (p_tier_id IS NULL OR e.tier_id = p_tier_id)
    AND (p_category_id IS NULL OR e.category_id = p_category_id)
    AND (p_author_id IS NULL OR EXISTS (
      SELECT 1 FROM entry_authors ea
      WHERE ea.entry_id = e.id AND ea.user_id = p_author_id
    ))
$$;
