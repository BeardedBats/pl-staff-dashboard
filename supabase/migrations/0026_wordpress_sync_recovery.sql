-- Durable, server-only WordPress synchronization attempts.
CREATE TABLE public.wordpress_sync_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site TEXT NOT NULL CHECK (site IN ('pl', 'qb')),
  wp_post_id INTEGER NOT NULL CHECK (wp_post_id > 0),
  event_key TEXT NOT NULL CHECK (
    length(event_key) BETWEEN 1 AND 160
    AND event_key ~ '^[A-Za-z0-9][A-Za-z0-9:._-]*$'
  ),
  source TEXT NOT NULL CHECK (source IN ('webhook', 'scheduled', 'manual')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'succeeded', 'failed')),
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count BETWEEN 0 AND 3),
  last_error TEXT CHECK (last_error IS NULL OR length(last_error) <= 500),
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_attempt_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  UNIQUE (site, event_key),
  CHECK (
    (status IN ('pending', 'processing') AND completed_at IS NULL)
    OR (status IN ('succeeded', 'failed') AND completed_at IS NOT NULL)
  )
);

CREATE INDEX wordpress_sync_events_recovery_idx
  ON public.wordpress_sync_events (status, requested_at)
  WHERE status IN ('pending', 'failed');

ALTER TABLE public.wordpress_sync_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wordpress_sync_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.wordpress_sync_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.wordpress_sync_events TO service_role;

CREATE OR REPLACE FUNCTION public.begin_wordpress_sync_event(
  p_site TEXT,
  p_wp_post_id INTEGER,
  p_event_key TEXT,
  p_source TEXT
)
RETURNS TABLE(event_id UUID, should_process BOOLEAN, attempt_count INTEGER)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_event public.wordpress_sync_events%ROWTYPE;
BEGIN
  INSERT INTO public.wordpress_sync_events (
    site, wp_post_id, event_key, source
  ) VALUES (
    p_site, p_wp_post_id, p_event_key, p_source
  )
  ON CONFLICT (site, event_key) DO NOTHING;

  SELECT * INTO v_event
  FROM public.wordpress_sync_events
  WHERE site = p_site AND event_key = p_event_key
  FOR UPDATE;

  IF v_event.status = 'succeeded'
    OR v_event.status = 'processing'
    OR v_event.attempt_count >= 3 THEN
    RETURN QUERY SELECT v_event.id, false, v_event.attempt_count;
    RETURN;
  END IF;

  UPDATE public.wordpress_sync_events
  SET status = 'processing',
      attempt_count = wordpress_sync_events.attempt_count + 1,
      last_attempt_at = now(),
      completed_at = NULL,
      last_error = NULL
  WHERE id = v_event.id
  RETURNING wordpress_sync_events.attempt_count INTO v_event.attempt_count;

  RETURN QUERY SELECT v_event.id, true, v_event.attempt_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.finish_wordpress_sync_event(
  p_event_id UUID,
  p_succeeded BOOLEAN,
  p_error TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_changed INTEGER;
BEGIN
  UPDATE public.wordpress_sync_events
  SET status = CASE WHEN p_succeeded THEN 'succeeded' ELSE 'failed' END,
      last_error = CASE
        WHEN p_succeeded THEN NULL
        ELSE left(coalesce(nullif(trim(p_error), ''), 'unknown'), 500)
      END,
      completed_at = now()
  WHERE id = p_event_id AND status = 'processing';
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  RETURN v_changed = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.begin_wordpress_sync_event(TEXT, INTEGER, TEXT, TEXT)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_wordpress_sync_event(UUID, BOOLEAN, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_wordpress_sync_event(TEXT, INTEGER, TEXT, TEXT)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_wordpress_sync_event(UUID, BOOLEAN, TEXT)
  TO service_role;
