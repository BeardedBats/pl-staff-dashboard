-- =========================================================================
-- Migration 0018: Transactional editorial workflows
--
-- Claims and status transitions previously used read-then-write sequences
-- across several PostgREST requests. Concurrent requests could both pass the
-- precondition, then produce conflicting assignments or duplicate audit side
-- effects. These RPCs lock the entry/claim rows and commit each editorial
-- operation with its audit trail as one unit.
-- =========================================================================

-- A publish deadline and its precision describe one value. Repair any legacy
-- mismatches before enforcing that relationship for future writes.
UPDATE public.entries
SET publish_date_precision = CASE
  WHEN publish_date IS NULL THEN 'none'
  WHEN publish_date_precision = 'none' THEN 'exact'
  ELSE publish_date_precision
END
WHERE (publish_date IS NULL) <> (publish_date_precision = 'none');

ALTER TABLE public.entries
  ADD CONSTRAINT entries_publish_deadline_coherence_check
  CHECK (
    (publish_date IS NULL AND publish_date_precision = 'none')
    OR
    (publish_date IS NOT NULL AND publish_date_precision <> 'none')
  ) NOT VALID;
ALTER TABLE public.entries
  VALIDATE CONSTRAINT entries_publish_deadline_coherence_check;

CREATE OR REPLACE FUNCTION public.create_writer_claim(
  p_actor_id uuid,
  p_entry_id uuid,
  p_auto_approve boolean DEFAULT false
)
RETURNS TABLE(claim_id uuid, claim_status text)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_content_status text;
  v_claim_id uuid;
  v_now timestamptz := clock_timestamp();
