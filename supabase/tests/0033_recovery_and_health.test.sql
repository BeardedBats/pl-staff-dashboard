BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(12);

INSERT INTO public.users (
  id, wp_user_id, wp_site, email, display_name
) VALUES (
  '33000000-0000-0000-0000-000000000001',
  330001,
  'pl',
  'recovery-0033@example.test',
  'Recovery Writer'
);

INSERT INTO public.tiers (id, name, label, sort_order)
VALUES (
  '33000000-0000-0000-0000-000000000002',
  'Recovery 0033',
  'Recovery 0033',
  3300
);

INSERT INTO public.checklist_items (
  id, tier_id, label, sort_order, is_required
) VALUES (
  '33000000-0000-0000-0000-000000000003',
  '33000000-0000-0000-0000-000000000002',
  'Recovered checklist item',
  1,
  true
);

SELECT ok(
  public.queue_wp_sync_backlog(
    'pl',
    330010,
    330001,
    '{"id":330010,"status":"draft","author":330001,"title":{"rendered":"Recovered draft"}}'
  ),
  'unmapped WordPress drafts enter the durable backlog'
);

SELECT is(
  (SELECT count(*)::integer FROM public.wp_sync_backlog WHERE wp_post_id = 330010),
  1,
  'the backlog retains the draft'
);

SELECT lives_ok(
  $$SELECT public.create_wp_draft_entry(
    'Recovered draft',
    'pl',
    '33000000-0000-0000-0000-000000000002',
    330010,
    'https://pitcherlist.com/recovered-draft/',
    'draft',
    '2026-07-30T12:00:00Z',
    '33000000-0000-0000-0000-000000000001',
    true
  )$$,
  'recovered draft creation completes atomically'
);

SELECT is(
  (SELECT count(*)::integer FROM public.entries WHERE wp_post_id = 330010),
  1,
  'the dashboard entry is created'
);

SELECT is(
  (SELECT count(*)::integer
   FROM public.entry_authors
   WHERE entry_id = (SELECT id FROM public.entries WHERE wp_post_id = 330010)),
  1,
  'the primary author is created in the same transaction'
);

SELECT is(
  (SELECT count(*)::integer
   FROM public.entry_checklist
   WHERE entry_id = (SELECT id FROM public.entries WHERE wp_post_id = 330010)),
  1,
  'the checklist is seeded in the same transaction'
);

SELECT is(
  (SELECT count(*)::integer
   FROM public.audit_log
   WHERE entry_id = (SELECT id FROM public.entries WHERE wp_post_id = 330010)),
  1,
  'the creation audit row is committed in the same transaction'
);

SELECT is(
  (SELECT count(*)::integer FROM public.wp_sync_backlog WHERE wp_post_id = 330010),
  0,
  'the backlog clears only after successful creation'
);

INSERT INTO public.cron_runs (
  job_name, run_key, source, status, started_at, finished_at,
  lease_expires_at, attempt
) VALUES
  ('wp-sync', '0033-old', 'vercel', 'succeeded',
   '2026-07-30T10:00:00Z', '2026-07-30T10:01:00Z',
   '2026-07-30T10:15:00Z', 1),
  ('wp-sync', '0033-new', 'vercel', 'succeeded',
   '2026-07-30T11:00:00Z', '2026-07-30T11:01:00Z',
   '2026-07-30T11:15:00Z', 1),
  ('ga4-sync', '0033-ga4', 'vercel', 'succeeded',
   '2026-07-30T09:00:00Z', '2026-07-30T09:01:00Z',
   '2026-07-30T09:15:00Z', 1);

SELECT is(
  (SELECT count(*)::integer FROM public.get_latest_vercel_cron_runs()),
  2,
  'cron health returns one row per job instead of a global row window'
);

SELECT is(
  (SELECT started_at FROM public.get_latest_vercel_cron_runs()
   WHERE job_name = 'wp-sync'),
  '2026-07-30T11:00:00Z'::timestamptz,
  'cron health selects the newest run for each job'
);

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.wp_sync_backlog', 'SELECT'),
  'authenticated users cannot read the WordPress recovery backlog'
);

SELECT ok(
  has_function_privilege(
    'service_role',
    'public.create_wp_draft_entry(text,text,uuid,integer,text,text,text,uuid,boolean)',
    'EXECUTE'
  ),
  'service role can execute atomic WordPress draft creation'
);

SELECT * FROM finish();
ROLLBACK;
