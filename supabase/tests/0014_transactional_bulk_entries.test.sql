BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(39);

SELECT ok(
  NOT has_function_privilege('anon', 'public.bulk_create_entries(uuid,jsonb)', 'EXECUTE'),
  'anon cannot execute bulk create'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.bulk_update_entries(uuid,uuid[],text,jsonb)', 'EXECUTE'),
  'authenticated cannot execute bulk update'
);
SELECT ok(
  has_function_privilege('service_role', 'public.bulk_create_entries(uuid,jsonb)', 'EXECUTE')
  AND has_function_privilege('service_role', 'public.bulk_update_entries(uuid,uuid[],text,jsonb)', 'EXECUTE'),
  'service role can execute both transactional bulk functions'
);

INSERT INTO users (id, wp_user_id, wp_site, email, display_name)
VALUES
  ('11000000-0000-0000-0000-000000000001', 1101, 'pl', 'bulk-actor@example.test', 'Bulk Actor'),
  ('11000000-0000-0000-0000-000000000002', 1102, 'pl', 'bulk-writer@example.test', 'Bulk Writer');

INSERT INTO tiers (id, name, label, sort_order)
VALUES
  ('21000000-0000-0000-0000-000000000001', 'Bulk Tier One', 'Bulk One', 9100),
  ('21000000-0000-0000-0000-000000000002', 'Bulk Tier Two', 'Bulk Two', 9200);

INSERT INTO checklist_items (id, tier_id, label, sort_order)
VALUES
  ('61000000-0000-0000-0000-000000000001', '21000000-0000-0000-0000-000000000001', 'One A', 1),
  ('61000000-0000-0000-0000-000000000002', '21000000-0000-0000-0000-000000000001', 'One B', 2),
  ('61000000-0000-0000-0000-000000000003', '21000000-0000-0000-0000-000000000002', 'Two A', 1),
  ('61000000-0000-0000-0000-000000000004', '21000000-0000-0000-0000-000000000002', 'Two B', 2);

INSERT INTO categories (id, site, wp_category_id, name)
VALUES
  ('31000000-0000-0000-0000-000000000001', 'pl', 5101, 'PL Bulk'),
  ('31000000-0000-0000-0000-000000000002', 'qb', 5101, 'QB Bulk');

SELECT is(
  (
    SELECT count(*)::integer
    FROM bulk_create_entries(
      '11000000-0000-0000-0000-000000000001',
      jsonb_build_array(
        jsonb_build_object(
          'title', 'Bulk create A',
          'site', 'pl',
          'tier_id', '21000000-0000-0000-0000-000000000001',
          'category_id', '31000000-0000-0000-0000-000000000001',
          'assignee_user_ids', jsonb_build_array('11000000-0000-0000-0000-000000000002')
        ),
        jsonb_build_object(
          'title', 'Bulk create B',
          'site', 'pl',
          'tier_id', '21000000-0000-0000-0000-000000000001',
          'category_id', '31000000-0000-0000-0000-000000000001',
          'assignee_user_ids', '[]'::jsonb
        )
      )
    )
  ),
  2,
  'bulk create returns one ordered result per requested entry'
);
SELECT is(
  (SELECT count(*)::integer FROM entries WHERE title LIKE 'Bulk create %'),
  2,
  'bulk create inserts every entry'
);
SELECT is(
  (
    SELECT count(*)::integer
    FROM entry_checklist ec
    JOIN entries e ON e.id = ec.entry_id
    WHERE e.title LIKE 'Bulk create %'
  ),
  4,
  'bulk create seeds every tier checklist atomically'
);
SELECT is(
  (
    SELECT count(*)::integer
    FROM entry_authors ea
    JOIN entries e ON e.id = ea.entry_id
    WHERE e.title LIKE 'Bulk create %'
  ),
  1,
  'bulk create inserts requested authors'
);
SELECT is(
  (SELECT count(*)::integer FROM entries WHERE title = 'Bulk create A' AND content_status = 'claimed'),
  1,
  'an assigned bulk-created entry starts claimed'
);
SELECT is(
  (
    SELECT count(*)::integer
    FROM audit_log a
    JOIN entries e ON e.id = a.entry_id
    WHERE e.title LIKE 'Bulk create %' AND a.action = 'created'
  ),
  2,
  'bulk create writes every audit row in the transaction'
);
SELECT is(
  (SELECT count(*)::integer FROM entries WHERE title LIKE 'Bulk create %' AND jsonb_array_length(recent_activity) = 1),
  2,
  'bulk create initializes recent activity in the same transaction'
);