BEGIN
  SELECT e.content_status
  INTO v_content_status
  FROM public.entries e
  WHERE e.id = p_entry_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'entry_not_found';
  END IF;
  IF v_content_status <> 'writer_needed' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'entry_not_claimable';
  END IF;

  INSERT INTO public.claims (
    entry_id, user_id, role_type, status, approved_by, resolved_at
  ) VALUES (
    p_entry_id,
    p_actor_id,
    'writer',
    CASE WHEN p_auto_approve THEN 'approved' ELSE 'pending' END,
    CASE WHEN p_auto_approve THEN p_actor_id ELSE NULL END,
    CASE WHEN p_auto_approve THEN v_now ELSE NULL END
  )
  RETURNING id INTO v_claim_id;

  INSERT INTO public.audit_log (
    entry_id, user_id, action, field_name, old_value, new_value
  ) VALUES (
    p_entry_id, p_actor_id, 'claim', 'content_track', NULL,
    CASE
      WHEN p_auto_approve THEN 'writer claim auto-approved'
      ELSE 'writer claim requested'
    END
  );

  IF p_auto_approve THEN
    INSERT INTO public.entry_authors (entry_id, user_id, role)
    VALUES (p_entry_id, p_actor_id, 'primary');

    UPDATE public.entries
    SET content_status = 'claimed', updated_at = v_now
    WHERE id = p_entry_id;

    INSERT INTO public.audit_log (
      entry_id, user_id, action, field_name, old_value, new_value
    ) VALUES (
      p_entry_id, p_actor_id, 'status_change', 'content_status',
      'writer_needed', 'claimed'
    );
  ELSE
    UPDATE public.entries
    SET content_status = 'claim_requested', updated_at = v_now
    WHERE id = p_entry_id;

    INSERT INTO public.audit_log (
      entry_id, user_id, action, field_name, old_value, new_value
    ) VALUES (
      p_entry_id, p_actor_id, 'status_change', 'content_status',
      'writer_needed', 'claim_requested'
    );
  END IF;

  RETURN QUERY SELECT v_claim_id, CASE WHEN p_auto_approve THEN 'approved' ELSE 'pending' END;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_writer_claim(
  p_actor_id uuid,
  p_claim_id uuid,
  p_action text
)
RETURNS TABLE(
  resolved_entry_id uuid,
  claimant_user_id uuid,
  entry_title text,
  resolution text
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_claim public.claims%ROWTYPE;
  v_entry public.entries%ROWTYPE;
  v_now timestamptz := clock_timestamp();
BEGIN
  IF p_action NOT IN ('approve', 'deny') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'unsupported_claim_resolution';
  END IF;

  SELECT * INTO v_claim
  FROM public.claims
  WHERE id = p_claim_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'claim_not_found';
  END IF;
  IF v_claim.role_type <> 'writer' OR v_claim.status <> 'pending' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'claim_not_pending';
  END IF;

  SELECT * INTO v_entry
  FROM public.entries
  WHERE id = v_claim.entry_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'entry_not_found';
  END IF;
  IF v_entry.content_status <> 'claim_requested' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'entry_not_awaiting_claim';
  END IF;

  UPDATE public.claims
  SET status = CASE WHEN p_action = 'approve' THEN 'approved' ELSE 'denied' END,
      approved_by = p_actor_id,
      resolved_at = v_now
  WHERE id = p_claim_id;

  IF p_action = 'approve' THEN
    INSERT INTO public.entry_authors (entry_id, user_id, role)
    VALUES (v_claim.entry_id, v_claim.user_id, 'primary');

    UPDATE public.entries
    SET content_status = 'claimed', updated_at = v_now
    WHERE id = v_claim.entry_id;

    INSERT INTO public.audit_log (
      entry_id, user_id, action, field_name, old_value, new_value
    ) VALUES (
      v_claim.entry_id, p_actor_id, 'status_change', 'content_status',
      'claim_requested', 'claimed'
    );
  ELSE
    UPDATE public.entries
    SET content_status = 'writer_needed', updated_at = v_now
    WHERE id = v_claim.entry_id;

    INSERT INTO public.audit_log (
      entry_id, user_id, action, field_name, old_value, new_value
    ) VALUES (
      v_claim.entry_id, p_actor_id, 'status_change', 'content_status',
      'claim_requested', 'writer_needed (claim denied)'
    );
  END IF;

  RETURN QUERY
  SELECT v_claim.entry_id, v_claim.user_id, v_entry.title, p_action;
END;
$$;

CREATE OR REPLACE FUNCTION public.transition_editorial_entry(
  p_actor_id uuid,
  p_entry_id uuid,
  p_action text,
  p_reason text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_entry public.entries%ROWTYPE;
  v_now timestamptz := clock_timestamp();
  v_next_editor_status text;
BEGIN
  SELECT * INTO v_entry
  FROM public.entries
  WHERE id = p_entry_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'entry_not_found';
  END IF;

  CASE p_action
    WHEN 'submit' THEN
      IF v_entry.content_status NOT IN ('claimed', 'polishing') THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'content_not_submittable';
      END IF;
      IF NOT EXISTS (
        SELECT 1 FROM public.entry_authors
        WHERE entry_id = p_entry_id AND user_id = p_actor_id
      ) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'assigned_writer_required';
      END IF;
      IF EXISTS (
        SELECT 1
        FROM public.entry_checklist ec
        JOIN public.checklist_items ci ON ci.id = ec.checklist_item_id
        WHERE ec.entry_id = p_entry_id AND ci.is_required AND NOT ec.is_completed
      ) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0004', MESSAGE = 'checklist_incomplete';
      END IF;

      v_next_editor_status := CASE
        WHEN v_entry.editor_status = 'none' THEN 'ready_for_edit'
        ELSE v_entry.editor_status
      END;
      UPDATE public.entries
      SET content_status = 'submitted',
          editor_status = v_next_editor_status,
          updated_at = v_now
      WHERE id = p_entry_id;

      INSERT INTO public.audit_log (
        entry_id, user_id, action, field_name, old_value, new_value
      ) VALUES (
        p_entry_id, p_actor_id, 'status_change', 'content_status',
        v_entry.content_status, 'submitted'
      );
      IF v_next_editor_status <> v_entry.editor_status THEN
        INSERT INTO public.audit_log (
          entry_id, user_id, action, field_name, old_value, new_value
        ) VALUES (
          p_entry_id, p_actor_id, 'status_change', 'editor_status',
          v_entry.editor_status, v_next_editor_status
        );
      END IF;

    WHEN 'send_to_polishing' THEN
      IF nullif(btrim(p_reason), '') IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'polishing_reason_required';
      END IF;
      IF v_entry.content_status <> 'submitted' THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'content_not_submitted';
      END IF;

      UPDATE public.entries
      SET content_status = 'polishing', updated_at = v_now
      WHERE id = p_entry_id;
      INSERT INTO public.audit_log (
        entry_id, user_id, action, field_name, old_value, new_value
      ) VALUES (
        p_entry_id, p_actor_id, 'status_change', 'content_status',
        'submitted', 'polishing: ' || btrim(p_reason)
      );

    WHEN 'claim_edit' THEN
      IF v_entry.editor_status <> 'ready_for_edit' THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'entry_not_ready_for_edit';
      END IF;
      IF EXISTS (SELECT 1 FROM public.entry_editors WHERE entry_id = p_entry_id) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'edit_already_claimed';
      END IF;

      INSERT INTO public.entry_editors (entry_id, user_id)
      VALUES (p_entry_id, p_actor_id);
      INSERT INTO public.audit_log (
        entry_id, user_id, action, field_name, old_value, new_value
      ) VALUES (
        p_entry_id, p_actor_id, 'claim', 'editor_track', NULL,
        coalesce(
          (SELECT display_name FROM public.users WHERE id = p_actor_id),
          p_actor_id::text
        )
      );

    WHEN 'mark_edited' THEN
      IF v_entry.content_status <> 'submitted' THEN
        RAISE EXCEPTION USING ERRCODE = 'P0004', MESSAGE = 'content_not_submitted';
      END IF;
      IF v_entry.editor_status = 'edited' THEN
        RETURN true;
      END IF;
      IF v_entry.editor_status <> 'ready_for_edit' THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'entry_not_ready_for_edit';
      END IF;
      IF EXISTS (
        SELECT 1 FROM public.graphic_requests
        WHERE entry_id = p_entry_id AND graphic_status <> 'submitted'
      ) THEN
        RAISE EXCEPTION USING ERRCODE = 'P0004', MESSAGE = 'graphics_incomplete';
      END IF;

      UPDATE public.entries
      SET editor_status = 'edited', updated_at = v_now
      WHERE id = p_entry_id;
      INSERT INTO public.audit_log (
        entry_id, user_id, action, field_name, old_value, new_value
      ) VALUES (
        p_entry_id, p_actor_id, 'status_change', 'editor_status',
        v_entry.editor_status, 'edited'
      );

    ELSE
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'unsupported_editorial_action';
  END CASE;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_entry_fields(
  p_actor_id uuid,
  p_entry_id uuid,
  p_payload jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_entry public.entries%ROWTYPE;
  v_updated public.entries%ROWTYPE;
  v_new_tier_id uuid;
BEGIN
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'entry_update_must_be_object';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_object_keys(p_payload) AS key
    WHERE key NOT IN (
      'title', 'description', 'tier_id', 'priority', 'publish_date',
      'publish_date_precision', 'category_id', 'series_id'
    )
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'unsupported_entry_field';
  END IF;
  IF (p_payload ? 'publish_date') <> (p_payload ? 'publish_date_precision') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'deadline_fields_must_change_together';
  END IF;
  IF p_payload ? 'title' AND (
    nullif(btrim(p_payload->>'title'), '') IS NULL
    OR length(btrim(p_payload->>'title')) > 500
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'invalid_entry_title';
  END IF;
  IF p_payload ? 'description' AND length(coalesce(p_payload->>'description', '')) > 4000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'entry_description_too_long';
  END IF;

  SELECT * INTO v_entry
  FROM public.entries
  WHERE id = p_entry_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'entry_not_found';
  END IF;

  IF p_payload = '{}'::jsonb THEN
    RETURN true;
  END IF;

  IF p_payload ? 'tier_id' THEN
    v_new_tier_id := (p_payload->>'tier_id')::uuid;
    IF v_new_tier_id IS DISTINCT FROM v_entry.tier_id THEN
      IF EXISTS (
        SELECT 1 FROM public.entry_checklist
        WHERE entry_id = p_entry_id AND is_completed
      ) THEN
        RAISE EXCEPTION USING
          ERRCODE = 'P0001',
          MESSAGE = 'completed_checklist_blocks_tier_change';
      END IF;
      DELETE FROM public.entry_checklist WHERE entry_id = p_entry_id;
    END IF;
  END IF;

  UPDATE public.entries
  SET title = CASE
        WHEN p_payload ? 'title' THEN btrim(p_payload->>'title')
        ELSE v_entry.title
      END,
      description = CASE
        WHEN p_payload ? 'description' THEN p_payload->>'description'
        ELSE v_entry.description
      END,
      tier_id = CASE
        WHEN p_payload ? 'tier_id' THEN (p_payload->>'tier_id')::uuid
        ELSE v_entry.tier_id
      END,
      priority = CASE
        WHEN p_payload ? 'priority' THEN (p_payload->>'priority')::boolean
        ELSE v_entry.priority
      END,
      publish_date = CASE
        WHEN p_payload ? 'publish_date' AND p_payload->>'publish_date' IS NOT NULL
          THEN (p_payload->>'publish_date')::timestamptz
        WHEN p_payload ? 'publish_date' THEN NULL
        ELSE v_entry.publish_date
      END,
      publish_date_precision = CASE
        WHEN p_payload ? 'publish_date_precision' THEN p_payload->>'publish_date_precision'
        ELSE v_entry.publish_date_precision
      END,
      category_id = CASE
        WHEN p_payload ? 'category_id' THEN nullif(p_payload->>'category_id', '')::uuid
        ELSE v_entry.category_id
      END,
      series_id = CASE
        WHEN p_payload ? 'series_id' THEN nullif(p_payload->>'series_id', '')::uuid
        ELSE v_entry.series_id
      END,
      updated_at = clock_timestamp()
  WHERE id = p_entry_id
  RETURNING * INTO v_updated;

  IF v_updated.tier_id IS DISTINCT FROM v_entry.tier_id THEN
    INSERT INTO public.entry_checklist (
      entry_id, checklist_item_id, is_completed
    )
    SELECT p_entry_id, id, false
    FROM public.checklist_items
    WHERE tier_id = v_updated.tier_id;
  END IF;

  INSERT INTO public.audit_log (
    entry_id, user_id, action, field_name, old_value, new_value
  )
  SELECT p_entry_id, p_actor_id, 'field_edit', field_name, old_value, new_value
  FROM (VALUES
    ('title', v_entry.title, v_updated.title),
    ('description', v_entry.description, v_updated.description),
    ('tier_id', v_entry.tier_id::text, v_updated.tier_id::text),
    ('priority', v_entry.priority::text, v_updated.priority::text),
    ('publish_date', v_entry.publish_date::text, v_updated.publish_date::text),
    (
      'publish_date_precision',
      v_entry.publish_date_precision,
      v_updated.publish_date_precision
    ),
    ('category_id', v_entry.category_id::text, v_updated.category_id::text),
    ('series_id', v_entry.series_id::text, v_updated.series_id::text)
  ) AS changes(field_name, old_value, new_value)
  WHERE old_value IS DISTINCT FROM new_value;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.create_writer_claim(uuid, uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_writer_claim(uuid, uuid, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.create_writer_claim(uuid, uuid, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.create_writer_claim(uuid, uuid, boolean) TO service_role;

REVOKE ALL ON FUNCTION public.resolve_writer_claim(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_writer_claim(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.resolve_writer_claim(uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_writer_claim(uuid, uuid, text) TO service_role;

REVOKE ALL ON FUNCTION public.transition_editorial_entry(uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transition_editorial_entry(uuid, uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.transition_editorial_entry(uuid, uuid, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.transition_editorial_entry(uuid, uuid, text, text) TO service_role;

REVOKE ALL ON FUNCTION public.update_entry_fields(uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_entry_fields(uuid, uuid, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.update_entry_fields(uuid, uuid, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.update_entry_fields(uuid, uuid, jsonb) TO service_role;
