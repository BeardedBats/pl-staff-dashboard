-- =========================================================================
-- Migration 0020: Atomic Raptive range replacement
-- =========================================================================

CREATE OR REPLACE FUNCTION public.commit_raptive_import(
  p_rows jsonb,
  p_date_range_start date,
  p_date_range_end date,
  p_file_name text,
  p_uploaded_by uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_inserted integer;
BEGIN
  IF p_rows IS NULL
    OR jsonb_typeof(p_rows) <> 'array'
    OR jsonb_array_length(p_rows) = 0
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'raptive_rows_required';
  END IF;
  IF jsonb_array_length(p_rows) > 100000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'raptive_row_limit_exceeded';
  END IF;
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
    FROM jsonb_array_elements(p_rows) item
    WHERE jsonb_typeof(item) <> 'object'
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
  IF (
    SELECT count(*)
    FROM jsonb_array_elements(p_rows)
  ) <> (
    SELECT count(DISTINCT (item->>'date') || chr(31) || btrim(item->>'page_url'))
    FROM jsonb_array_elements(p_rows) item
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'raptive_duplicate_rows';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_rows) item
    WHERE (item->>'date')::date < p_date_range_start
      OR (item->>'date')::date > p_date_range_end
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'raptive_row_outside_range';
  END IF;

  -- The delete, complete insert, and upload-history row share one database
  -- transaction. Any malformed row, FK failure, constraint failure, or
  -- history failure restores the prior range automatically.
  DELETE FROM public.raptive_revenue
  WHERE date >= p_date_range_start AND date <= p_date_range_end;

  INSERT INTO public.raptive_revenue (
    entry_id,
    date,
    page_url,
    earnings,
    rpm,
    page_rpm,
    sessions,
    pageviews
  )
  SELECT
    nullif(item->>'entry_id', '')::uuid,
    (item->>'date')::date,
    btrim(item->>'page_url'),
    (item->>'earnings')::numeric,
    (item->>'rpm')::numeric,
    (item->>'page_rpm')::numeric,
    (item->>'sessions')::integer,
    (item->>'pageviews')::integer
  FROM jsonb_array_elements(p_rows) item;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  INSERT INTO public.raptive_uploads (
    uploaded_by,
    file_name,
    date_range_start,
    date_range_end,
    rows_imported
  ) VALUES (
    p_uploaded_by,
    p_file_name,
    p_date_range_start,
    p_date_range_end,
    v_inserted
  );

  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.commit_raptive_import(jsonb,date,date,text,uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.commit_raptive_import(jsonb,date,date,text,uuid)
  TO service_role;
