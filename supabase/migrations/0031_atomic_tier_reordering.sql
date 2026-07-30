-- Swap two tier positions inside one database transaction. The unique
-- sort-order invariant makes separate client updates impossible to perform
-- safely: the first update would collide before the second can complete.

CREATE OR REPLACE FUNCTION public.swap_tier_sort_orders(
  p_first_id uuid,
  p_second_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_first_order integer;
  v_second_order integer;
  v_temporary_order integer;
BEGIN
  IF p_first_id IS NULL OR p_second_id IS NULL OR p_first_id = p_second_id THEN
    RETURN false;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('tiers:sort-order', 0));

  SELECT sort_order INTO v_first_order
  FROM public.tiers
  WHERE id = p_first_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  SELECT sort_order INTO v_second_order
  FROM public.tiers
  WHERE id = p_second_id
  FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;

  SELECT COALESCE(max(sort_order), -1) + 1
  INTO v_temporary_order
  FROM public.tiers;

  UPDATE public.tiers
  SET sort_order = v_temporary_order
  WHERE id = p_first_id;

  UPDATE public.tiers
  SET sort_order = v_first_order
  WHERE id = p_second_id;

  UPDATE public.tiers
  SET sort_order = v_second_order
  WHERE id = p_first_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.swap_tier_sort_orders(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.swap_tier_sort_orders(uuid, uuid)
  TO service_role;

-- Rollback:
-- DROP FUNCTION IF EXISTS public.swap_tier_sort_orders(uuid, uuid);
