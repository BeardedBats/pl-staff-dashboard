-- The application uses custom cookie sessions and a server-only service-role
-- client. Direct PostgREST access by Supabase anon/authenticated roles is not
-- part of the product contract, so every public table and function is closed.

DO $$
DECLARE
  relation RECORD;
BEGIN
  FOR relation IN
    SELECT n.nspname AS schema_name, c.relname AS relation_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
      relation.schema_name,
      relation.relation_name
    );
    EXECUTE format(
      'ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY',
      relation.schema_name,
      relation.relation_name
    );
    EXECUTE format(
      'REVOKE ALL ON TABLE %I.%I FROM PUBLIC, anon, authenticated',
      relation.schema_name,
      relation.relation_name
    );
  END LOOP;
END
$$;

DO $$
DECLARE
  function_row RECORD;
BEGIN
  FOR function_row IN
    SELECT
      n.nspname AS schema_name,
      p.proname AS function_name,
      pg_get_function_identity_arguments(p.oid) AS identity_arguments
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
  LOOP
    EXECUTE format(
      'REVOKE ALL ON FUNCTION %I.%I(%s) FROM PUBLIC, anon, authenticated',
      function_row.schema_name,
      function_row.function_name,
      function_row.identity_arguments
    );
    EXECUTE format(
      'GRANT EXECUTE ON FUNCTION %I.%I(%s) TO service_role',
      function_row.schema_name,
      function_row.function_name,
      function_row.identity_arguments
    );
  END LOOP;
END
$$;

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) VALUES (
  'graphics',
  'graphics',
  false,
  10485760,
  ARRAY['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name,
    public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types,
    updated_at = now();

-- Older upload code persisted an expiring signed URL here. The durable path
-- is storage_path; authorized read paths mint fresh URLs after authorization.
UPDATE public.graphic_requests
SET file_url = NULL
WHERE storage_path IS NOT NULL AND file_url IS NOT NULL;
