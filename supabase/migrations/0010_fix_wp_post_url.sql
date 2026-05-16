-- =========================================================================
-- Migration 0010: wp_post_url fix + historical import support
--
-- Until now `entries.wp_post_url` stored the WordPress admin edit URL
-- (https://pitcherlist.com/wp-admin/post.php?post=NNNN&action=edit). That
-- worked for opening the post in wp-admin from the dashboard, but it
-- prevented the analytics join — GA4 reports pagePath and Raptive reports
-- page_url, neither of which match the admin URL. The wp-sync code now
-- stores the public permalink (the `link` field from the WP REST API), so
-- this migration nulls out any existing admin-style values and lets the
-- next sync repopulate them.
--
-- This migration also adds support for the historical article import:
--   - `is_historical` flag on entries so back-imported published posts
--     can be excluded from the active pipeline (content table, editing
--     queue, calendar, unclaimed alerts) while still being available for
--     analytics joins and the future /archive page.
--   - Extends the content_status and editor_status CHECK constraints to
--     accept 'published' (the import sets both to 'published' since the
--     posts are already live).
-- =========================================================================

-- ---- 1. Null out admin-style wp_post_url values ----
-- We don't try to reconstruct the public permalink from the admin URL —
-- the wp-sync cron will set it correctly on its next pass using the
-- `link` field returned by the WP REST API.
UPDATE entries
SET wp_post_url = NULL
WHERE wp_post_url LIKE '%/wp-admin/%';

-- ---- 2. is_historical flag ----
-- Defaults to false so all existing entries stay in the active pipeline.
-- The /api/admin/historical-import route sets this to true for imported
-- pre-existing published posts.
ALTER TABLE entries
  ADD COLUMN IF NOT EXISTS is_historical BOOLEAN NOT NULL DEFAULT false;

-- Filter index — most pipeline queries add `WHERE is_historical = false`,
-- so this lets Postgres skip the imported rows quickly.
CREATE INDEX IF NOT EXISTS idx_entries_historical
  ON entries(is_historical)
  WHERE is_historical = true;

-- ---- 3. Extend content_status CHECK to allow 'published' ----
-- The historical importer marks imported posts as 'published' on both the
-- content and editor tracks since they're already live on the site.
ALTER TABLE entries
  DROP CONSTRAINT IF EXISTS entries_content_status_check;

ALTER TABLE entries
  ADD CONSTRAINT entries_content_status_check
  CHECK (content_status IN (
    'writer_needed',
    'claim_requested',
    'claimed',
    'submitted',
    'polishing',
    'published'
  ));

-- ---- 4. Confirm editor_status CHECK includes 'published' ----
-- Migration 0004 already extended this constraint, but re-asserting here
-- keeps the schema obvious for anyone reading 0010 standalone.
ALTER TABLE entries
  DROP CONSTRAINT IF EXISTS entries_editor_status_check;

ALTER TABLE entries
  ADD CONSTRAINT entries_editor_status_check
  CHECK (editor_status IN (
    'none',
    'ready_for_edit',
    'edited',
    'scheduled',
    'published'
  ));

-- Note: wp_status was added in migration 0004 and already exists; no
-- additional column work needed for the importer.
