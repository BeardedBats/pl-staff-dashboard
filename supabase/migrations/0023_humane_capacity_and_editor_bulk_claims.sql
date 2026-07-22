-- Phase 4 workflow support: self-declared availability and atomic editor claims.

ALTER TABLE public.users
  ADD COLUMN availability_status text NOT NULL DEFAULT 'available',
  ADD COLUMN availability_note text,
  ADD COLUMN availability_until date,
  ADD CONSTRAINT users_availability_status_check
    CHECK (availability_status IN ('available', 'limited', 'unavailable')),
  ADD CONSTRAINT users_availability_note_length_check
    CHECK (availability_note IS NULL OR length(availability_note) <= 160);

CREATE OR REPLACE FUNCTION public.bulk_claim_editor_entries(
  p_actor_id uuid,
  p_entry_ids uuid[]
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_requested integer := coalesce(cardinality(p_entry_ids), 0);
  v_found integer;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF v_requested < 1 OR v_requested > 25 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'entry_count_out_of_range';
  END IF;
  IF v_requested <> (SELECT count(DISTINCT id) FROM unnest(p_entry_ids) AS ids(id)) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'duplicate_entry_ids';
  END IF;

  PERFORM id FROM public.entries WHERE id = ANY(p_entry_ids) ORDER BY id FOR UPDATE;
  SELECT count(*) INTO v_found FROM public.entries WHERE id = ANY(p_entry_ids);
  IF v_found <> v_requested THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'entry_not_found';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.entries e
    WHERE e.id = ANY(p_entry_ids)
      AND (
        e.is_archived OR e.is_drafted OR e.is_historical
        OR e.content_status <> 'submitted'
        OR e.editor_status <> 'ready_for_edit'
        OR EXISTS (SELECT 1 FROM public.entry_editors ee WHERE ee.entry_id = e.id)
      )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'entry_not_claimable';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.entries e
    WHERE e.id = ANY(p_entry_ids)
      AND NOT EXISTS (
        SELECT 1
        FROM public.user_roles ur
        WHERE ur.user_id = p_actor_id
          AND ur.role IN ('editor', 'manager', 'admin', 'eic', 'operations')
          AND ur.site IN (e.site, 'both')
      )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'editor_site_role_required';
  END IF;

  INSERT INTO public.entry_editors (entry_id, user_id, claimed_at)
  SELECT id, p_actor_id, v_now
  FROM public.entries
  WHERE id = ANY(p_entry_ids);

  INSERT INTO public.audit_log (
    entry_id, user_id, action, field_name, old_value, new_value, created_at
  )
  SELECT
    id, p_actor_id, 'claim', 'editor_track', NULL,
    coalesce((SELECT display_name FROM public.users WHERE id = p_actor_id), p_actor_id::text),
    v_now
  FROM public.entries
  WHERE id = ANY(p_entry_ids);

  RETURN v_requested;
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_claim_editor_entries(uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bulk_claim_editor_entries(uuid, uuid[]) FROM anon;
REVOKE ALL ON FUNCTION public.bulk_claim_editor_entries(uuid, uuid[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_claim_editor_entries(uuid, uuid[]) TO service_role;
