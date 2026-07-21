-- Reassert the intended storage boundary from migration 0008.
--
-- Live verification on 2026-07-21 found the bucket publicly readable even
-- though 0008 exists in source. Keeping this idempotent migration in the
-- ordered history ensures environments that skipped or predated 0008 converge
-- on the same private state.
UPDATE storage.buckets
SET public = false
WHERE id = 'graphics';

-- Rollback (only for an operational emergency):
-- UPDATE storage.buckets SET public = true WHERE id = 'graphics';
