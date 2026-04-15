-- =====================================================================
-- PL Staff Content Dashboard - Seed Data
-- Migration: 0002_seed_data.sql
-- =====================================================================
-- Idempotent seeds for tiers, season_modes, global_settings, and
-- default per-tier checklist_items. Safe to re-run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- tiers: S/Annual, A/Daily, B/Weekly, C/Unscheduled
-- The spec doesn't declare a unique constraint on tiers.name, so we
-- guard against duplicates with a NOT EXISTS check.
-- ---------------------------------------------------------------------
INSERT INTO tiers (name, label, sort_order)
SELECT 'S', 'Annual', 0
WHERE NOT EXISTS (SELECT 1 FROM tiers WHERE name = 'S');

INSERT INTO tiers (name, label, sort_order)
SELECT 'A', 'Daily', 1
WHERE NOT EXISTS (SELECT 1 FROM tiers WHERE name = 'A');

INSERT INTO tiers (name, label, sort_order)
SELECT 'B', 'Weekly', 2
WHERE NOT EXISTS (SELECT 1 FROM tiers WHERE name = 'B');

INSERT INTO tiers (name, label, sort_order)
SELECT 'C', 'Unscheduled', 3
WHERE NOT EXISTS (SELECT 1 FROM tiers WHERE name = 'C');

-- ---------------------------------------------------------------------
-- season_modes: Pre-Season, In-Season (active), Offseason
-- No unique constraint on name in the schema, so guard by NOT EXISTS.
-- ---------------------------------------------------------------------
INSERT INTO season_modes (name, is_active, auto_switch_start, auto_switch_end)
SELECT 'Pre-Season', false, NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM season_modes WHERE name = 'Pre-Season');

INSERT INTO season_modes (name, is_active, auto_switch_start, auto_switch_end)
SELECT 'In-Season', true, NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM season_modes WHERE name = 'In-Season');

INSERT INTO season_modes (name, is_active, auto_switch_start, auto_switch_end)
SELECT 'Offseason', false, NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM season_modes WHERE name = 'Offseason');

