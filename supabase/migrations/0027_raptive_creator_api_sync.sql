-- =========================================================================
-- Migration 0027: Raptive Creator API connection state and atomic daily sync
-- =========================================================================

ALTER TABLE public.raptive_revenue
  ADD COLUMN wp_site TEXT
    CHECK (wp_site IS NULL OR wp_site IN ('pl', 'qb'));

UPDATE public.raptive_revenue revenue
SET wp_site = entry.site
FROM public.entries entry
WHERE revenue.entry_id = entry.id
  AND revenue.wp_site IS NULL;

CREATE OR REPLACE FUNCTION public.assign_raptive_revenue_site()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.wp_site IS NULL AND NEW.entry_id IS NOT NULL THEN
    SELECT site INTO NEW.wp_site
    FROM public.entries
    WHERE id = NEW.entry_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_raptive_revenue_assign_site
  BEFORE INSERT OR UPDATE OF entry_id, wp_site ON public.raptive_revenue
  FOR EACH ROW EXECUTE FUNCTION public.assign_raptive_revenue_site();

CREATE INDEX raptive_revenue_site_date_idx
  ON public.raptive_revenue (wp_site, date DESC);

CREATE TABLE public.raptive_connections (
  wp_site TEXT PRIMARY KEY CHECK (wp_site IN ('pl', 'qb')),
  raptive_site_id TEXT NOT NULL UNIQUE
    CHECK (length(btrim(raptive_site_id)) BETWEEN 1 AND 128),
  site_name TEXT NOT NULL CHECK (length(btrim(site_name)) BETWEEN 1 AND 160),
  site_url TEXT NOT NULL CHECK (length(btrim(site_url)) BETWEEN 1 AND 500),
  enabled BOOLEAN NOT NULL DEFAULT false,
  configured_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  configured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_attempted_date DATE,
  last_successful_date DATE,
  last_synced_at TIMESTAMPTZ,
  last_row_count INTEGER CHECK (last_row_count IS NULL OR last_row_count >= 0),
  last_earnings NUMERIC(14,4),
  last_error_code TEXT CHECK (
    last_error_code IS NULL
    OR last_error_code ~ '^[a-z0-9][a-z0-9._-]{0,99}$'
  ),
  CHECK (
    (last_successful_date IS NULL AND last_synced_at IS NULL)
    OR (last_successful_date IS NOT NULL AND last_synced_at IS NOT NULL)
  )
);

ALTER TABLE public.raptive_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raptive_connections FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.raptive_connections
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.raptive_connections
  TO service_role;

