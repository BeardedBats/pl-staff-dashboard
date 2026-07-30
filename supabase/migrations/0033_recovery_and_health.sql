-- Preserve WordPress drafts whose authors are not mapped yet, make dashboard
-- draft creation atomic, and return one latest cron row per registered job.

CREATE TABLE public.wp_sync_backlog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  site text NOT NULL CHECK (site IN ('pl', 'qb')),
  wp_post_id integer NOT NULL,
  wp_author_id integer NOT NULL,
  payload jsonb NOT NULL CHECK (
    jsonb_typeof(payload) = 'object' AND pg_column_size(payload) <= 65536
  ),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  attempt_count integer NOT NULL DEFAULT 1 CHECK (attempt_count > 0),
  UNIQUE (site, wp_post_id)
);

ALTER TABLE public.wp_sync_backlog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wp_sync_backlog FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.wp_sync_backlog FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.wp_sync_backlog TO service_role;

CREATE OR REPLACE FUNCTION public.queue_wp_sync_backlog(
  p_site text,
  p_wp_post_id integer,
  p_wp_author_id integer,
  p_payload jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  INSERT INTO public.wp_sync_backlog (
    site, wp_post_id, wp_author_id, payload
  ) VALUES (
    p_site, p_wp_post_id, p_wp_author_id, p_payload
  )
  ON CONFLICT (site, wp_post_id) DO UPDATE
  SET wp_author_id = EXCLUDED.wp_author_id,
      payload = EXCLUDED.payload,
      last_seen_at = now(),
      attempt_count = wp_sync_backlog.attempt_count + 1;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_wp_draft_entry(
  p_title text,
  p_site text,
  p_tier_id uuid,
  p_wp_post_id integer,
  p_wp_post_url text,
  p_wp_status text,
  p_wp_modified_at text,
  p_user_id uuid,
  p_is_drafted boolean
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_entry_id uuid;
BEGIN
  INSERT INTO public.entries (
    title,
    site,
    tier_id,
    wp_post_id,
    wp_post_url,
    wp_status,
    wp_modified_at,
    wp_sync_status,
    wp_last_synced_at,
    wp_last_sync_error,
    content_status,
    editor_status,
    created_by,
    is_drafted
  ) VALUES (
    p_title,
    p_site,
    p_tier_id,
    p_wp_post_id,
    NULLIF(p_wp_post_url, ''),
    p_wp_status,
    NULLIF(p_wp_modified_at, '')::timestamptz,
    'synced',
    now(),
    NULL,
    'claimed',
    'none',
    p_user_id,
    p_is_drafted
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_entry_id;

  IF v_entry_id IS NULL THEN
    SELECT id INTO v_entry_id
    FROM public.entries
    WHERE site = p_site AND wp_post_id = p_wp_post_id;
    RETURN v_entry_id;
  END IF;

  INSERT INTO public.entry_authors (entry_id, user_id, role)
  VALUES (v_entry_id, p_user_id, 'primary');

  INSERT INTO public.entry_checklist (
    entry_id, checklist_item_id, is_completed
  )
  SELECT v_entry_id, item.id, false
  FROM public.checklist_items item
  WHERE item.tier_id = p_tier_id;

  INSERT INTO public.audit_log (
    entry_id, user_id, action, new_value
  ) VALUES (
    v_entry_id, p_user_id, 'created', 'auto-picked up from WordPress draft'
  );

  DELETE FROM public.wp_sync_backlog
  WHERE site = p_site AND wp_post_id = p_wp_post_id;

  RETURN v_entry_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_latest_vercel_cron_runs()
RETURNS TABLE (
  job_name text,
  status text,
  started_at timestamptz,
  finished_at timestamptz,
  lease_expires_at timestamptz,
  error_code text,
  attempt integer
)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT DISTINCT ON (run.job_name)
    run.job_name,
    run.status,
    run.started_at,
    run.finished_at,
    run.lease_expires_at,
    run.error_code,
    run.attempt
  FROM public.cron_runs run
  WHERE run.source = 'vercel'
  ORDER BY run.job_name, run.started_at DESC;
$$;

REVOKE ALL ON FUNCTION public.queue_wp_sync_backlog(text, integer, integer, jsonb)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_wp_draft_entry(text, text, uuid, integer, text, text, text, uuid, boolean)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_latest_vercel_cron_runs()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.queue_wp_sync_backlog(text, integer, integer, jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.create_wp_draft_entry(text, text, uuid, integer, text, text, text, uuid, boolean)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.get_latest_vercel_cron_runs()
  TO service_role;

INSERT INTO public.import_runs (
  import_type,
  status,
  file_name,
  started_at,
  finished_at,
  rows_processed,
  date_range_start,
  date_range_end,
  summary
)
SELECT
  'raptive',
  'succeeded',
  'legacy-compact-history-backfill',
  now(),
  now(),
  count(*)::integer,
  min(history.date),
  max(history.date),
  jsonb_build_object(
    'mode', 'compact-history',
    'recordedByMigration', '0033'
  )
FROM public.raptive_history_daily history
HAVING count(*) > 0
  AND NOT EXISTS (
    SELECT 1
    FROM public.import_runs run
    WHERE run.import_type = 'raptive'
  );

-- Rollback: preserve or export wp_sync_backlog, then drop these functions
-- and the table. Existing dashboard entries are not changed.