-- ---------------------------------------------------------------------
-- global_settings: default knobs for deadlines, WP polling, theme,
-- and the unclaimed-slot alert threshold. Uses ON CONFLICT on the
-- unique key column.
-- ---------------------------------------------------------------------
INSERT INTO global_settings (key, value) VALUES
  ('deadline_reminder_hours', '24'::jsonb),
  ('wp_poll_frequency_minutes', '5'::jsonb),
  ('default_theme', '"dark"'::jsonb),
  ('unclaimed_alert_hours', '12'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- ---------------------------------------------------------------------
-- checklist_items: sensible defaults per tier. Tier IDs are resolved
-- by name inside a DO block so reruns don't duplicate rows.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  tier_s UUID;
  tier_a UUID;
  tier_b UUID;
  tier_c UUID;
BEGIN
  SELECT id INTO tier_s FROM tiers WHERE name = 'S' LIMIT 1;
  SELECT id INTO tier_a FROM tiers WHERE name = 'A' LIMIT 1;
  SELECT id INTO tier_b FROM tiers WHERE name = 'B' LIMIT 1;
  SELECT id INTO tier_c FROM tiers WHERE name = 'C' LIMIT 1;

  -- Tier S (Annual)
  IF tier_s IS NOT NULL THEN
    INSERT INTO checklist_items (tier_id, label, sort_order, is_required)
    SELECT tier_s, 'Topic approved', 0, true
    WHERE NOT EXISTS (
      SELECT 1 FROM checklist_items WHERE tier_id = tier_s AND label = 'Topic approved'
    );

    INSERT INTO checklist_items (tier_id, label, sort_order, is_required)
    SELECT tier_s, 'Outline drafted', 1, true
    WHERE NOT EXISTS (
      SELECT 1 FROM checklist_items WHERE tier_id = tier_s AND label = 'Outline drafted'
    );

    INSERT INTO checklist_items (tier_id, label, sort_order, is_required)
    SELECT tier_s, 'Featured image selected', 2, true
    WHERE NOT EXISTS (
      SELECT 1 FROM checklist_items WHERE tier_id = tier_s AND label = 'Featured image selected'
    );

    INSERT INTO checklist_items (tier_id, label, sort_order, is_required)
    SELECT tier_s, 'SEO review complete', 3, true
    WHERE NOT EXISTS (
      SELECT 1 FROM checklist_items WHERE tier_id = tier_s AND label = 'SEO review complete'
    );
  END IF;

  -- Tier A (Daily)
  IF tier_a IS NOT NULL THEN
    INSERT INTO checklist_items (tier_id, label, sort_order, is_required)
    SELECT tier_a, 'Player names verified', 0, true
    WHERE NOT EXISTS (
      SELECT 1 FROM checklist_items WHERE tier_id = tier_a AND label = 'Player names verified'
    );

    INSERT INTO checklist_items (tier_id, label, sort_order, is_required)
    SELECT tier_a, 'Stats current', 1, true
    WHERE NOT EXISTS (
      SELECT 1 FROM checklist_items WHERE tier_id = tier_a AND label = 'Stats current'
    );

    INSERT INTO checklist_items (tier_id, label, sort_order, is_required)
    SELECT tier_a, 'Featured image loaded', 2, true
    WHERE NOT EXISTS (
      SELECT 1 FROM checklist_items WHERE tier_id = tier_a AND label = 'Featured image loaded'
    );

    INSERT INTO checklist_items (tier_id, label, sort_order, is_required)
    SELECT tier_a, 'Tooltips used', 3, true
    WHERE NOT EXISTS (
      SELECT 1 FROM checklist_items WHERE tier_id = tier_a AND label = 'Tooltips used'
    );

    INSERT INTO checklist_items (tier_id, label, sort_order, is_required)
    SELECT tier_a, 'Twitter auto-post format correct', 4, true
    WHERE NOT EXISTS (
      SELECT 1 FROM checklist_items WHERE tier_id = tier_a AND label = 'Twitter auto-post format correct'
    );
  END IF;

  -- Tier B (Weekly)
  IF tier_b IS NOT NULL THEN
    INSERT INTO checklist_items (tier_id, label, sort_order, is_required)
    SELECT tier_b, 'Data refreshed', 0, true
    WHERE NOT EXISTS (
      SELECT 1 FROM checklist_items WHERE tier_id = tier_b AND label = 'Data refreshed'
    );

    INSERT INTO checklist_items (tier_id, label, sort_order, is_required)
    SELECT tier_b, 'Rankings consistent with prior week', 1, true
    WHERE NOT EXISTS (
      SELECT 1 FROM checklist_items WHERE tier_id = tier_b AND label = 'Rankings consistent with prior week'
    );

    INSERT INTO checklist_items (tier_id, label, sort_order, is_required)
    SELECT tier_b, 'Featured image loaded', 2, true
    WHERE NOT EXISTS (
      SELECT 1 FROM checklist_items WHERE tier_id = tier_b AND label = 'Featured image loaded'
    );

    INSERT INTO checklist_items (tier_id, label, sort_order, is_required)
    SELECT tier_b, 'Tooltips used', 3, true
    WHERE NOT EXISTS (
      SELECT 1 FROM checklist_items WHERE tier_id = tier_b AND label = 'Tooltips used'
    );
  END IF;

  -- Tier C (Unscheduled)
  IF tier_c IS NOT NULL THEN
    INSERT INTO checklist_items (tier_id, label, sort_order, is_required)
    SELECT tier_c, 'Draft review', 0, true
    WHERE NOT EXISTS (
      SELECT 1 FROM checklist_items WHERE tier_id = tier_c AND label = 'Draft review'
    );

    INSERT INTO checklist_items (tier_id, label, sort_order, is_required)
    SELECT tier_c, 'Featured image loaded', 1, true
    WHERE NOT EXISTS (
      SELECT 1 FROM checklist_items WHERE tier_id = tier_c AND label = 'Featured image loaded'
    );
  END IF;
END $$;