CREATE OR REPLACE FUNCTION public.configure_raptive_connection(
  p_wp_site TEXT,
  p_raptive_site_id TEXT,
  p_site_name TEXT,
  p_site_url TEXT,
  p_configured_by UUID
)
RETURNS public.raptive_connections
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_connection public.raptive_connections;
BEGIN
  IF p_wp_site NOT IN ('pl', 'qb')
    OR length(btrim(coalesce(p_raptive_site_id, ''))) NOT BETWEEN 1 AND 128
    OR length(btrim(coalesce(p_site_name, ''))) NOT BETWEEN 1 AND 160
    OR length(btrim(coalesce(p_site_url, ''))) NOT BETWEEN 1 AND 500
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'raptive_connection_invalid';
  END IF;

  INSERT INTO public.raptive_connections (
    wp_site,
    raptive_site_id,
    site_name,
    site_url,
    enabled,
    configured_by
  ) VALUES (
    p_wp_site,
    btrim(p_raptive_site_id),
    btrim(p_site_name),
    btrim(p_site_url),
    false,
    p_configured_by
  )
  ON CONFLICT (wp_site) DO UPDATE
  SET raptive_site_id = EXCLUDED.raptive_site_id,
      site_name = EXCLUDED.site_name,
      site_url = EXCLUDED.site_url,
      enabled = false,
      configured_by = EXCLUDED.configured_by,
      configured_at = now(),
      updated_at = now(),
      last_attempted_date = NULL,
      last_successful_date = NULL,
      last_synced_at = NULL,
      last_row_count = NULL,
      last_earnings = NULL,
      last_error_code = NULL
  RETURNING * INTO v_connection;

  RETURN v_connection;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_raptive_connection_enabled(
  p_wp_site TEXT,
  p_enabled BOOLEAN
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_changed INTEGER;
BEGIN
  UPDATE public.raptive_connections
  SET enabled = p_enabled,
      updated_at = now(),
      last_error_code = CASE WHEN p_enabled THEN last_error_code ELSE NULL END
  WHERE wp_site = p_wp_site;
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  RETURN v_changed = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.fail_raptive_live_sync(
  p_wp_site TEXT,
  p_raptive_site_id TEXT,
  p_sync_date DATE,
  p_error_code TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_changed INTEGER;
BEGIN
  IF p_error_code IS NULL
    OR p_error_code !~ '^[a-z0-9][a-z0-9._-]{0,99}$'
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'raptive_error_code_invalid';
  END IF;

  UPDATE public.raptive_connections
  SET last_attempted_date = p_sync_date,
      last_error_code = p_error_code,
      updated_at = now()
  WHERE wp_site = p_wp_site
    AND raptive_site_id = p_raptive_site_id
    AND enabled = true;
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  RETURN v_changed = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.commit_raptive_live_sync(
  p_wp_site TEXT,
  p_raptive_site_id TEXT,
  p_sync_date DATE,
  p_rows JSONB,
  p_summary JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_inserted INTEGER;
  v_connection public.raptive_connections%ROWTYPE;
  v_total_earnings NUMERIC(14,4);
BEGIN
  SELECT * INTO v_connection
  FROM public.raptive_connections
  WHERE wp_site = p_wp_site
  FOR UPDATE;

  IF NOT FOUND
    OR v_connection.enabled = false
    OR v_connection.raptive_site_id IS DISTINCT FROM p_raptive_site_id
  THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'raptive_connection_disabled';
  END IF;
  IF p_sync_date IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'raptive_sync_date_required';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'raptive_rows_invalid';
  END IF;
  IF jsonb_array_length(p_rows) > 100000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'raptive_row_limit_exceeded';
  END IF;
  IF p_summary IS NULL
    OR jsonb_typeof(p_summary) <> 'object'
    OR pg_column_size(p_summary) > 8192
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'raptive_summary_invalid';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_rows) item
    WHERE jsonb_typeof(item) <> 'object'
      OR coalesce(item->>'date', '') !~ '^\d{4}-\d{2}-\d{2}$'
      OR (item->>'date')::date IS DISTINCT FROM p_sync_date
      OR nullif(btrim(item->>'page_url'), '') IS NULL
      OR item->>'earnings' IS NULL
      OR item->>'rpm' IS NULL
      OR item->>'page_rpm' IS NULL
      OR item->>'sessions' IS NULL
      OR item->>'pageviews' IS NULL
      OR (item->>'sessions')::integer < 0
      OR (item->>'pageviews')::integer < 0
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'raptive_row_shape_invalid';
  END IF;
  IF (
    SELECT count(*) FROM jsonb_array_elements(p_rows)
  ) <> (
    SELECT count(DISTINCT lower(btrim(item->>'page_url')))
    FROM jsonb_array_elements(p_rows) item
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'raptive_duplicate_rows';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.raptive_revenue
    WHERE date = p_sync_date AND wp_site IS NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'raptive_unattributed_overlap';
  END IF;

  DELETE FROM public.raptive_revenue
  WHERE date = p_sync_date AND wp_site = p_wp_site;

  INSERT INTO public.raptive_revenue (
    entry_id,
    date,
    page_url,
    earnings,
    rpm,
    page_rpm,
    sessions,
    pageviews,
    wp_site
  )
  SELECT
    nullif(item->>'entry_id', '')::uuid,
    (item->>'date')::date,
    btrim(item->>'page_url'),
    (item->>'earnings')::numeric,
    (item->>'rpm')::numeric,
    (item->>'page_rpm')::numeric,
    (item->>'sessions')::integer,
    (item->>'pageviews')::integer,
    p_wp_site
  FROM jsonb_array_elements(p_rows) item;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  SELECT coalesce(sum((item->>'earnings')::numeric), 0)
  INTO v_total_earnings
  FROM jsonb_array_elements(p_rows) item;

  UPDATE public.raptive_connections
  SET last_attempted_date = p_sync_date,
      last_successful_date = p_sync_date,
      last_synced_at = now(),
      last_row_count = v_inserted,
      last_earnings = v_total_earnings,
      last_error_code = NULL,
      updated_at = now()
  WHERE wp_site = p_wp_site;

  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.configure_raptive_connection(TEXT,TEXT,TEXT,TEXT,UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_raptive_connection_enabled(TEXT,BOOLEAN)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_raptive_live_sync(TEXT,TEXT,DATE,TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commit_raptive_live_sync(TEXT,TEXT,DATE,JSONB,JSONB)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assign_raptive_revenue_site()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.configure_raptive_connection(TEXT,TEXT,TEXT,TEXT,UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.set_raptive_connection_enabled(TEXT,BOOLEAN)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_raptive_live_sync(TEXT,TEXT,DATE,TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.commit_raptive_live_sync(TEXT,TEXT,DATE,JSONB,JSONB)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.assign_raptive_revenue_site()
  TO service_role;
