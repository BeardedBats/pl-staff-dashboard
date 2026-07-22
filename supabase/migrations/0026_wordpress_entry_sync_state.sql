ALTER TABLE public.entries
  ADD COLUMN wp_sync_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (wp_sync_status IN ('pending', 'synced', 'stale', 'error')),
  ADD COLUMN wp_last_synced_at TIMESTAMPTZ,
  ADD COLUMN wp_last_sync_error TEXT
    CHECK (wp_last_sync_error IS NULL OR length(wp_last_sync_error) <= 500);

UPDATE public.entries
SET wp_sync_status = CASE WHEN wp_post_id IS NULL THEN 'pending' ELSE 'stale' END;

CREATE INDEX entries_wp_sync_attention_idx
  ON public.entries (wp_sync_status, updated_at DESC)
  WHERE wp_sync_status IN ('stale', 'error');
