-- Complete graphic briefs and split worker submission from editorial approval.

ALTER TABLE public.graphic_requests
  ADD COLUMN requirements jsonb NOT NULL DEFAULT jsonb_build_object(
    'asset_type', 'other',
    'placement', 'Not specified',
    'width', 1,
    'height', 1,
    'format', 'png',
    'alt_text', 'Not provided'
  ),
  ADD COLUMN review_submitted_at timestamptz,
  ADD COLUMN approved_at timestamptz,
  ADD CONSTRAINT graphic_requests_requirements_object_check
    CHECK (
      jsonb_typeof(requirements) = 'object'
      AND requirements->>'asset_type' IN ('featured', 'inline', 'social', 'chart', 'other')
      AND nullif(btrim(requirements->>'placement'), '') IS NOT NULL
      AND (requirements->>'width') ~ '^[0-9]+$'
      AND (requirements->>'width')::integer BETWEEN 1 AND 10000
      AND (requirements->>'height') ~ '^[0-9]+$'
      AND (requirements->>'height')::integer BETWEEN 1 AND 10000
      AND requirements->>'format' IN ('png', 'jpeg', 'webp', 'gif')
      AND nullif(btrim(requirements->>'alt_text'), '') IS NOT NULL
      AND (
        NOT requirements ? 'reference_url'
        OR nullif(btrim(requirements->>'reference_url'), '') IS NOT NULL
      )
    );

CREATE OR REPLACE FUNCTION public.submit_graphic_for_review(
  p_actor_id uuid,
  p_request_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_request public.graphic_requests%ROWTYPE;
BEGIN
  SELECT * INTO v_request
  FROM public.graphic_requests
  WHERE id = p_request_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'graphic_request_not_found';
  END IF;
  IF v_request.graphic_status <> 'claimed'
     OR v_request.claimed_by IS DISTINCT FROM p_actor_id
     OR v_request.current_version_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'graphic_not_ready_for_review';
  END IF;

  UPDATE public.graphic_requests
  SET review_submitted_at = clock_timestamp(),
      approved_at = NULL,
      updated_at = clock_timestamp()
  WHERE id = p_request_id;

  INSERT INTO public.audit_log (
    entry_id, user_id, action, field_name, old_value, new_value
  ) VALUES (
    v_request.entry_id, p_actor_id, 'graphic_update', 'graphic_review',
    NULL, 'submitted for review: ' || v_request.title
  );
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.clear_graphic_review_on_new_version()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  UPDATE public.graphic_requests
  SET review_submitted_at = NULL, approved_at = NULL
  WHERE id = NEW.request_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_graphic_version_clears_review
  AFTER INSERT ON public.graphic_request_versions
  FOR EACH ROW EXECUTE FUNCTION public.clear_graphic_review_on_new_version();

CREATE OR REPLACE FUNCTION public.enforce_graphic_review_before_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF OLD.submission_token IS NULL
     AND NEW.submission_token IS NOT NULL
     AND OLD.review_submitted_at IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'graphic_review_required';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_graphic_review_before_approval
  BEFORE UPDATE OF submission_token ON public.graphic_requests
  FOR EACH ROW EXECUTE FUNCTION public.enforce_graphic_review_before_approval();

CREATE OR REPLACE FUNCTION public.stamp_graphic_approval()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.graphic_status = 'submitted' AND OLD.graphic_status <> 'submitted' THEN
    NEW.approved_at := clock_timestamp();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_graphic_approval_stamp
  BEFORE UPDATE OF graphic_status ON public.graphic_requests
  FOR EACH ROW EXECUTE FUNCTION public.stamp_graphic_approval();

REVOKE ALL ON FUNCTION public.submit_graphic_for_review(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_graphic_for_review(uuid, uuid) TO service_role;
REVOKE ALL ON FUNCTION public.clear_graphic_review_on_new_version() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_graphic_review_before_approval() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.stamp_graphic_approval() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.clear_graphic_review_on_new_version() TO service_role;
GRANT EXECUTE ON FUNCTION public.enforce_graphic_review_before_approval() TO service_role;
GRANT EXECUTE ON FUNCTION public.stamp_graphic_approval() TO service_role;
