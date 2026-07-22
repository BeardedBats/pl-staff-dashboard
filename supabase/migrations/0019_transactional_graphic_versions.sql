-- =========================================================================
-- Migration 0019: Transactional graphic versions and submission leases
-- =========================================================================

CREATE TABLE public.graphic_request_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.graphic_requests(id) ON DELETE CASCADE,
  version_number integer NOT NULL CHECK (version_number > 0),
  storage_path text NOT NULL UNIQUE CHECK (btrim(storage_path) <> ''),
  file_name text NOT NULL CHECK (btrim(file_name) <> ''),
  file_size integer NOT NULL CHECK (file_size > 0 AND file_size <= 10485760),
  mime_type text NOT NULL CHECK (
    mime_type IN ('image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif')
  ),
  uploaded_by uuid REFERENCES public.users(id),
  wp_media_id integer CHECK (wp_media_id IS NULL OR wp_media_id > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, version_number)
);

ALTER TABLE public.graphic_request_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.graphic_request_versions FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.graphic_request_versions FROM PUBLIC;
REVOKE ALL ON TABLE public.graphic_request_versions FROM anon;
REVOKE ALL ON TABLE public.graphic_request_versions FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.graphic_request_versions TO service_role;

ALTER TABLE public.graphic_requests
  ADD COLUMN current_version_id uuid,
  ADD COLUMN flagged_version_id uuid,
  ADD COLUMN submission_token uuid,
  ADD COLUMN submission_started_at timestamptz;

-- Convert the previously-destructive single current object into version 1.
INSERT INTO public.graphic_request_versions (
  request_id,
  version_number,
  storage_path,
  file_name,
  file_size,
  mime_type,
  uploaded_by,
  wp_media_id,
  created_at
)
SELECT
  gr.id,
  1,
  gr.storage_path,
  coalesce(nullif(btrim(gr.file_name), ''), 'legacy-file'),
  greatest(1, least(coalesce(gr.file_size, 1), 10485760)),
  CASE
    WHEN gr.mime_type IN (
      'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'
    ) THEN gr.mime_type
    ELSE 'image/png'
  END,
  gr.created_by,
  CASE WHEN gr.wp_media_id > 0 THEN gr.wp_media_id ELSE NULL END,
  gr.updated_at
FROM public.graphic_requests gr
WHERE nullif(btrim(gr.storage_path), '') IS NOT NULL;

UPDATE public.graphic_requests gr
SET current_version_id = version.id,
    file_url = NULL
FROM public.graphic_request_versions version
WHERE version.request_id = gr.id AND version.version_number = 1;

ALTER TABLE public.graphic_requests
  ADD CONSTRAINT graphic_requests_current_version_id_fkey
    FOREIGN KEY (current_version_id)
    REFERENCES public.graphic_request_versions(id)
    ON DELETE SET NULL,
  ADD CONSTRAINT graphic_requests_flagged_version_id_fkey
    FOREIGN KEY (flagged_version_id)
    REFERENCES public.graphic_request_versions(id)
    ON DELETE SET NULL,
  ADD CONSTRAINT graphic_requests_private_file_metadata_check
    CHECK (
      file_url IS NULL
      AND (
        (
          storage_path IS NULL
          AND file_name IS NULL
          AND file_size IS NULL
          AND mime_type IS NULL
          AND current_version_id IS NULL
        )
        OR
        (
          storage_path IS NOT NULL
          AND file_name IS NOT NULL
          AND file_size IS NOT NULL
          AND file_size > 0
          AND mime_type IS NOT NULL
          AND current_version_id IS NOT NULL
        )
      )
    ) NOT VALID,
  ADD CONSTRAINT graphic_requests_submission_lease_check
    CHECK (
      (submission_token IS NULL AND submission_started_at IS NULL)
      OR
      (submission_token IS NOT NULL AND submission_started_at IS NOT NULL)
    ) NOT VALID,
  ADD CONSTRAINT graphic_requests_wp_media_id_positive_check
    CHECK (wp_media_id IS NULL OR wp_media_id > 0) NOT VALID;

ALTER TABLE public.graphic_requests
  VALIDATE CONSTRAINT graphic_requests_private_file_metadata_check;
ALTER TABLE public.graphic_requests
  VALIDATE CONSTRAINT graphic_requests_submission_lease_check;
ALTER TABLE public.graphic_requests
  VALIDATE CONSTRAINT graphic_requests_wp_media_id_positive_check;

-- Repair any legacy duplicate featured markers before enforcing one winner.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (
      PARTITION BY entry_id
      ORDER BY updated_at DESC, id
    ) AS position
  FROM public.graphic_requests
  WHERE is_featured
)
UPDATE public.graphic_requests gr
SET is_featured = false
FROM ranked
WHERE ranked.id = gr.id AND ranked.position > 1;

