-- =========================================================================
-- Migration 0013: Verified production invariants
--
-- Every constraint below was checked against production before this
-- migration was authored. The migration intentionally does not:
--   * make category names unique (WordPress has legitimate duplicate names),
--   * require both season switch dates (the active season has an open end), or
--   * enforce checklist-item tier equality (10 stale, incomplete rows need a
--     separate product decision and recoverable cleanup).
-- =========================================================================

-- Identity and contact data.
ALTER TABLE public.users
  ADD CONSTRAINT users_wp_user_id_positive_check
    CHECK (wp_user_id > 0) NOT VALID,
  ADD CONSTRAINT users_email_normalized_check
    CHECK (
      email IS NULL OR (
        email = lower(btrim(email))
        AND email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      )
    ) NOT VALID,
  ADD CONSTRAINT users_discord_id_format_check
    CHECK (discord_id IS NULL OR discord_id ~ '^[0-9]+$') NOT VALID;

ALTER TABLE public.users
  VALIDATE CONSTRAINT users_wp_user_id_positive_check;
ALTER TABLE public.users
  VALIDATE CONSTRAINT users_email_normalized_check;
ALTER TABLE public.users
  VALIDATE CONSTRAINT users_discord_id_format_check;

CREATE UNIQUE INDEX users_wp_identity_unique
  ON public.users (wp_site, wp_user_id);
CREATE UNIQUE INDEX users_email_ci_unique
  ON public.users (lower(btrim(email)))
  WHERE email IS NOT NULL;
CREATE UNIQUE INDEX users_discord_id_unique
  ON public.users (discord_id)
  WHERE discord_id IS NOT NULL;

-- WordPress-backed category and post identities.
ALTER TABLE public.categories
  ADD CONSTRAINT categories_wp_category_id_positive_check
    CHECK (wp_category_id > 0) NOT VALID;
ALTER TABLE public.categories
  VALIDATE CONSTRAINT categories_wp_category_id_positive_check;

ALTER TABLE public.categories
  ADD CONSTRAINT categories_id_site_unique UNIQUE (id, site);
CREATE UNIQUE INDEX categories_site_wp_id_unique
  ON public.categories (site, wp_category_id);

ALTER TABLE public.entries
  ADD CONSTRAINT entries_wp_post_id_positive_check
    CHECK (wp_post_id IS NULL OR wp_post_id > 0) NOT VALID,
  ADD CONSTRAINT entries_word_count_nonnegative_check
    CHECK (word_count IS NULL OR word_count >= 0) NOT VALID;
ALTER TABLE public.entries
  VALIDATE CONSTRAINT entries_wp_post_id_positive_check;
ALTER TABLE public.entries
  VALIDATE CONSTRAINT entries_word_count_nonnegative_check;

CREATE UNIQUE INDEX entries_site_wp_post_id_unique
  ON public.entries (site, wp_post_id)
  WHERE wp_post_id IS NOT NULL;

-- Site-scoped relationships. Composite foreign keys prevent a PL entry or
-- template from silently pointing at a QB category/series (and vice versa).
ALTER TABLE public.recurring_templates
  ADD CONSTRAINT recurring_templates_id_site_unique UNIQUE (id, site),
  ADD CONSTRAINT recurring_templates_category_site_fkey
    FOREIGN KEY (category_id, site)
    REFERENCES public.categories (id, site)
    NOT VALID;
ALTER TABLE public.recurring_templates
  VALIDATE CONSTRAINT recurring_templates_category_site_fkey;

ALTER TABLE public.entries
  ADD CONSTRAINT entries_category_site_fkey
    FOREIGN KEY (category_id, site)
    REFERENCES public.categories (id, site)
    NOT VALID,
  ADD CONSTRAINT entries_series_site_fkey
    FOREIGN KEY (series_id, site)
    REFERENCES public.recurring_templates (id, site)
    NOT VALID;
ALTER TABLE public.entries
  VALIDATE CONSTRAINT entries_category_site_fkey;
ALTER TABLE public.entries
  VALIDATE CONSTRAINT entries_series_site_fkey;

