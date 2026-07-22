BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;
SELECT plan(16);

SELECT ok(
  NOT has_function_privilege('authenticated', 'public.bulk_claim_editor_entries(uuid,uuid[])', 'EXECUTE'),
  'authenticated clients cannot call bulk editor claims directly'
);
SELECT ok(
  has_function_privilege('service_role', 'public.bulk_claim_editor_entries(uuid,uuid[])', 'EXECUTE'),
  'service role can call bulk editor claims'
);

INSERT INTO public.users (id, wp_user_id, wp_site, email, display_name)
VALUES
  ('23000000-0000-0000-0000-000000000001', 2301, 'pl', 'editor-23@example.test', 'Editor 23'),
  ('23000000-0000-0000-0000-000000000002', 2302, 'pl', 'creator-23@example.test', 'Creator 23'),
  ('23000000-0000-0000-0000-000000000003', 2303, 'qb', 'qb-editor-23@example.test', 'QB Editor 23');

SELECT is(
  (SELECT availability_status FROM public.users WHERE id = '23000000-0000-0000-0000-000000000001'),
  'available',
  'availability defaults to available'
);
SELECT throws_ok(
  $$UPDATE public.users SET availability_status = 'watching' WHERE id = '23000000-0000-0000-0000-000000000001'$$,
  '23514', NULL, 'unknown availability values are rejected'
);
SELECT throws_ok(
  $$UPDATE public.users SET availability_note = repeat('x', 161) WHERE id = '23000000-0000-0000-0000-000000000001'$$,
  '23514', NULL, 'availability notes are bounded'
);
SELECT lives_ok(
  $$UPDATE public.users SET availability_status = 'limited', availability_note = 'One short edit', availability_until = '2026-07-31' WHERE id = '23000000-0000-0000-0000-000000000001'$$,
  'staff can store a bounded self-declared capacity signal'
);

INSERT INTO public.user_roles (user_id, role, site)
VALUES
  ('23000000-0000-0000-0000-000000000001', 'editor', 'pl'),
  ('23000000-0000-0000-0000-000000000003', 'editor', 'qb');
INSERT INTO public.tiers (id, name, label, sort_order)
VALUES ('23000000-0000-0000-0000-000000000010', 'Workflow 23', 'Workflow 23', 23000);
INSERT INTO public.entries (
  id, title, site, tier_id, created_by, content_status, editor_status
)
VALUES
  ('23000000-0000-0000-0000-000000000011', 'Bulk edit one', 'pl', '23000000-0000-0000-0000-000000000010', '23000000-0000-0000-0000-000000000002', 'submitted', 'ready_for_edit'),
  ('23000000-0000-0000-0000-000000000012', 'Bulk edit two', 'pl', '23000000-0000-0000-0000-000000000010', '23000000-0000-0000-0000-000000000002', 'submitted', 'ready_for_edit'),
  ('23000000-0000-0000-0000-000000000013', 'Already claimed', 'pl', '23000000-0000-0000-0000-000000000010', '23000000-0000-0000-0000-000000000002', 'submitted', 'ready_for_edit'),
  ('23000000-0000-0000-0000-000000000014', 'Atomic companion', 'pl', '23000000-0000-0000-0000-000000000010', '23000000-0000-0000-0000-000000000002', 'submitted', 'ready_for_edit'),
  ('23000000-0000-0000-0000-000000000015', 'Wrong site', 'qb', '23000000-0000-0000-0000-000000000010', '23000000-0000-0000-0000-000000000002', 'submitted', 'ready_for_edit'),
  ('23000000-0000-0000-0000-000000000016', 'Still polishing', 'pl', '23000000-0000-0000-0000-000000000010', '23000000-0000-0000-0000-000000000002', 'polishing', 'ready_for_edit');

SELECT is(
  public.bulk_claim_editor_entries(
    '23000000-0000-0000-0000-000000000001',
    ARRAY['23000000-0000-0000-0000-000000000011', '23000000-0000-0000-0000-000000000012']::uuid[]
  ),
  2,
  'an editor atomically claims a valid selected batch'
);
SELECT is(
  (SELECT count(*)::integer FROM public.entry_editors WHERE entry_id IN ('23000000-0000-0000-0000-000000000011', '23000000-0000-0000-0000-000000000012')),
  2,
  'the batch creates every editor assignment'
);
SELECT is(
  (SELECT count(*)::integer FROM public.audit_log WHERE entry_id IN ('23000000-0000-0000-0000-000000000011', '23000000-0000-0000-0000-000000000012') AND field_name = 'editor_track'),
  2,
  'the same transaction creates every handoff audit'
);

INSERT INTO public.entry_editors (entry_id, user_id)
VALUES ('23000000-0000-0000-0000-000000000013', '23000000-0000-0000-0000-000000000001');
SELECT throws_ok(
  $$SELECT public.bulk_claim_editor_entries('23000000-0000-0000-0000-000000000001', ARRAY['23000000-0000-0000-0000-000000000013', '23000000-0000-0000-0000-000000000014']::uuid[])$$,
  'P0001', 'entry_not_claimable', 'one unavailable entry rejects the whole batch'
);
SELECT is(
  (SELECT count(*)::integer FROM public.entry_editors WHERE entry_id = '23000000-0000-0000-0000-000000000014'),
  0,
  'a rejected batch leaves its claimable companion untouched'
);
SELECT throws_ok(
  $$SELECT public.bulk_claim_editor_entries('23000000-0000-0000-0000-000000000001', ARRAY['23000000-0000-0000-0000-000000000015']::uuid[])$$,
  '42501', 'editor_site_role_required', 'the database rejects a cross-site editor claim'
);
SELECT throws_ok(
  $$SELECT public.bulk_claim_editor_entries('23000000-0000-0000-0000-000000000001', ARRAY['23000000-0000-0000-0000-000000000099']::uuid[])$$,
  'P0002', 'entry_not_found', 'a missing entry rejects the whole batch'
);
SELECT throws_ok(
  $$SELECT public.bulk_claim_editor_entries('23000000-0000-0000-0000-000000000001', ARRAY['23000000-0000-0000-0000-000000000014', '23000000-0000-0000-0000-000000000014']::uuid[])$$,
  '22023', 'duplicate_entry_ids', 'duplicate identifiers are rejected'
);
SELECT throws_ok(
  $$SELECT public.bulk_claim_editor_entries('23000000-0000-0000-0000-000000000001', ARRAY['23000000-0000-0000-0000-000000000016']::uuid[])$$,
  'P0001', 'entry_not_claimable', 'work still with the writer cannot be bulk claimed'
);
SELECT is(
  (SELECT count(*)::integer FROM public.entry_editors WHERE entry_id = '23000000-0000-0000-0000-000000000016'),
  0,
  'a premature claim writes no editor assignment'
);

SELECT * FROM finish();
ROLLBACK;