CREATE UNIQUE INDEX graphic_requests_one_featured_per_entry_unique
  ON public.graphic_requests (entry_id)
  WHERE is_featured;

CREATE INDEX graphic_request_versions_request_created_idx
  ON public.graphic_request_versions (request_id, version_number DESC);

CREATE OR REPLACE FUNCTION public.record_graphic_upload(
  p_actor_id uuid,
  p_request_id uuid,
  p_allow_override boolean,
  p_expected_storage_path text,
  p_storage_path text,
  p_file_name text,
  p_file_size integer,
  p_mime_type text
)
RETURNS TABLE(
  recorded_version_id uuid,
  recorded_version_number integer,
  previous_storage_path text
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_request public.graphic_requests%ROWTYPE;
  v_version_id uuid;
  v_version_number integer;
BEGIN
  SELECT * INTO v_request
  FROM public.graphic_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'graphic_request_not_found';
  END IF;
  IF v_request.storage_path IS DISTINCT FROM nullif(p_expected_storage_path, '') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'graphic_upload_conflict';
  END IF;
  IF v_request.graphic_status NOT IN ('needed', 'claimed', 'flagged') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'graphic_not_uploadable';
  END IF;
  IF NOT p_allow_override AND v_request.claimed_by IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'graphic_assignee_required';
  END IF;
  IF p_file_size < 1 OR p_file_size > 10485760 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'graphic_file_size_invalid';
  END IF;
  IF p_mime_type NOT IN (
    'image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'graphic_mime_type_invalid';
  END IF;
  IF nullif(btrim(p_storage_path), '') IS NULL
    OR nullif(btrim(p_file_name), '') IS NULL
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'graphic_file_metadata_invalid';
  END IF;

  SELECT coalesce(max(version_number), 0) + 1
  INTO v_version_number
  FROM public.graphic_request_versions
  WHERE request_id = p_request_id;

  INSERT INTO public.graphic_request_versions (
    request_id,
    version_number,
    storage_path,
    file_name,
    file_size,
    mime_type,
    uploaded_by
  ) VALUES (
    p_request_id,
    v_version_number,
    p_storage_path,
    p_file_name,
    p_file_size,
    lower(p_mime_type),
    p_actor_id
  )
  RETURNING id INTO v_version_id;

  UPDATE public.graphic_requests
  SET storage_path = p_storage_path,
      file_name = p_file_name,
      file_size = p_file_size,
      mime_type = lower(p_mime_type),
      current_version_id = v_version_id,
      wp_media_id = NULL,
      submission_token = NULL,
      submission_started_at = NULL,
      is_featured = false,
      graphic_status = CASE
        WHEN graphic_status = 'needed' THEN 'claimed'
        ELSE graphic_status
      END,
      claimed_by = CASE
        WHEN claimed_by IS NULL THEN p_actor_id
        ELSE claimed_by
      END,
      updated_at = clock_timestamp()
  WHERE id = p_request_id;

  INSERT INTO public.audit_log (
    entry_id, user_id, action, field_name, old_value, new_value
  ) VALUES (
    v_request.entry_id,
    p_actor_id,
    'graphic_update',
    'graphic_version',
    v_request.current_version_id::text,
    v_version_id::text
  );

  RETURN QUERY
  SELECT v_version_id, v_version_number, v_request.storage_path;
END;
$$;

CREATE OR REPLACE FUNCTION public.begin_graphic_submission(
  p_actor_id uuid,
  p_request_id uuid,
  p_allow_override boolean
)
RETURNS TABLE(
  lease_token uuid,
  leased_entry_id uuid,
  graphic_title text,
  leased_storage_path text,
  leased_file_name text,
  leased_mime_type text,
  existing_wp_media_id integer
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_request public.graphic_requests%ROWTYPE;
  v_token uuid := gen_random_uuid();
BEGIN
  SELECT * INTO v_request
  FROM public.graphic_requests
  WHERE id = p_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'graphic_request_not_found';
  END IF;
  IF v_request.graphic_status = 'submitted' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'graphic_already_submitted';
  END IF;
  IF v_request.graphic_status = 'flagged' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'flagged_graphic_requires_review';
  END IF;
  IF v_request.graphic_status <> 'claimed' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'graphic_not_claimed';
  END IF;
  IF NOT p_allow_override AND v_request.claimed_by IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'graphic_assignee_required';
  END IF;
  IF v_request.current_version_id IS NULL
    OR v_request.storage_path IS NULL
    OR v_request.file_name IS NULL
    OR v_request.mime_type IS NULL
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'graphic_file_required';
  END IF;
  IF v_request.submission_token IS NOT NULL
    AND v_request.submission_started_at > now() - interval '15 minutes'
  THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'graphic_submission_in_progress';
  END IF;

  UPDATE public.graphic_requests
  SET submission_token = v_token,
      submission_started_at = clock_timestamp(),
      updated_at = clock_timestamp()
  WHERE id = p_request_id;

  RETURN QUERY SELECT
    v_token,
    v_request.entry_id,
    v_request.title,
    v_request.storage_path,
    v_request.file_name,
    v_request.mime_type,
    v_request.wp_media_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_graphic_wp_media(
  p_request_id uuid,
  p_submission_token uuid,
  p_wp_media_id integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_request public.graphic_requests%ROWTYPE;
BEGIN
  IF p_wp_media_id < 1 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'wp_media_id_invalid';
  END IF;

  SELECT * INTO v_request
  FROM public.graphic_requests
  WHERE id = p_request_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'graphic_request_not_found';
  END IF;
  IF v_request.submission_token IS DISTINCT FROM p_submission_token THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'graphic_submission_lease_lost';
  END IF;

  UPDATE public.graphic_requests
  SET wp_media_id = p_wp_media_id, updated_at = clock_timestamp()
  WHERE id = p_request_id;
  UPDATE public.graphic_request_versions
  SET wp_media_id = p_wp_media_id
  WHERE id = v_request.current_version_id;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_graphic_submission(
  p_actor_id uuid,
  p_request_id uuid,
  p_submission_token uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_request public.graphic_requests%ROWTYPE;
  v_entry_id uuid;
BEGIN
  -- Serialize completions by parent entry before locking any individual
  -- request. Locking each request first can deadlock when two different
  -- requests for the same entry complete concurrently.
  SELECT entry_id INTO v_entry_id
  FROM public.graphic_requests
  WHERE id = p_request_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'graphic_request_not_found';
  END IF;

  PERFORM 1
  FROM public.entries
  WHERE id = v_entry_id
  FOR UPDATE;

  SELECT * INTO v_request
  FROM public.graphic_requests
  WHERE id = p_request_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'graphic_request_not_found';
  END IF;
  IF v_request.entry_id IS DISTINCT FROM v_entry_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'graphic_request_entry_changed';
  END IF;
  IF v_request.submission_token IS DISTINCT FROM p_submission_token THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'graphic_submission_lease_lost';
  END IF;
  IF v_request.graphic_status <> 'claimed' OR v_request.wp_media_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'graphic_submission_not_ready';
  END IF;

  PERFORM 1
  FROM public.graphic_requests
  WHERE entry_id = v_request.entry_id
  ORDER BY id
  FOR UPDATE;

  UPDATE public.graphic_requests
  SET is_featured = false, updated_at = clock_timestamp()
  WHERE entry_id = v_request.entry_id AND id <> p_request_id AND is_featured;

  UPDATE public.graphic_requests
  SET graphic_status = 'submitted',
      is_featured = true,
      flag_reason = NULL,
      flagged_version_id = NULL,
      submission_token = NULL,
      submission_started_at = NULL,
      updated_at = clock_timestamp()
  WHERE id = p_request_id;

  INSERT INTO public.audit_log (
    entry_id, user_id, action, field_name, old_value, new_value
  ) VALUES (
    v_request.entry_id,
    p_actor_id,
    'graphic_update',
    'graphic_request',
    v_request.graphic_status,
    'submitted + featured (wp_media=' || v_request.wp_media_id::text || ')'
  );

  RETURN v_request.wp_media_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_graphic_submission(
  p_request_id uuid,
  p_submission_token uuid
)
RETURNS boolean
LANGUAGE sql
SECURITY INVOKER
SET search_path = public
AS $$
  WITH released AS (
    UPDATE public.graphic_requests
    SET submission_token = NULL,
        submission_started_at = NULL,
        updated_at = clock_timestamp()
    WHERE id = p_request_id AND submission_token = p_submission_token
    RETURNING id
  )
  SELECT EXISTS (SELECT 1 FROM released);
$$;

CREATE OR REPLACE FUNCTION public.transition_graphic_request(
  p_actor_id uuid,
  p_request_id uuid,
  p_action text,
  p_reason text DEFAULT NULL,
  p_allow_override boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_request public.graphic_requests%ROWTYPE;
  v_next_status text;
  v_new_value text;
BEGIN
  SELECT * INTO v_request
  FROM public.graphic_requests
  WHERE id = p_request_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'graphic_request_not_found';
  END IF;

  CASE p_action
    WHEN 'claim' THEN
      IF v_request.graphic_status <> 'needed' OR v_request.claimed_by IS NOT NULL THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'graphic_not_claimable';
      END IF;
      UPDATE public.graphic_requests
      SET graphic_status = 'claimed', claimed_by = p_actor_id,
          updated_at = clock_timestamp()
      WHERE id = p_request_id;
      v_new_value := 'claimed by ' || p_actor_id::text || ': ' || v_request.title;

    WHEN 'unclaim' THEN
      IF v_request.graphic_status <> 'claimed' THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'graphic_not_releasable';
      END IF;
      IF NOT p_allow_override AND v_request.claimed_by IS DISTINCT FROM p_actor_id THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'graphic_assignee_required';
      END IF;
      UPDATE public.graphic_requests
      SET graphic_status = 'needed', claimed_by = NULL,
          submission_token = NULL, submission_started_at = NULL,
          updated_at = clock_timestamp()
      WHERE id = p_request_id;
      v_new_value := 'unclaimed: ' || v_request.title;

    WHEN 'flag' THEN
      IF v_request.graphic_status NOT IN ('claimed', 'submitted') THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'graphic_not_reviewable';
      END IF;
      IF nullif(btrim(p_reason), '') IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'graphic_flag_reason_required';
      END IF;
      UPDATE public.graphic_requests
      SET graphic_status = 'flagged',
          flag_reason = btrim(p_reason),
          flagged_version_id = current_version_id,
          submission_token = NULL,
          submission_started_at = NULL,
          updated_at = clock_timestamp()
      WHERE id = p_request_id;
      v_new_value := 'flagged: ' || left(btrim(p_reason), 120);

    WHEN 'unflag' THEN
      IF v_request.graphic_status <> 'flagged' THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'graphic_not_flagged';
      END IF;
      IF NOT p_allow_override
        AND v_request.current_version_id IS NOT DISTINCT FROM v_request.flagged_version_id
      THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'new_graphic_version_required';
      END IF;
      v_next_status := CASE WHEN v_request.claimed_by IS NULL THEN 'needed' ELSE 'claimed' END;
      UPDATE public.graphic_requests
      SET graphic_status = v_next_status,
          flag_reason = NULL,
          flagged_version_id = NULL,
          updated_at = clock_timestamp()
      WHERE id = p_request_id;
      v_new_value := 'unflagged: ' || v_request.title;

    ELSE
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'unsupported_graphic_action';
  END CASE;

  INSERT INTO public.audit_log (
    entry_id, user_id, action, field_name, old_value, new_value
  ) VALUES (
    v_request.entry_id,
    p_actor_id,
    'graphic_update',
    'graphic_request',
    v_request.graphic_status,
    v_new_value
  );

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_graphic_request(
  p_actor_id uuid,
  p_request_id uuid,
  p_allow_override boolean
)
RETURNS text[]
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_request public.graphic_requests%ROWTYPE;
  v_paths text[];
BEGIN
  SELECT * INTO v_request
  FROM public.graphic_requests
  WHERE id = p_request_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'graphic_request_not_found';
  END IF;
  IF NOT p_allow_override AND v_request.created_by IS DISTINCT FROM p_actor_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'graphic_creator_required';
  END IF;
  IF v_request.graphic_status = 'submitted' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'submitted_graphic_not_deletable';
  END IF;

  SELECT coalesce(array_agg(storage_path ORDER BY version_number), ARRAY[]::text[])
  INTO v_paths
  FROM public.graphic_request_versions
  WHERE request_id = p_request_id;

  DELETE FROM public.graphic_requests WHERE id = p_request_id;
  INSERT INTO public.audit_log (
    entry_id, user_id, action, field_name, old_value, new_value
  ) VALUES (
    v_request.entry_id,
    p_actor_id,
    'graphic_update',
    'graphic_request',
    NULL,
    'deleted: ' || v_request.title
  );

  RETURN v_paths;
END;
$$;

REVOKE ALL ON FUNCTION public.record_graphic_upload(uuid,uuid,boolean,text,text,text,integer,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_graphic_upload(uuid,uuid,boolean,text,text,text,integer,text) TO service_role;
REVOKE ALL ON FUNCTION public.begin_graphic_submission(uuid,uuid,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.begin_graphic_submission(uuid,uuid,boolean) TO service_role;
REVOKE ALL ON FUNCTION public.record_graphic_wp_media(uuid,uuid,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_graphic_wp_media(uuid,uuid,integer) TO service_role;
REVOKE ALL ON FUNCTION public.complete_graphic_submission(uuid,uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_graphic_submission(uuid,uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.release_graphic_submission(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_graphic_submission(uuid,uuid) TO service_role;
REVOKE ALL ON FUNCTION public.transition_graphic_request(uuid,uuid,text,text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.transition_graphic_request(uuid,uuid,text,text,boolean) TO service_role;
REVOKE ALL ON FUNCTION public.delete_graphic_request(uuid,uuid,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_graphic_request(uuid,uuid,boolean) TO service_role;
