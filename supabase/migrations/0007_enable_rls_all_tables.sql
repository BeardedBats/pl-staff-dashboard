-- =============================================================================
-- Migration 0007: Enable Row Level Security on every public table
--
-- Why: the Supabase linter flagged all 29 tables as rls_disabled_in_public.
-- Without RLS, anyone with the anon or authenticated Supabase key can hit
-- the PostgREST API directly (https://<proj>.supabase.co/rest/v1/<table>)
-- and read tables like `sessions` (JWT hashes), `global_settings` (WP app
-- passwords), `users`, `audit_log`, `raptive_revenue`, etc. — bypassing
-- every auth check in the Next.js API layer.
--
-- Strategy: enable RLS with zero permissive policies. The default-deny
-- behaviour then blocks all direct access from anon/authenticated. The
-- Next.js server uses SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS by
-- design, so server-side queries keep working. FORCE ROW LEVEL SECURITY
-- is added so even table owners (if ever connected) respect the policy.
--
-- Defense-in-depth: we also REVOKE all table privileges from anon and
-- authenticated. Even if RLS is ever accidentally dropped, PostgREST
-- still can't read the tables.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Enable + force RLS on every table
-- -----------------------------------------------------------------------------

ALTER TABLE public.users                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users                         FORCE ROW LEVEL SECURITY;

ALTER TABLE public.user_roles                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles                    FORCE ROW LEVEL SECURITY;

ALTER TABLE public.teams                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teams                         FORCE ROW LEVEL SECURITY;

ALTER TABLE public.team_members                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members                  FORCE ROW LEVEL SECURITY;

ALTER TABLE public.sessions                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions                      FORCE ROW LEVEL SECURITY;

ALTER TABLE public.tiers                         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tiers                         FORCE ROW LEVEL SECURITY;

ALTER TABLE public.categories                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories                    FORCE ROW LEVEL SECURITY;

ALTER TABLE public.season_modes                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.season_modes                  FORCE ROW LEVEL SECURITY;

ALTER TABLE public.recurring_templates           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_templates           FORCE ROW LEVEL SECURITY;

ALTER TABLE public.recurring_template_roles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_template_roles      FORCE ROW LEVEL SECURITY;

ALTER TABLE public.recurring_template_checklist  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_template_checklist  FORCE ROW LEVEL SECURITY;

ALTER TABLE public.checklist_items               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checklist_items               FORCE ROW LEVEL SECURITY;

ALTER TABLE public.entries                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entries                       FORCE ROW LEVEL SECURITY;

ALTER TABLE public.entry_authors                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entry_authors                 FORCE ROW LEVEL SECURITY;

ALTER TABLE public.entry_editors                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entry_editors                 FORCE ROW LEVEL SECURITY;

ALTER TABLE public.entry_checklist               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entry_checklist               FORCE ROW LEVEL SECURITY;

ALTER TABLE public.graphic_requests              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.graphic_requests              FORCE ROW LEVEL SECURITY;

ALTER TABLE public.claims                        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claims                        FORCE ROW LEVEL SECURITY;

ALTER TABLE public.archive_requests              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.archive_requests              FORCE ROW LEVEL SECURITY;

ALTER TABLE public.comments                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments                      FORCE ROW LEVEL SECURITY;

ALTER TABLE public.audit_log                     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log                     FORCE ROW LEVEL SECURITY;

ALTER TABLE public.notifications                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications                 FORCE ROW LEVEL SECURITY;

ALTER TABLE public.notification_preferences      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences      FORCE ROW LEVEL SECURITY;

ALTER TABLE public.global_settings               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.global_settings               FORCE ROW LEVEL SECURITY;

ALTER TABLE public.file_attachments              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.file_attachments              FORCE ROW LEVEL SECURITY;

ALTER TABLE public.article_analytics             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.article_analytics             FORCE ROW LEVEL SECURITY;

ALTER TABLE public.raptive_revenue               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raptive_revenue               FORCE ROW LEVEL SECURITY;

ALTER TABLE public.raptive_uploads               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.raptive_uploads               FORCE ROW LEVEL SECURITY;

ALTER TABLE public.saved_table_views             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saved_table_views             FORCE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 2. Defense in depth — revoke direct table privileges from PostgREST roles
--
-- Even if a policy is later dropped, anon/authenticated will still get
-- permission-denied from PostgREST. Service role is exempt.
-- -----------------------------------------------------------------------------

DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'users', 'user_roles', 'teams', 'team_members', 'sessions',
    'tiers', 'categories', 'season_modes', 'recurring_templates',
    'recurring_template_roles', 'recurring_template_checklist',
    'checklist_items', 'entries', 'entry_authors', 'entry_editors',
    'entry_checklist', 'graphic_requests', 'claims', 'archive_requests',
    'comments', 'audit_log', 'notifications', 'notification_preferences',
    'global_settings', 'file_attachments', 'article_analytics',
    'raptive_revenue', 'raptive_uploads', 'saved_table_views'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', tbl);
  END LOOP;
END
$$;

-- =============================================================================
-- End migration 0007.
--
-- Expected outcome:
--   * `npx supabase db lint` reports 0 rls_disabled_in_public errors.
--   * curl to https://<proj>.supabase.co/rest/v1/users with the anon key
--     returns [] or a 401/403.
--   * Next.js API routes still work (they use the service_role key, which
--     bypasses RLS and is exempt from REVOKE by default).
-- =============================================================================
