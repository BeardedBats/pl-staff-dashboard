-- =========================================================================
-- Migration 0005: Graphic request metadata for Step 5
--
-- Adds the fields we need to track a graphic through the full pipeline:
--   Supabase Storage upload → WP media library → featured image.
--
-- Backwards-compatible: every new column is nullable / has a default so
-- existing rows (there are none yet) don't need values.
-- =========================================================================

-- Who filed the request. Useful for "my requests" filters + notifications.
ALTER TABLE graphic_requests
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES users(id);

-- WP media library ID once the image is uploaded to WordPress.
ALTER TABLE graphic_requests
  ADD COLUMN IF NOT EXISTS wp_media_id INTEGER;

-- Original filename + size + MIME type for display in the dashboard.
ALTER TABLE graphic_requests
  ADD COLUMN IF NOT EXISTS file_name TEXT;

ALTER TABLE graphic_requests
  ADD COLUMN IF NOT EXISTS file_size INTEGER;

ALTER TABLE graphic_requests
  ADD COLUMN IF NOT EXISTS mime_type TEXT;

-- The path inside the Supabase Storage bucket (`graphics`). Kept separately
-- from file_url so we can delete the underlying object when a request is
-- cancelled, without parsing URLs.
ALTER TABLE graphic_requests
  ADD COLUMN IF NOT EXISTS storage_path TEXT;

-- Flag: is this graphic currently the WP featured image for its entry?
-- Only one `is_featured = true` row per entry in practice, but not strictly
-- enforced (graphics team can swap which is featured).
ALTER TABLE graphic_requests
  ADD COLUMN IF NOT EXISTS is_featured BOOLEAN NOT NULL DEFAULT false;

-- Fast lookup: "who's working on a graphic right now?"
CREATE INDEX IF NOT EXISTS idx_graphic_requests_claimed_by
  ON graphic_requests(claimed_by)
  WHERE claimed_by IS NOT NULL;

-- Fast lookup: the global graphics board groups by status.
CREATE INDEX IF NOT EXISTS idx_graphic_requests_status
  ON graphic_requests(graphic_status);
