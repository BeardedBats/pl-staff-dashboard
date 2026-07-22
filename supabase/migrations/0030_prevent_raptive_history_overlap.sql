-- Keep raw/live and compact history mutually exclusive for every site/day.
-- This database boundary protects analytics even if an old date is retried.

CREATE OR REPLACE FUNCTION public.prevent_raptive_history_overlap()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.wp_site IS NOT NULL THEN
    -- Serialize both ingestion paths for one site/day so concurrent compact and
    -- live writes cannot both pass their counterpart checks.
    PERFORM pg_advisory_xact_lock(
      hashtextextended(NEW.wp_site || ':' || NEW.date::text, 0)
    );

    IF TG_TABLE_NAME = 'raptive_revenue' AND EXISTS (
      SELECT 1
      FROM public.raptive_history_daily history
      WHERE history.wp_site = NEW.wp_site
        AND history.date = NEW.date
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'raptive_compact_history_overlap';
    ELSIF TG_TABLE_NAME = 'raptive_history_daily' AND EXISTS (
      SELECT 1
      FROM public.raptive_revenue revenue
      WHERE revenue.wp_site = NEW.wp_site
        AND revenue.date = NEW.date
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'raptive_raw_history_overlap';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_raptive_revenue_prevent_history_overlap
  BEFORE INSERT OR UPDATE OF wp_site, date
  ON public.raptive_revenue
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_raptive_history_overlap();

CREATE TRIGGER trg_raptive_history_prevent_revenue_overlap
  BEFORE INSERT OR UPDATE OF wp_site, date
  ON public.raptive_history_daily
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_raptive_history_overlap();

REVOKE ALL ON FUNCTION public.prevent_raptive_history_overlap()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prevent_raptive_history_overlap()
  TO service_role;

-- Rollback before any affected write: drop both triggers and the function.
-- After a rejected overlap, no data repair is needed because the statement
-- rolled back.
