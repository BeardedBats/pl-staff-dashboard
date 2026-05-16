-- =========================================================================
-- Migration 0009: Protect manual user edits from WP profile-sync overwrite
--
-- The profile-sync cron in src/lib/wp-sync/profiles.ts walks every user
-- with a wp_user_id and pulls fresh display_name / bio / avatar_url from
-- WordPress. That worked fine until an admin needed to override a name in
-- the dashboard (e.g. for the owner himself or Rick Graham) — the next
-- sync silently reverted the edit on the next tick.
--
-- This migration adds an `override` flag for display_name. The sync skips
-- the field for any row where the flag is true; the admin Edit User
-- dialog flips the flag on whenever it writes a display_name.
--
-- Also clears the leftover test-Ray Graham email so it repopulates from
-- WordPress on his first real login. Email was NOT NULL in 0001; relax
-- that constraint here so pre-login placeholder rows can carry a NULL
-- email until WordPress fills it in.
-- =========================================================================

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS display_name_override BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE users
  ALTER COLUMN email DROP NOT NULL;

-- Clear leftover test placeholders so WP login can repopulate cleanly.
UPDATE users SET email = NULL WHERE email LIKE '%@example.com';
