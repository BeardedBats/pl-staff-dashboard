-- =========================================================================
-- Migration 0003: Primary team membership
--
-- Nick's team model:
--   "Writers have a single main manager, while also taking part in another
--    category with a different manager. Editors have one manager above them,
--    though there are some writers who also edit a little, and have a
--    different direct manager."
--
-- Schema changes:
--   1. Add `is_primary` to team_members — the user's main team assignment.
--      Their primary manager for approvals and org reporting.
--   2. Partial unique index: at most one primary team per user.
--   3. Add a `description` to teams for tooltip/context when listing.
--   4. Index on team_members.user_id for fast "what teams am I on" lookups.
-- =========================================================================

-- 1. Primary flag + default false.
ALTER TABLE team_members
  ADD COLUMN IF NOT EXISTS is_primary BOOLEAN NOT NULL DEFAULT false;

-- 2. Partial unique index — one primary team per user.
--    Postgres allows multiple non-primary rows per user while enforcing
--    uniqueness only where is_primary = true.
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_members_user_primary
  ON team_members(user_id)
  WHERE is_primary = true;

-- 3. Descriptive blurb on teams. Optional — shown in team tooltips / cards.
ALTER TABLE teams
  ADD COLUMN IF NOT EXISTS description TEXT;

-- 4. Index for reverse lookup: user -> their teams.
CREATE INDEX IF NOT EXISTS idx_team_members_user
  ON team_members(user_id);

-- 5. Index for forward lookup: team -> members (already covered by the
--    UNIQUE(team_id, user_id) index from 0001, but add an explicit team_id
--    index for scans that don't filter by user_id too).
CREATE INDEX IF NOT EXISTS idx_team_members_team
  ON team_members(team_id);
