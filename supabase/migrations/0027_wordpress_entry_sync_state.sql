ALTER TABLE public.entries
  ADD COLUMN wp_sync_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (wp_sync_status IN ('pending', 'synced', 'stale', 'conflict', 'error')),
  ADD COLUMN wp_last_synced_at TIMESTAMPTZ,
  ADD COLUMN wp_last_sync_error TEXT
    CHECK (wp_last_sync_error IS NULL OR length(wp_last_sync_error) <= 500),
  ADD COLUMN wp_synced_title TEXT
    CHECK (wp_synced_title IS NULL OR length(wp_synced_title) BETWEEN 1 AND 500);

UPDATE public.entries
SET wp_sync_status = CASE WHEN wp_post_id IS NULL THEN 'pending' ELSE 'stale' END;

CREATE INDEX entries_wp_sync_attention_idx
  ON public.entries (wp_sync_status, updated_at DESC)
  WHERE wp_sync_status IN ('stale', 'conflict', 'error');