SELECT throws_ok(
  $$SELECT public.bulk_create_entries(
    '11000000-0000-0000-0000-000000000001',
    '[
      {"title":"Rollback good","site":"pl","tier_id":"21000000-0000-0000-0000-000000000001","assignee_user_ids":[]},
      {"title":"Rollback bad user","site":"pl","tier_id":"21000000-0000-0000-0000-000000000001","assignee_user_ids":["11000000-0000-0000-0000-000000000099"]}
    ]'::jsonb
  )$$,
  '23503', NULL, 'one bad assignee rejects the entire create batch'
);
SELECT is(
  (SELECT count(*)::integer FROM entries WHERE title LIKE 'Rollback %'),
  0,
  'assignee failure rolls back otherwise valid entries'
);

SELECT throws_ok(
  $$SELECT public.bulk_create_entries(
    '11000000-0000-0000-0000-000000000001',
    '[
      {"title":"Cross rollback good","site":"pl","tier_id":"21000000-0000-0000-0000-000000000001"},
      {"title":"Cross rollback bad","site":"pl","tier_id":"21000000-0000-0000-0000-000000000001","category_id":"31000000-0000-0000-0000-000000000002"}
    ]'::jsonb
  )$$,
  '23503', NULL, 'one cross-site category rejects the entire create batch'
);
SELECT is(
  (SELECT count(*)::integer FROM entries WHERE title LIKE 'Cross rollback %'),
  0,
  'cross-site failure rolls back otherwise valid entries'
);

SELECT throws_ok(
  $$SELECT public.bulk_create_entries(
    '11000000-0000-0000-0000-000000000001',
    '[{"title":"Duplicate author rollback","site":"pl","tier_id":"21000000-0000-0000-0000-000000000001","assignee_user_ids":["11000000-0000-0000-0000-000000000002","11000000-0000-0000-0000-000000000002"]}]'::jsonb
  )$$,
  '23505', NULL, 'duplicate assignees reject a create batch'
);
SELECT is(
  (SELECT count(*)::integer FROM entries WHERE title = 'Duplicate author rollback'),
  0,
  'duplicate-author failure leaves no entry behind'
);

SELECT is(
  bulk_update_entries(
    '11000000-0000-0000-0000-000000000001',
    ARRAY(SELECT id FROM entries WHERE title LIKE 'Bulk create %' ORDER BY id),
    'archive',
    '{"reason":"Batch cleanup"}'::jsonb
  ),
  2,
  'bulk archive reports the number of changed entries'
);
SELECT is(
  (SELECT count(*)::integer FROM entries WHERE title LIKE 'Bulk create %' AND is_archived AND archive_reason = 'Batch cleanup'),
  2,
  'bulk archive updates every target'
);
SELECT is(
  (
    SELECT count(*)::integer
    FROM audit_log a
    JOIN entries e ON e.id = a.entry_id
    WHERE e.title LIKE 'Bulk create %' AND a.action = 'archive'
  ),
  2,
  'bulk archive writes one audit per changed target'
);
SELECT is(
  bulk_update_entries(
    '11000000-0000-0000-0000-000000000001',
    ARRAY(SELECT id FROM entries WHERE title LIKE 'Bulk create %' ORDER BY id),
    'archive',
    '{"reason":"Ignored no-op"}'::jsonb
  ),
  0,
  'repeating an archive is a no-op'
);
SELECT is(
  (
    SELECT count(*)::integer
    FROM audit_log a
    JOIN entries e ON e.id = a.entry_id
    WHERE e.title LIKE 'Bulk create %' AND a.action = 'archive'
  ),
  2,
  'a no-op archive does not create false audits'
);

SELECT throws_ok(
  $$SELECT public.bulk_update_entries(
    '11000000-0000-0000-0000-000000000099',
    ARRAY(SELECT id FROM public.entries WHERE title LIKE 'Bulk create %' ORDER BY id),
    'set_priority',
    '{"priority":true}'::jsonb
  )$$,
  '23503', NULL, 'audit failure rejects a bulk update'
);
SELECT is(
  (SELECT count(*)::integer FROM entries WHERE title LIKE 'Bulk create %' AND NOT priority),
  2,
  'audit failure rolls back every entry update'
);

SELECT throws_ok(
  $$SELECT public.bulk_update_entries(
    '11000000-0000-0000-0000-000000000001',
    ARRAY[
      (SELECT id FROM public.entries WHERE title = 'Bulk create A'),
      '80000000-0000-0000-0000-000000000099'::uuid
    ],
    'set_priority',
    '{"priority":true}'::jsonb
  )$$,
  'P0002', NULL, 'a missing target rejects the entire bulk update'
);
SELECT is(
  (SELECT count(*)::integer FROM entries WHERE title LIKE 'Bulk create %' AND NOT priority),
  2,
  'missing-target failure leaves existing targets unchanged'
);

