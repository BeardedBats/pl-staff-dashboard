-- Keep the supported in-app channel useful without pretending to deliver
-- through email or Discord. Staff can choose immediate or daily delivery and
-- hold non-urgent items during local quiet hours.

ALTER TABLE public.users
  ADD COLUMN notification_delivery_mode text NOT NULL DEFAULT 'immediate',
  ADD COLUMN notification_digest_time time NOT NULL DEFAULT '09:00',
  ADD COLUMN notification_quiet_start time,
  ADD COLUMN notification_quiet_end time,
  ADD CONSTRAINT users_notification_delivery_mode_check
    CHECK (notification_delivery_mode IN ('immediate', 'daily_digest')),
  ADD CONSTRAINT users_notification_quiet_pair_check
    CHECK (
      (notification_quiet_start IS NULL AND notification_quiet_end IS NULL)
      OR (
        notification_quiet_start IS NOT NULL
        AND notification_quiet_end IS NOT NULL
        AND notification_quiet_start <> notification_quiet_end
      )
    );

ALTER TABLE public.notifications
  ADD COLUMN available_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN delivery_attempts integer NOT NULL DEFAULT 1,
  ADD CONSTRAINT notifications_delivery_attempts_check
    CHECK (delivery_attempts BETWEEN 1 AND 3);

CREATE INDEX idx_notifications_user_available
  ON public.notifications(user_id, available_at DESC);

CREATE OR REPLACE FUNCTION public.replace_notification_preferences(
  p_user_id uuid,
  p_preferences jsonb,
  p_delivery_mode text,
  p_digest_time time,
  p_quiet_start time,
  p_quiet_end time
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF jsonb_typeof(p_preferences) <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'preferences_must_be_array';
  END IF;

  UPDATE public.users
  SET notification_delivery_mode = p_delivery_mode,
      notification_digest_time = p_digest_time,
      notification_quiet_start = p_quiet_start,
      notification_quiet_end = p_quiet_end,
      updated_at = clock_timestamp()
  WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0002', MESSAGE = 'user_not_found';
  END IF;

  DELETE FROM public.notification_preferences WHERE user_id = p_user_id;
  INSERT INTO public.notification_preferences (user_id, event_type, in_app_enabled)
  SELECT
    p_user_id,
    item->>'event_type',
    (item->>'in_app_enabled')::boolean
  FROM jsonb_array_elements(p_preferences) AS item;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_notification_preferences(
  uuid, jsonb, text, time, time, time
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_notification_preferences(
  uuid, jsonb, text, time, time, time
) TO service_role;
