CREATE TABLE public.cron_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name TEXT NOT NULL CHECK (job_name ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  run_key TEXT NOT NULL CHECK (length(run_key) BETWEEN 1 AND 128),
  source TEXT NOT NULL CHECK (source IN ('vercel', 'manual')),
  status TEXT NOT NULL CHECK (status IN ('running', 'succeeded', 'failed')),
  attempt INTEGER NOT NULL DEFAULT 1 CHECK (attempt BETWEEN 1 AND 3),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  lease_expires_at TIMESTAMPTZ NOT NULL,
  summary JSONB,
  error_code TEXT CHECK (error_code IS NULL OR length(error_code) BETWEEN 1 AND 100),
  UNIQUE (job_name, run_key),
  CHECK (
    (status = 'running' AND finished_at IS NULL)
    OR (status IN ('succeeded', 'failed') AND finished_at IS NOT NULL)
  )
);

CREATE INDEX cron_runs_job_started_idx
  ON public.cron_runs (job_name, started_at DESC);

ALTER TABLE public.cron_runs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.cron_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.cron_runs TO service_role;

CREATE OR REPLACE FUNCTION public.claim_cron_run(
  p_job_name TEXT,
  p_run_key TEXT,
  p_source TEXT,
  p_lease_seconds INTEGER DEFAULT 900
)
RETURNS TABLE(run_id UUID, claim_status TEXT, attempt INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing public.cron_runs%ROWTYPE;
  v_run_id UUID;
  v_attempt INTEGER;
BEGIN
  IF p_job_name IS NULL OR p_job_name !~ '^[a-z0-9][a-z0-9-]{0,63}$' THEN
    RAISE EXCEPTION 'invalid cron job name' USING ERRCODE = '22023';
  END IF;
  IF p_run_key IS NULL OR length(p_run_key) NOT BETWEEN 1 AND 128 THEN
    RAISE EXCEPTION 'invalid cron run key' USING ERRCODE = '22023';
  END IF;
  IF p_source NOT IN ('vercel', 'manual') THEN
    RAISE EXCEPTION 'invalid cron source' USING ERRCODE = '22023';
  END IF;
  IF p_lease_seconds NOT BETWEEN 30 AND 3600 THEN
    RAISE EXCEPTION 'invalid cron lease' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('cron:' || p_job_name, 0));

  IF EXISTS (
    SELECT 1 FROM public.cron_runs
    WHERE job_name = p_job_name
      AND status = 'running'
      AND lease_expires_at > now()
  ) THEN
    RETURN QUERY SELECT NULL::UUID, 'overlap'::TEXT, NULL::INTEGER;
    RETURN;
  END IF;

  SELECT * INTO v_existing
  FROM public.cron_runs
  WHERE job_name = p_job_name AND run_key = p_run_key
  FOR UPDATE;

  IF FOUND THEN
    IF v_existing.status = 'succeeded' THEN
      RETURN QUERY SELECT v_existing.id, 'duplicate'::TEXT, v_existing.attempt;
      RETURN;
    END IF;
    IF v_existing.attempt >= 3 THEN
      RETURN QUERY SELECT v_existing.id, 'exhausted'::TEXT, v_existing.attempt;
      RETURN;
    END IF;

    UPDATE public.cron_runs
    SET source = p_source,
        status = 'running',
        attempt = v_existing.attempt + 1,
        started_at = now(),
        finished_at = NULL,
        lease_expires_at = now() + make_interval(secs => p_lease_seconds),
        summary = NULL,
        error_code = NULL
    WHERE id = v_existing.id
    RETURNING id, cron_runs.attempt INTO v_run_id, v_attempt;

    RETURN QUERY SELECT v_run_id, 'claimed'::TEXT, v_attempt;
    RETURN;
  END IF;

  INSERT INTO public.cron_runs (
    job_name, run_key, source, status, lease_expires_at
  ) VALUES (
    p_job_name, p_run_key, p_source, 'running',
    now() + make_interval(secs => p_lease_seconds)
  )
  RETURNING id, cron_runs.attempt INTO v_run_id, v_attempt;

  RETURN QUERY SELECT v_run_id, 'claimed'::TEXT, v_attempt;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_cron_run(
  p_run_id UUID,
  p_succeeded BOOLEAN,
  p_summary JSONB DEFAULT NULL,
  p_error_code TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_changed INTEGER;
BEGIN
  IF p_run_id IS NULL THEN
    RAISE EXCEPTION 'run id is required' USING ERRCODE = '22023';
  END IF;
  IF p_error_code IS NOT NULL AND length(p_error_code) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'invalid cron error code' USING ERRCODE = '22023';
  END IF;

  UPDATE public.cron_runs
  SET status = CASE WHEN p_succeeded THEN 'succeeded' ELSE 'failed' END,
      finished_at = now(),
      summary = p_summary,
      error_code = CASE WHEN p_succeeded THEN NULL ELSE COALESCE(p_error_code, 'unknown') END
  WHERE id = p_run_id AND status = 'running';
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  RETURN v_changed = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_cron_run(TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_cron_run(UUID, BOOLEAN, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_cron_run(TEXT, TEXT, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_cron_run(UUID, BOOLEAN, JSONB, TEXT) TO service_role;

ALTER TABLE public.notifications
  ADD COLUMN dedupe_key TEXT CHECK (
    dedupe_key IS NULL OR length(dedupe_key) BETWEEN 1 AND 200
  );

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_user_dedupe_unique UNIQUE (user_id, dedupe_key);
