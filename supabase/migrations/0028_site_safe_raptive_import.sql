-- Preserve the source site for historical Raptive workbook rows. The Creator
-- export contains Pitcher List and QB List paths in one sheet, including
-- identical paths such as "/" that must remain separate financial records.

CREATE OR REPLACE FUNCTION public.commit_raptive_import(
  p_import_run_id UUID,
  p_rows JSONB,
  p_date_range_start DATE,
  p_date_range_end DATE,
  p_file_name TEXT,
  p_uploaded_by UUID,
  p_summary JSONB
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_inserted INTEGER;
  v_run public.import_runs%ROWTYPE;
  v_rows JSONB;
  v_legacy_site_inference BOOLEAN;
BEGIN
  SELECT * INTO v_run
  FROM public.import_runs
  WHERE id = p_import_run_id
  FOR UPDATE;
  IF NOT FOUND
    OR v_run.status <> 'running'
    OR v_run.import_type <> 'raptive'
    OR v_run.requested_by IS DISTINCT FROM p_uploaded_by
    OR v_run.file_name IS DISTINCT FROM p_file_name
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'raptive_import_run_invalid';
  END IF;
  IF p_summary IS NULL
    OR jsonb_typeof(p_summary) <> 'object'
    OR pg_column_size(p_summary) > 8192
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'raptive_summary_invalid';
  END IF;
  IF p_rows IS NULL
    OR jsonb_typeof(p_rows) <> 'array'
    OR jsonb_array_length(p_rows) = 0
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'raptive_rows_required';
  END IF;
  IF jsonb_array_length(p_rows) > 100000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'raptive_row_limit_exceeded';
  END IF;

  -- Database migrations deploy before the application. During that narrow
  -- window, safely recognize absolute URLs emitted by the previous parser;
  -- relative or unknown URLs still fail closed without an explicit site.
  SELECT NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_rows) item
    WHERE nullif(item->>'wp_site', '') IS NOT NULL
  ) INTO v_legacy_site_inference;
  SELECT jsonb_agg(
    CASE
      WHEN nullif(item->>'wp_site', '') IS NOT NULL THEN item
      WHEN lower(item->>'page_url') ~ '^https?://football\.pitcherlist\.com([/:?#]|$)'
        THEN item || jsonb_build_object('wp_site', 'qb')
      WHEN lower(item->>'page_url') ~ '^https?://(www\.)?pitcherlist\.com([/:?#]|$)'
        THEN item || jsonb_build_object('wp_site', 'pl')
      ELSE item
    END
  ) INTO v_rows
  FROM jsonb_array_elements(p_rows) item;
  IF p_date_range_start IS NULL
    OR p_date_range_end IS NULL
    OR p_date_range_start > p_date_range_end
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'raptive_date_range_invalid';
  END IF;
  IF nullif(btrim(p_file_name), '') IS NULL OR length(p_file_name) > 255 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'raptive_file_name_invalid';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_rows) item
    WHERE jsonb_typeof(item) <> 'object'
      OR item->>'wp_site' NOT IN ('pl', 'qb')
      OR coalesce(item->>'date', '') !~ '^\d{4}-\d{2}-\d{2}$'
      OR nullif(btrim(item->>'page_url'), '') IS NULL
      OR item->>'earnings' IS NULL
      OR item->>'rpm' IS NULL
      OR item->>'page_rpm' IS NULL
      OR item->>'sessions' IS NULL
      OR item->>'pageviews' IS NULL
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'raptive_row_shape_invalid';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_rows) item
    WHERE nullif(item->>'entry_id', '') IS NOT NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.entries entry
        WHERE entry.id = (item->>'entry_id')::uuid
          AND entry.site = item->>'wp_site'
      )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'raptive_entry_site_mismatch';
  END IF;
  IF (
    SELECT count(*) FROM jsonb_array_elements(v_rows)
  ) <> (
    SELECT count(DISTINCT
      (item->>'wp_site') || chr(31) ||
      (item->>'date') || chr(31) ||
      lower(btrim(item->>'page_url'))
    )
    FROM jsonb_array_elements(v_rows) item
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'raptive_duplicate_rows';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_rows) item
    WHERE (item->>'date')::date < p_date_range_start
      OR (item->>'date')::date > p_date_range_end
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'raptive_row_outside_range';
  END IF;

  IF v_legacy_site_inference THEN
    -- Preserve the previous app's all-site replacement semantics only during
    -- the database-first deployment window.
    DELETE FROM public.raptive_revenue revenue
    WHERE revenue.date >= p_date_range_start
      AND revenue.date <= p_date_range_end;
  ELSE
    DELETE FROM public.raptive_revenue revenue
    WHERE revenue.date >= p_date_range_start
      AND revenue.date <= p_date_range_end
      AND revenue.wp_site IN (
        SELECT DISTINCT item->>'wp_site'
        FROM jsonb_array_elements(v_rows) item
      );
  END IF;

  INSERT INTO public.raptive_revenue (
    wp_site, entry_id, date, page_url, earnings, rpm, page_rpm, sessions, pageviews
  )
  SELECT
    item->>'wp_site',
    nullif(item->>'entry_id', '')::uuid,
    (item->>'date')::date,
    btrim(item->>'page_url'),
    (item->>'earnings')::numeric,
    (item->>'rpm')::numeric,
    (item->>'page_rpm')::numeric,
    (item->>'sessions')::integer,
    (item->>'pageviews')::integer
  FROM jsonb_array_elements(v_rows) item;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  INSERT INTO public.raptive_uploads (
    uploaded_by, file_name, date_range_start, date_range_end,
    rows_imported, import_run_id
  ) VALUES (
    p_uploaded_by, p_file_name, p_date_range_start, p_date_range_end,
    v_inserted, p_import_run_id
  );

  UPDATE public.import_runs
  SET status = 'succeeded',
      finished_at = now(),
      rows_processed = v_inserted,
      date_range_start = p_date_range_start,
      date_range_end = p_date_range_end,
      error_code = NULL,
      summary = p_summary || jsonb_build_object('rows_inserted', v_inserted)
  WHERE id = p_import_run_id AND status = 'running';

  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.commit_raptive_import(UUID,JSONB,DATE,DATE,TEXT,UUID,JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_raptive_import(UUID,JSONB,DATE,DATE,TEXT,UUID,JSONB)
  TO service_role;

-- Rollback: restore the 0022 function definition before rolling the app back.
-- Forward repair is preferred after any successful site-attributed import,
-- because reverting would make unmatched historical rows ambiguous again.