SELECT is(
  bulk_update_entries(
    '11000000-0000-0000-0000-000000000001',
    ARRAY(SELECT id FROM entries WHERE title LIKE 'Bulk create %' ORDER BY id),
    'set_priority',
    '{"priority":true}'::jsonb
  ),
  2,
  'bulk priority reports every changed target'
);
SELECT is(
  (SELECT count(*)::integer FROM entries WHERE title LIKE 'Bulk create %' AND priority),
  2,
  'bulk priority updates every target'
);
SELECT is(
  (
    SELECT count(*)::integer
    FROM audit_log a
    JOIN entries e ON e.id = a.entry_id
    WHERE e.title LIKE 'Bulk create %'
      AND a.field_name = 'priority'
      AND a.old_value = 'false'
      AND a.new_value = 'true'
  ),
  2,
  'bulk priority audits real per-entry before and after values'
);

SELECT is(
  bulk_update_entries(
    '11000000-0000-0000-0000-000000000001',
    ARRAY(SELECT id FROM entries WHERE title LIKE 'Bulk create %' ORDER BY id),
    'change_tier',
    '{"tier_id":"21000000-0000-0000-0000-000000000002"}'::jsonb
  ),
  2,
  'bulk tier change reports every changed target'
);
SELECT is(
  (SELECT count(*)::integer FROM entries WHERE title LIKE 'Bulk create %' AND tier_id = '21000000-0000-0000-0000-000000000002'),
  2,
  'bulk tier change updates every entry'
);
SELECT is(
  (
    SELECT count(*)::integer
    FROM entry_checklist ec
    JOIN entries e ON e.id = ec.entry_id
    WHERE e.title LIKE 'Bulk create %'
      AND ec.checklist_item_id IN (
        '61000000-0000-0000-0000-000000000001',
        '61000000-0000-0000-0000-000000000002'
      )
  ),
  0,
  'tier change removes stale incomplete checklist rows'
);
SELECT is(
  (
    SELECT count(*)::integer
    FROM entry_checklist ec
    JOIN entries e ON e.id = ec.entry_id
    WHERE e.title LIKE 'Bulk create %'
      AND ec.checklist_item_id IN (
        '61000000-0000-0000-0000-000000000003',
        '61000000-0000-0000-0000-000000000004'
      )
  ),
  4,
  'tier change seeds the target tier checklist'
);
SELECT is(
  (
    SELECT count(*)::integer
    FROM audit_log a
    JOIN entries e ON e.id = a.entry_id
    WHERE e.title LIKE 'Bulk create %'
      AND a.field_name = 'tier_id'
      AND a.old_value = '21000000-0000-0000-0000-000000000001'
      AND a.new_value = '21000000-0000-0000-0000-000000000002'
  ),
  2,
  'tier change audits the real old and new tier IDs'
);

UPDATE entry_checklist
SET is_completed = true,
    completed_by = '11000000-0000-0000-0000-000000000001',
    completed_at = now()
WHERE entry_id = (SELECT id FROM entries WHERE title = 'Bulk create A')
  AND checklist_item_id = '61000000-0000-0000-0000-000000000003';

SELECT throws_ok(
  $$SELECT public.bulk_update_entries(
    '11000000-0000-0000-0000-000000000001',
    ARRAY(SELECT id FROM public.entries WHERE title LIKE 'Bulk create %' ORDER BY id),
    'change_tier',
    '{"tier_id":"21000000-0000-0000-0000-000000000001"}'::jsonb
  )$$,
  'P0001', NULL, 'completed checklist work blocks a tier change'
);
SELECT is(
  (SELECT count(*)::integer FROM entries WHERE title LIKE 'Bulk create %' AND tier_id = '21000000-0000-0000-0000-000000000002'),
  2,
  'blocked tier change rolls back the whole entry set'
);
SELECT is(
  (
    SELECT count(*)::integer
    FROM entry_checklist ec
    JOIN entries e ON e.id = ec.entry_id
    WHERE e.title LIKE 'Bulk create %'
      AND ec.checklist_item_id IN (
        '61000000-0000-0000-0000-000000000003',
        '61000000-0000-0000-0000-000000000004'
      )
  ),
  4,
  'blocked tier change preserves all checklist rows'
);

SELECT throws_ok(
  $$SELECT public.bulk_update_entries(
    '11000000-0000-0000-0000-000000000001',
    ARRAY(SELECT id FROM public.entries WHERE title LIKE 'Bulk create %' ORDER BY id),
    'set_priority',
    '{"priority":"yes"}'::jsonb
  )$$,
  '22023', NULL, 'database contract rejects non-boolean priority payloads'
);
SELECT is(
  (SELECT count(*)::integer FROM entries WHERE title LIKE 'Bulk create %' AND priority),
  2,
  'invalid priority payload preserves existing values'
);

SELECT throws_ok(
  $$SELECT public.bulk_update_entries(
    '11000000-0000-0000-0000-000000000001',
    ARRAY[
      (SELECT id FROM public.entries WHERE title = 'Bulk create A'),
      (SELECT id FROM public.entries WHERE title = 'Bulk create A')
    ],
    'unarchive',
    '{}'::jsonb
  )$$,
  '22023', NULL, 'database contract rejects duplicate target IDs'
);

SELECT * FROM finish();
ROLLBACK;