-- A reply must belong to the same entry as its parent comment.
ALTER TABLE public.comments
  ADD CONSTRAINT comments_id_entry_unique UNIQUE (id, entry_id),
  ADD CONSTRAINT comments_parent_entry_fkey
    FOREIGN KEY (parent_id, entry_id)
    REFERENCES public.comments (id, entry_id)
    NOT VALID;
ALTER TABLE public.comments
  VALIDATE CONSTRAINT comments_parent_entry_fkey;

-- Season configuration and atomic activation.
ALTER TABLE public.season_modes
  ADD CONSTRAINT season_modes_date_order_check
    CHECK (
      auto_switch_start IS NULL
      OR auto_switch_end IS NULL
      OR auto_switch_start <= auto_switch_end
    ) NOT VALID;
ALTER TABLE public.season_modes
  VALIDATE CONSTRAINT season_modes_date_order_check;

CREATE UNIQUE INDEX season_modes_name_ci_unique
  ON public.season_modes (lower(btrim(name)));
CREATE UNIQUE INDEX season_modes_one_active_unique
  ON public.season_modes ((is_active))
  WHERE is_active;

CREATE OR REPLACE FUNCTION public.activate_season_mode(p_mode_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  -- Serialize both manual and cron activations. The function call is one
  -- transaction, so no caller can observe the brief clear-before-set state.
  LOCK TABLE public.season_modes IN SHARE ROW EXCLUSIVE MODE;

  IF NOT EXISTS (
    SELECT 1 FROM public.season_modes WHERE id = p_mode_id
  ) THEN
    RETURN false;
  END IF;

  UPDATE public.season_modes
  SET is_active = false
  WHERE is_active;

  UPDATE public.season_modes
  SET is_active = true
  WHERE id = p_mode_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.activate_season_mode(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.activate_season_mode(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.activate_season_mode(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.activate_season_mode(uuid) TO service_role;

-- Stable admin ordering/naming keys.
ALTER TABLE public.tiers
  ADD CONSTRAINT tiers_sort_order_nonnegative_check
    CHECK (sort_order >= 0) NOT VALID;
ALTER TABLE public.tiers
  VALIDATE CONSTRAINT tiers_sort_order_nonnegative_check;
CREATE UNIQUE INDEX tiers_name_ci_unique
  ON public.tiers (lower(btrim(name)));
CREATE UNIQUE INDEX tiers_sort_order_unique
  ON public.tiers (sort_order);

CREATE UNIQUE INDEX teams_site_name_ci_unique
  ON public.teams (site, lower(btrim(name)));

ALTER TABLE public.checklist_items
  ADD CONSTRAINT checklist_items_sort_order_nonnegative_check
    CHECK (sort_order >= 0) NOT VALID;
ALTER TABLE public.checklist_items
  VALIDATE CONSTRAINT checklist_items_sort_order_nonnegative_check;
CREATE UNIQUE INDEX checklist_items_tier_label_ci_unique
  ON public.checklist_items (tier_id, lower(btrim(label)));
CREATE UNIQUE INDEX checklist_items_tier_sort_order_unique
  ON public.checklist_items (tier_id, sort_order);

-- Authentication tokens are unique credentials, not merely lookup values.
ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_token_hash_unique UNIQUE (token_hash),
  ADD CONSTRAINT sessions_refresh_token_hash_unique UNIQUE (refresh_token_hash);

-- Workflow cardinality and state coherence.
CREATE UNIQUE INDEX entry_authors_one_primary_unique
  ON public.entry_authors (entry_id)
  WHERE role = 'primary';
CREATE UNIQUE INDEX entry_editors_one_per_entry_unique
  ON public.entry_editors (entry_id);
CREATE UNIQUE INDEX claims_one_pending_per_user_role_unique
  ON public.claims (entry_id, user_id, role_type)
  WHERE status = 'pending';
CREATE UNIQUE INDEX archive_requests_one_pending_per_entry_unique
  ON public.archive_requests (entry_id)
  WHERE status = 'pending';

ALTER TABLE public.claims
  ADD CONSTRAINT claims_resolution_state_check
    CHECK (
      (status = 'pending' AND approved_by IS NULL AND resolved_at IS NULL)
      OR
      (status IN ('approved', 'denied') AND approved_by IS NOT NULL AND resolved_at IS NOT NULL)
    ) NOT VALID;
ALTER TABLE public.claims
  VALIDATE CONSTRAINT claims_resolution_state_check;

ALTER TABLE public.archive_requests
  ADD CONSTRAINT archive_requests_resolution_state_check
    CHECK (
      (status = 'pending' AND resolved_by IS NULL AND resolved_at IS NULL)
      OR
      (status IN ('approved', 'denied') AND resolved_by IS NOT NULL AND resolved_at IS NOT NULL)
    ) NOT VALID;
ALTER TABLE public.archive_requests
  VALIDATE CONSTRAINT archive_requests_resolution_state_check;

ALTER TABLE public.entry_checklist
  ADD CONSTRAINT entry_checklist_completion_state_check
    CHECK (
      (is_completed AND completed_by IS NOT NULL AND completed_at IS NOT NULL)
      OR
      (NOT is_completed AND completed_by IS NULL AND completed_at IS NULL)
    ) NOT VALID;
ALTER TABLE public.entry_checklist
  VALIDATE CONSTRAINT entry_checklist_completion_state_check;

-- Saved views have stable names and at most one default per user.
CREATE UNIQUE INDEX saved_table_views_user_name_ci_unique
  ON public.saved_table_views (user_id, lower(btrim(name)));
CREATE UNIQUE INDEX saved_table_views_one_default_per_user_unique
  ON public.saved_table_views (user_id)
  WHERE is_default;

-- Preferences may only target events the notification system can emit.
ALTER TABLE public.notification_preferences
  ADD CONSTRAINT notification_preferences_event_type_check
    CHECK (event_type IN (
      'new_claimable', 'claim_requested', 'claim_resolved',
      'content_submitted', 'sent_to_polishing', 'graphic_requested',
      'graphic_submitted', 'graphic_flagged', 'deadline_approaching',
      'entry_scheduled', 'entry_published', 'mention',
      'archive_requested', 'unclaimed_slot', 'priority_flagged'
    )) NOT VALID;
ALTER TABLE public.notification_preferences
  VALIDATE CONSTRAINT notification_preferences_event_type_check;

-- Count/range fields are measurements and cannot be negative. Revenue and
-- RPM are intentionally excluded because adjustment rows can be negative.
ALTER TABLE public.article_analytics
  ADD CONSTRAINT article_analytics_nonnegative_metrics_check
    CHECK (
      pageviews >= 0
      AND sessions >= 0
      AND (avg_time_on_page IS NULL OR avg_time_on_page >= 0)
      AND new_users >= 0
      AND returning_users >= 0
    ) NOT VALID;
ALTER TABLE public.article_analytics
  VALIDATE CONSTRAINT article_analytics_nonnegative_metrics_check;

ALTER TABLE public.raptive_revenue
  ADD CONSTRAINT raptive_revenue_nonnegative_counts_check
    CHECK (sessions >= 0 AND pageviews >= 0) NOT VALID;
ALTER TABLE public.raptive_revenue
  VALIDATE CONSTRAINT raptive_revenue_nonnegative_counts_check;

ALTER TABLE public.raptive_uploads
  ADD CONSTRAINT raptive_uploads_date_order_check
    CHECK (date_range_start <= date_range_end) NOT VALID,
  ADD CONSTRAINT raptive_uploads_rows_imported_nonnegative_check
    CHECK (rows_imported >= 0) NOT VALID;
ALTER TABLE public.raptive_uploads
  VALIDATE CONSTRAINT raptive_uploads_date_order_check;
ALTER TABLE public.raptive_uploads
  VALIDATE CONSTRAINT raptive_uploads_rows_imported_nonnegative_check;

ALTER TABLE public.file_attachments
  ADD CONSTRAINT file_attachments_file_size_nonnegative_check
    CHECK (file_size >= 0) NOT VALID;
ALTER TABLE public.file_attachments
  VALIDATE CONSTRAINT file_attachments_file_size_nonnegative_check;
