-- =========================================================================
-- Migration 0022: Durable operational alerts and import-run visibility
-- =========================================================================

CREATE TABLE public.operational_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint TEXT NOT NULL UNIQUE
    CHECK (fingerprint ~ '^[a-z0-9][a-z0-9:._-]{0,127}$'),
  severity TEXT NOT NULL CHECK (severity IN ('warning', 'critical')),
  component TEXT NOT NULL
    CHECK (component ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  event_name TEXT NOT NULL
    CHECK (event_name ~ '^[a-z0-9][a-z0-9._-]{0,99}$'),
  error_code TEXT NOT NULL
    CHECK (error_code ~ '^[a-z0-9][a-z0-9._-]{0,99}$'),
  summary TEXT NOT NULL CHECK (length(summary) BETWEEN 1 AND 240),
  remediation TEXT NOT NULL CHECK (length(remediation) BETWEEN 1 AND 500),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object' AND pg_column_size(metadata) <= 8192),
  occurrence_count INTEGER NOT NULL DEFAULT 1 CHECK (occurrence_count > 0),
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  CHECK (last_seen_at >= first_seen_at),
  CHECK (resolved_at IS NULL OR resolved_at >= first_seen_at)
);

CREATE INDEX operational_alerts_open_severity_idx
  ON public.operational_alerts (severity, last_seen_at DESC)
  WHERE resolved_at IS NULL;

CREATE TABLE public.import_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_type TEXT NOT NULL
    CHECK (import_type ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  status TEXT NOT NULL DEFAULT 'running'
    CHECK (status IN ('running', 'succeeded', 'failed')),
  file_name TEXT NOT NULL CHECK (length(file_name) BETWEEN 1 AND 255),
  requested_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  rows_processed INTEGER CHECK (rows_processed IS NULL OR rows_processed >= 0),
  date_range_start DATE,
  date_range_end DATE,
  error_code TEXT CHECK (
    error_code IS NULL OR error_code ~ '^[a-z0-9][a-z0-9._-]{0,99}$'
  ),
  summary JSONB NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(summary) = 'object' AND pg_column_size(summary) <= 8192),
  CHECK (
    (date_range_start IS NULL AND date_range_end IS NULL)
    OR (date_range_start IS NOT NULL AND date_range_end IS NOT NULL
      AND date_range_start <= date_range_end)
  ),
  CHECK (
    (status = 'running' AND finished_at IS NULL AND error_code IS NULL)
    OR (status = 'succeeded' AND finished_at IS NOT NULL
      AND rows_processed IS NOT NULL AND error_code IS NULL)
    OR (status = 'failed' AND finished_at IS NOT NULL AND error_code IS NOT NULL)
  )
);

CREATE INDEX import_runs_type_started_idx
  ON public.import_runs (import_type, started_at DESC);
CREATE INDEX import_runs_running_idx
  ON public.import_runs (started_at)
  WHERE status = 'running';

ALTER TABLE public.raptive_uploads
  ADD COLUMN import_run_id UUID UNIQUE
  REFERENCES public.import_runs(id) ON DELETE SET NULL;

ALTER TABLE public.operational_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_alerts FORCE ROW LEVEL SECURITY;
ALTER TABLE public.import_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_runs FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.operational_alerts, public.import_runs
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.operational_alerts, public.import_runs TO service_role;

CREATE OR REPLACE FUNCTION public.record_operational_alert(
  p_fingerprint TEXT,
  p_severity TEXT,
  p_component TEXT,
  p_event_name TEXT,
  p_error_code TEXT,
  p_summary TEXT,
  p_remediation TEXT,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.operational_alerts (
    fingerprint,
    severity,
    component,
    event_name,
    error_code,
    summary,
    remediation,
    metadata
  ) VALUES (
    p_fingerprint,
    p_severity,
    p_component,
    p_event_name,
    p_error_code,
    p_summary,
    p_remediation,
    coalesce(p_metadata, '{}'::jsonb)
  )
  ON CONFLICT (fingerprint) DO UPDATE
  SET severity = EXCLUDED.severity,
      component = EXCLUDED.component,
      event_name = EXCLUDED.event_name,
      error_code = EXCLUDED.error_code,
      summary = EXCLUDED.summary,
      remediation = EXCLUDED.remediation,
      metadata = EXCLUDED.metadata,
      occurrence_count = CASE
        WHEN operational_alerts.resolved_at IS NULL
          THEN operational_alerts.occurrence_count + 1
        ELSE 1
      END,
      first_seen_at = CASE
        WHEN operational_alerts.resolved_at IS NULL
          THEN operational_alerts.first_seen_at
        ELSE now()
      END,
      last_seen_at = now(),
      resolved_at = NULL
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_operational_alert(
  p_fingerprint TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_changed INTEGER;
BEGIN
  UPDATE public.operational_alerts
  SET resolved_at = now()
  WHERE fingerprint = p_fingerprint AND resolved_at IS NULL;
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  RETURN v_changed = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.begin_import_run(
  p_import_type TEXT,
  p_file_name TEXT,
  p_requested_by UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.import_runs (import_type, file_name, requested_by)
  VALUES (p_import_type, p_file_name, p_requested_by)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_import_run(
  p_import_run_id UUID,
  p_succeeded BOOLEAN,
  p_rows_processed INTEGER DEFAULT NULL,
  p_error_code TEXT DEFAULT NULL,
  p_summary JSONB DEFAULT '{}'::jsonb
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_changed INTEGER;
BEGIN
  UPDATE public.import_runs
  SET status = CASE WHEN p_succeeded THEN 'succeeded' ELSE 'failed' END,
      finished_at = now(),
      rows_processed = CASE WHEN p_succeeded THEN coalesce(p_rows_processed, 0) ELSE p_rows_processed END,
      error_code = CASE WHEN p_succeeded THEN NULL ELSE coalesce(p_error_code, 'unknown') END,
      summary = coalesce(p_summary, '{}'::jsonb)
  WHERE id = p_import_run_id AND status = 'running';
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  RETURN v_changed = 1;
END;
$$;

-- The application begins the run before matching/commit work. A successful
-- replacement completes the run and upload history inside the same database
-- transaction, so a lost HTTP response cannot leave an ambiguous outcome.
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
    SELECT count(*) FROM jsonb_array_elements(p_rows)
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

  DELETE FROM public.raptive_revenue
  WHERE date >= p_date_range_start AND date <= p_date_range_end;

  INSERT INTO public.raptive_revenue (
    entry_id, date, page_url, earnings, rpm, page_rpm, sessions, pageviews
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
    rows_imported,
    import_run_id
  ) VALUES (
    p_uploaded_by,
    p_file_name,
    p_date_range_start,
    p_date_range_end,
    v_inserted,
    p_import_run_id
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

REVOKE ALL ON FUNCTION public.record_operational_alert(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,JSONB)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_operational_alert(TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.begin_import_run(TEXT,TEXT,UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_import_run(UUID,BOOLEAN,INTEGER,TEXT,JSONB)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.commit_raptive_import(UUID,JSONB,DATE,DATE,TEXT,UUID,JSONB)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.record_operational_alert(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,JSONB)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_operational_alert(TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.begin_import_run(TEXT,TEXT,UUID)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_import_run(UUID,BOOLEAN,INTEGER,TEXT,JSONB)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.commit_raptive_import(UUID,JSONB,DATE,DATE,TEXT,UUID,JSONB)
  TO service_role;

DROP FUNCTION public.commit_raptive_import(JSONB,DATE,DATE,TEXT,UUID);
