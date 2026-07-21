-- =========================================================================
-- Migration 0014: Transactional bulk entry mutations
--
-- Bulk create and bulk update previously crossed multiple HTTP/database
-- transactions. These RPCs make the entry rows, related checklist/authors,
-- and audit trail one all-or-nothing unit.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.bulk_create_entries(
  p_actor_id uuid,
  p_entries jsonb
)
RETURNS TABLE(entry_id uuid, request_index integer)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_count integer;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF jsonb_typeof(p_entries) IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'entries_must_be_array';
  END IF;

  v_count := jsonb_array_length(p_entries);
  IF v_count < 1 OR v_count > 25 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'entries_count_out_of_range';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_entries) AS item
    WHERE jsonb_typeof(item) IS DISTINCT FROM 'object'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'entry_must_be_object';
  END IF;

  RETURN QUERY
  WITH payload AS MATERIALIZED (
    SELECT
      gen_random_uuid() AS id,
      ordinality::integer AS position,
      btrim(item->>'title') AS title,
      nullif(btrim(item->>'description'), '') AS description,
      item->>'site' AS site,
      (item->>'tier_id')::uuid AS tier_id,
      coalesce((item->>'priority')::boolean, false) AS priority,
      CASE
        WHEN item->>'publish_date' IS NULL THEN NULL
        ELSE (item->>'publish_date')::timestamptz
      END AS publish_date,
      coalesce(item->>'publish_date_precision', 'none') AS publish_date_precision,
      nullif(item->>'category_id', '')::uuid AS category_id,
      nullif(item->>'series_id', '')::uuid AS series_id,
      coalesce(item->'assignee_user_ids', '[]'::jsonb) AS assignees
    FROM jsonb_array_elements(p_entries) WITH ORDINALITY AS source(item, ordinality)
  ),
  inserted_entries AS (
    INSERT INTO public.entries (
      id,
      title,
      description,
      site,
      tier_id,
      priority,
      publish_date,
      publish_date_precision,
      category_id,
      series_id,
      created_by,
      content_status,
      recent_activity
    )
    SELECT
      p.id,
      p.title,
      p.description,
      p.site,
      p.tier_id,
      p.priority,
      p.publish_date,
      p.publish_date_precision,
      p.category_id,
      p.series_id,
      p_actor_id,
      CASE
        WHEN jsonb_array_length(p.assignees) > 0 THEN 'claimed'
        ELSE 'writer_needed'
      END,
      jsonb_build_array(jsonb_build_object(
        'type', 'created',
        'actor_id', p_actor_id,
        'actor_name', 'System',
        'label', 'created: ' || p.title,
        'at', v_now
      ))
    FROM payload p
    RETURNING id
  ),
  inserted_checklists AS (
    INSERT INTO public.entry_checklist (entry_id, checklist_item_id, is_completed)
    SELECT p.id, ci.id, false
    FROM payload p
    JOIN inserted_entries ie ON ie.id = p.id
    JOIN public.checklist_items ci ON ci.tier_id = p.tier_id
    RETURNING id
  ),
  inserted_authors AS (
    INSERT INTO public.entry_authors (entry_id, user_id, role)
    SELECT
      p.id,
      assignee.user_id::uuid,
      CASE WHEN assignee.position = 1 THEN 'primary' ELSE 'co_author' END
    FROM payload p
    JOIN inserted_entries ie ON ie.id = p.id
    CROSS JOIN LATERAL jsonb_array_elements_text(p.assignees)
      WITH ORDINALITY AS assignee(user_id, position)
    RETURNING id
  ),
  inserted_audits AS (
    INSERT INTO public.audit_log (entry_id, user_id, action, new_value)
    SELECT p.id, p_actor_id, 'created', p.title
    FROM payload p
    JOIN inserted_entries ie ON ie.id = p.id
    RETURNING id
  )
  SELECT p.id, p.position
  FROM payload p
  JOIN inserted_entries ie ON ie.id = p.id
  ORDER BY p.position;
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_create_entries(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bulk_create_entries(uuid, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.bulk_create_entries(uuid, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_create_entries(uuid, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.bulk_update_entries(
  p_actor_id uuid,
  p_entry_ids uuid[],
  p_action text,
  p_payload jsonb DEFAULT '{}'::jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_requested integer;
  v_found integer;
  v_updated integer := 0;
  v_reason text;
  v_priority boolean;
  v_tier_id uuid;
BEGIN
  v_requested := coalesce(cardinality(p_entry_ids), 0);
  IF v_requested < 1 OR v_requested > 200 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'entry_count_out_of_range';
  END IF;

  IF EXISTS (SELECT 1 FROM unnest(p_entry_ids) AS id WHERE id IS NULL)
    OR (SELECT count(DISTINCT id) FROM unnest(p_entry_ids) AS id) <> v_requested
  THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'entry_ids_must_be_unique';
  END IF;

  -- Lock every target before validating the set so deletion/update cannot race
  -- the all-or-nothing operation.
  PERFORM 1
  FROM public.entries
  WHERE id = ANY(p_entry_ids)
  ORDER BY id
  FOR UPDATE;

  SELECT count(*) INTO v_found
  FROM public.entries
  WHERE id = ANY(p_entry_ids);

  IF v_found <> v_requested THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'entry_not_found';
  END IF;

  CASE p_action
    WHEN 'archive' THEN
      v_reason := nullif(btrim(p_payload->>'reason'), '');
      IF v_reason IS NULL THEN
        v_reason := 'Bulk archived';
      END IF;
      IF length(v_reason) > 500 THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'archive_reason_too_long';
      END IF;

      WITH old_rows AS MATERIALIZED (
        SELECT id, is_archived
        FROM public.entries
        WHERE id = ANY(p_entry_ids)
      ),
      updated AS (
        UPDATE public.entries e
        SET is_archived = true,
            archive_reason = v_reason,
            updated_at = now()
        FROM old_rows old
        WHERE e.id = old.id AND NOT old.is_archived
        RETURNING e.id
      ),
      audited AS (
        INSERT INTO public.audit_log (
          entry_id, user_id, action, field_name, old_value, new_value
        )
        SELECT updated.id, p_actor_id, 'archive', 'is_archived', 'false', 'true'
        FROM updated
        RETURNING id
      )
      SELECT count(*) INTO v_updated FROM updated;

    WHEN 'unarchive' THEN
      WITH old_rows AS MATERIALIZED (
        SELECT id, is_archived
        FROM public.entries
        WHERE id = ANY(p_entry_ids)
      ),
      updated AS (
        UPDATE public.entries e
        SET is_archived = false,
            archive_reason = NULL,
            updated_at = now()
        FROM old_rows old
        WHERE e.id = old.id AND old.is_archived
        RETURNING e.id
      ),
      audited AS (
        INSERT INTO public.audit_log (
          entry_id, user_id, action, field_name, old_value, new_value
        )
        SELECT updated.id, p_actor_id, 'archive', 'is_archived', 'true', 'false'
        FROM updated
        RETURNING id
      )
      SELECT count(*) INTO v_updated FROM updated;

    WHEN 'set_priority' THEN
      IF jsonb_typeof(p_payload->'priority') IS DISTINCT FROM 'boolean' THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'priority_must_be_boolean';
      END IF;
      v_priority := (p_payload->>'priority')::boolean;

      WITH old_rows AS MATERIALIZED (
        SELECT id, priority
        FROM public.entries
        WHERE id = ANY(p_entry_ids)
      ),
      updated AS (
        UPDATE public.entries e
        SET priority = v_priority,
            updated_at = now()
        FROM old_rows old
        WHERE e.id = old.id AND old.priority IS DISTINCT FROM v_priority
        RETURNING e.id
      ),
      audited AS (
        INSERT INTO public.audit_log (
          entry_id, user_id, action, field_name, old_value, new_value
        )
        SELECT
          updated.id,
          p_actor_id,
          'field_edit',
          'priority',
          old.priority::text,
          v_priority::text
        FROM updated
        JOIN old_rows old ON old.id = updated.id
        RETURNING id
      )
      SELECT count(*) INTO v_updated FROM updated;

    WHEN 'change_tier' THEN
      BEGIN
        v_tier_id := (p_payload->>'tier_id')::uuid;
      EXCEPTION WHEN invalid_text_representation THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'tier_id_must_be_uuid';
      END;

      IF v_tier_id IS NULL OR NOT EXISTS (
        SELECT 1 FROM public.tiers WHERE id = v_tier_id
      ) THEN
        RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'tier_not_found';
      END IF;

      IF EXISTS (
        SELECT 1
        FROM public.entry_checklist ec
        JOIN public.entries e ON e.id = ec.entry_id
        WHERE e.id = ANY(p_entry_ids)
          AND e.tier_id IS DISTINCT FROM v_tier_id
          AND ec.is_completed
      ) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'completed_checklist_blocks_tier_change';
      END IF;

      WITH old_rows AS MATERIALIZED (
        SELECT id, tier_id
        FROM public.entries
        WHERE id = ANY(p_entry_ids)
      ),
      changed AS MATERIALIZED (
        SELECT id, tier_id
        FROM old_rows
        WHERE tier_id IS DISTINCT FROM v_tier_id
      ),
      deleted_checklists AS (
        DELETE FROM public.entry_checklist ec
        USING changed
        WHERE ec.entry_id = changed.id
        RETURNING ec.id
      ),
      updated AS (
        UPDATE public.entries e
        SET tier_id = v_tier_id,
            updated_at = now()
        FROM changed
        WHERE e.id = changed.id
        RETURNING e.id
      ),
      seeded_checklists AS (
        INSERT INTO public.entry_checklist (entry_id, checklist_item_id, is_completed)
        SELECT updated.id, ci.id, false
        FROM updated
        JOIN public.checklist_items ci ON ci.tier_id = v_tier_id
        RETURNING id
      ),
      audited AS (
        INSERT INTO public.audit_log (
          entry_id, user_id, action, field_name, old_value, new_value
        )
        SELECT
          updated.id,
          p_actor_id,
          'field_edit',
          'tier_id',
          changed.tier_id::text,
          v_tier_id::text
        FROM updated
        JOIN changed ON changed.id = updated.id
        RETURNING id
      )
      SELECT count(*) INTO v_updated FROM updated;

    ELSE
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'unsupported_bulk_action';
  END CASE;

  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.bulk_update_entries(uuid, uuid[], text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bulk_update_entries(uuid, uuid[], text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.bulk_update_entries(uuid, uuid[], text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.bulk_update_entries(uuid, uuid[], text, jsonb) TO service_role;
