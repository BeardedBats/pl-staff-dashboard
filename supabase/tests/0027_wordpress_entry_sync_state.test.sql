BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT no_plan();

SELECT has_column('public', 'entries', 'wp_sync_status', 'entries expose synchronization status');
SELECT has_column('public', 'entries', 'wp_last_synced_at', 'entries store last successful synchronization');
SELECT has_column('public', 'entries', 'wp_last_sync_error', 'entries store sanitized recovery detail');
SELECT has_column('public', 'entries', 'wp_synced_title', 'entries store a three-way title baseline');

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.entries'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) LIKE '%wp_sync_status%'
      AND pg_get_constraintdef(oid) LIKE '%conflict%'
  ),
  'synchronization status has a database check constraint'
);

SELECT * FROM finish();
ROLLBACK;
