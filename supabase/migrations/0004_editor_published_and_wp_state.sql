-- =========================================================================
-- Migration 0004: 'published' editor state + WordPress status mirror
--
-- Per Nick's clarification: the dashboard's 'scheduled' and 'published'
-- editor states are set ONLY when the WordPress REST API reports the
-- post's status as 'future' or 'publish' respectively. Staff cannot set
-- these directly in the dashboard — the dashboard mirrors WP.
--
-- Changes:
--   1. Extend the editor_status CHECK constraint to allow 'published'.
--   2. Mirror the raw WP post status on entries.wp_status so we can
--      distinguish 'draft' / 'pending' / 'future' / 'publish' / 'trash'
--      without always re-polling.
--   3. Track the last WP modification time so /api/cron/wp-sync (Step 10)
--      can do incremental fetches.
--   4. Track when a post actually went live (published_at).
--   5. Fast index on wp_post_id for the per-entry refresh path.
-- =========================================================================

-- 1. Drop the existing check constraint and re-add with 'published'.
ALTER TABLE entries
  DROP CONSTRAINT IF EXISTS entries_editor_status_check;

ALTER TABLE entries
  ADD CONSTRAINT entries_editor_status_check
  CHECK (editor_status IN ('none', 'ready_for_edit', 'edited', 'scheduled', 'published'));

-- 2. Mirror columns for the raw WordPress state.
ALTER TABLE entries
  ADD COLUMN IF NOT EXISTS wp_status TEXT;

ALTER TABLE entries
  ADD COLUMN IF NOT EXISTS wp_modified_at TIMESTAMPTZ;

ALTER TABLE entries
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

-- 3. Index for per-entry wp_post_id lookups (used by the WP refresh
--    endpoint + the Step 10 cron).
CREATE INDEX IF NOT EXISTS idx_entries_wp_post_id
  ON entries(wp_post_id)
  WHERE wp_post_id IS NOT NULL;
