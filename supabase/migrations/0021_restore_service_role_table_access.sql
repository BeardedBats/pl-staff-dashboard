-- =========================================================================
-- Migration 0021: Restore the server-only service-role data boundary
-- =========================================================================

-- The application never exposes a Supabase client to the browser. Every
-- database read and write runs through the server-only service-role client,
-- which still needs ordinary SQL privileges even though service_role bypasses
-- RLS. Local cold resets use Supabase's current non-auto-exposing default, so
-- explicitly grant the privileges the application server requires.
GRANT SELECT, INSERT, UPDATE, DELETE
  ON ALL TABLES IN SCHEMA public
  TO service_role;

GRANT USAGE, SELECT, UPDATE
  ON ALL SEQUENCES IN SCHEMA public
  TO service_role;

-- Keep future tables and sequences reachable by the same server-only client.
-- Anon/authenticated remain revoked and all public tables remain forced-RLS.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO service_role;
