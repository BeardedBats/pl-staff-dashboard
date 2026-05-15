-- =============================================================================
-- Migration 0008: Make the `graphics` storage bucket private
--
-- Why: even with table-level RLS locked down (migration 0007), the
-- Supabase Storage layer is a separate trust boundary. Right now the
-- `graphics` bucket is `public = true`, which means anyone who guesses a
-- storage path (entryId/timestamp-filename) can hotlink the file.
--
-- Going forward, reads happen via short-lived signed URLs generated
-- server-side by `lib/graphics/storage.ts#getSignedGraphicUrl`. The
-- write path is unchanged — uploads still go through the service role
-- key, which can write to any bucket regardless of policy.
--
-- After this migration runs, any persisted `graphic_requests.file_url`
-- values (the old public CDN URLs) will 403. That's fine — the data
-- layer in `lib/graphics/data.ts` overwrites `file_url` with a fresh
-- signed URL on every read.
-- =============================================================================

UPDATE storage.buckets
SET public = false
WHERE id = 'graphics';

-- =============================================================================
-- After this runs:
--   * GET https://<proj>.supabase.co/storage/v1/object/public/graphics/<path>
--     returns 400 / "Bucket not found" instead of streaming the file.
--   * The dashboard's signed URLs (TTL = 1h) keep working.
--   * If you ever need to make graphics public again, run:
--       UPDATE storage.buckets SET public = true WHERE id = 'graphics';
-- =============================================================================
