-- =========================================================================
-- Migration 0006: WordPress sync — drafted entry state
--
-- When the WP poll cron discovers a new draft that was created directly
-- in WordPress (not in the dashboard), we create a corresponding entry
-- so the writer sees it in their queue. Those entries are marked
-- `is_drafted = true` until the author approves them — they're visible
-- to the author themselves and to admins, but hidden from the public
-- Content Table to avoid exposing half-finished work to the whole team.
--
-- Authors can opt out of the "needs approval" step by flipping their
-- `auto_approve_drafts` toggle in settings — in that case the sync
-- creates entries with `is_drafted = false` from the start.
-- =========================================================================

ALTER TABLE entries
  ADD COLUMN IF NOT EXISTS is_drafted BOOLEAN NOT NULL DEFAULT false;

-- Filter index — the Content Table filters out drafted entries for most
-- viewers, so we want this to be fast.
CREATE INDEX IF NOT EXISTS idx_entries_drafted
  ON entries(is_drafted)
  WHERE is_drafted = true;
