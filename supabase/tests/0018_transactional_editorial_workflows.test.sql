BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(67);

SELECT ok(
  NOT has_function_privilege('authenticated', 'public.create_writer_claim(uuid,uuid,boolean)', 'EXECUTE'),
  'authenticated clients cannot call the writer-claim transaction directly'
);
SELECT ok(
  has_function_privilege('service_role', 'public.create_writer_claim(uuid,uuid,boolean)', 'EXECUTE'),
  'service role can call the writer-claim transaction'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.resolve_writer_claim(uuid,uuid,text)', 'EXECUTE'),
  'authenticated clients cannot resolve claims directly'
);
SELECT ok(
  has_function_privilege('service_role', 'public.resolve_writer_claim(uuid,uuid,text)', 'EXECUTE'),
  'service role can resolve claims'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.transition_editorial_entry(uuid,uuid,text,text)', 'EXECUTE'),
  'authenticated clients cannot transition editorial state directly'
);
SELECT ok(
  has_function_privilege('service_role', 'public.transition_editorial_entry(uuid,uuid,text,text)', 'EXECUTE'),
  'service role can transition editorial state'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.update_entry_fields(uuid,uuid,jsonb)', 'EXECUTE'),
  'authenticated clients cannot call transactional field updates directly'
);
SELECT ok(
  has_function_privilege('service_role', 'public.update_entry_fields(uuid,uuid,jsonb)', 'EXECUTE'),
  'service role can update entry fields transactionally'
);

INSERT INTO public.users (id, wp_user_id, wp_site, email, display_name)
VALUES
  ('18000000-0000-0000-0000-000000000001', 1801, 'pl', 'writer-18@example.test', 'Writer 18'),
  ('18000000-0000-0000-0000-000000000002', 1802, 'pl', 'editor-18@example.test', 'Editor 18'),
  ('18000000-0000-0000-0000-000000000003', 1803, 'pl', 'manager-18@example.test', 'Manager 18'),
  ('18000000-0000-0000-0000-000000000004', 1804, 'pl', 'racer-18@example.test', 'Racer 18');

INSERT INTO public.tiers (id, name, label, sort_order)
VALUES
  ('28000000-0000-0000-0000-000000000001', 'Editorial 18', 'Editorial 18', 18000),
  ('28000000-0000-0000-0000-000000000002', 'Editorial 18B', 'Editorial 18B', 18001);

INSERT INTO public.checklist_items (id, tier_id, label, is_required, sort_order)
VALUES
  (
    '38000000-0000-0000-0000-000000000001',
    '28000000-0000-0000-0000-000000000001',
    'Required editorial check', true, 18000
  ),
  (
    '38000000-0000-0000-0000-000000000002',
    '28000000-0000-0000-0000-000000000002',
    'Replacement editorial check', true, 18001
  );

INSERT INTO public.entries (
  id, title, site, tier_id, publish_date, publish_date_precision, created_by
)
VALUES
  ('48000000-0000-0000-0000-000000000001', 'Pending claim', 'pl', '28000000-0000-0000-0000-000000000001', NULL, 'none', '18000000-0000-0000-0000-000000000003'),
  ('48000000-0000-0000-0000-000000000002', 'Denied claim', 'pl', '28000000-0000-0000-0000-000000000001', NULL, 'none', '18000000-0000-0000-0000-000000000003'),
  ('48000000-0000-0000-0000-000000000003', 'Auto claim', 'pl', '28000000-0000-0000-0000-000000000001', '2026-08-01T12:00:00Z', 'exact', '18000000-0000-0000-0000-000000000003'),
  ('48000000-0000-0000-0000-000000000004', 'Submit flow', 'pl', '28000000-0000-0000-0000-000000000001', NULL, 'none', '18000000-0000-0000-0000-000000000003'),
  ('48000000-0000-0000-0000-000000000005', 'Polishing flow', 'pl', '28000000-0000-0000-0000-000000000001', NULL, 'none', '18000000-0000-0000-0000-000000000003');

SELECT throws_ok(
  $$UPDATE public.entries SET publish_date = now(), publish_date_precision = 'none' WHERE id = '48000000-0000-0000-0000-000000000001'$$,
  '23514', NULL, 'a real deadline cannot use none precision'
);
SELECT throws_ok(
  $$UPDATE public.entries SET publish_date = NULL, publish_date_precision = 'exact' WHERE id = '48000000-0000-0000-0000-000000000001'$$,
  '23514', NULL, 'a deadline precision requires a timestamp'
);
SELECT lives_ok(
  $$UPDATE public.entries SET publish_date = '2026-08-02T12:00:00Z', publish_date_precision = 'loose_date' WHERE id = '48000000-0000-0000-0000-000000000001'$$,
  'a timestamp and non-none precision form a valid deadline'
);
SELECT lives_ok(
  $$UPDATE public.entries SET publish_date = NULL, publish_date_precision = 'none' WHERE id = '48000000-0000-0000-0000-000000000001'$$,
  'clearing both deadline fields remains valid'
);
SELECT throws_ok(
  $$SELECT public.update_entry_fields(
    '18000000-0000-0000-0000-000000000003',
    '48000000-0000-0000-0000-000000000001',
    '{"publish_date":"2026-08-03T12:00:00Z"}'::jsonb
  )$$,
  '22023', 'deadline_fields_must_change_together',
  'transactional field updates reject a torn deadline pair'
);
SELECT ok(
  public.update_entry_fields(
    '18000000-0000-0000-0000-000000000003',
    '48000000-0000-0000-0000-000000000001',
    '{"publish_date":"2026-08-03T12:00:00Z","publish_date_precision":"loose_time"}'::jsonb
  ),
  'deadline timestamp, precision, and audits commit together'
);
SELECT ok(
  (SELECT
    publish_date = '2026-08-03T12:00:00Z'::timestamptz
    AND publish_date_precision = 'loose_time'
   FROM public.entries
   WHERE id = '48000000-0000-0000-0000-000000000001'),
  'transactional deadline update stores one coherent value'
);
SELECT is(
  (SELECT count(*)::integer
   FROM public.audit_log
   WHERE entry_id = '48000000-0000-0000-0000-000000000001'
     AND field_name IN ('publish_date', 'publish_date_precision')),
  2, 'deadline transaction writes both field audits'
);
SELECT ok(
  public.update_entry_fields(
    '18000000-0000-0000-0000-000000000003',
    '48000000-0000-0000-0000-000000000001',
    '{"publish_date":"2026-08-03T12:00:00Z","publish_date_precision":"loose_time"}'::jsonb
  ),
  'repeating the same deadline is a successful no-op'
);
SELECT is(
  (SELECT count(*)::integer
   FROM public.audit_log
   WHERE entry_id = '48000000-0000-0000-0000-000000000001'
     AND field_name IN ('publish_date', 'publish_date_precision')),
  2, 'deadline no-op does not duplicate audit history'
);
INSERT INTO public.entry_checklist (
  entry_id, checklist_item_id, is_completed, completed_by, completed_at
) VALUES (
  '48000000-0000-0000-0000-000000000001',
  '38000000-0000-0000-0000-000000000001',
  true,
  '18000000-0000-0000-0000-000000000003',
  now()
);
SELECT throws_ok(
  $$SELECT public.update_entry_fields(
    '18000000-0000-0000-0000-000000000003',
    '48000000-0000-0000-0000-000000000001',
    '{"tier_id":"28000000-0000-0000-0000-000000000002"}'::jsonb
  )$$,
  'P0001', 'completed_checklist_blocks_tier_change',
  'single-entry tier changes preserve completed checklist work'
);
UPDATE public.entry_checklist
SET is_completed = false, completed_by = NULL, completed_at = NULL
WHERE entry_id = '48000000-0000-0000-0000-000000000001';
SELECT ok(
  public.update_entry_fields(
    '18000000-0000-0000-0000-000000000003',
    '48000000-0000-0000-0000-000000000001',
    '{"tier_id":"28000000-0000-0000-0000-000000000002"}'::jsonb
  ),
  'single-entry tier change succeeds when no checklist work would be lost'
);
SELECT is(
  (SELECT tier_id FROM public.entries WHERE id = '48000000-0000-0000-0000-000000000001'),
  '28000000-0000-0000-0000-000000000002'::uuid,
  'transactional field update stores the replacement tier'
);
SELECT is(
  (SELECT count(*)::integer FROM public.entry_checklist
   WHERE entry_id = '48000000-0000-0000-0000-000000000001'
     AND checklist_item_id = '38000000-0000-0000-0000-000000000002'),
  1, 'tier change replaces the checklist inside the same transaction'
);
SELECT is(
  (SELECT count(*)::integer FROM public.audit_log
   WHERE entry_id = '48000000-0000-0000-0000-000000000001'
     AND field_name = 'tier_id'),
  1, 'tier change commits one matching audit row'
);

SELECT is(
  (SELECT claim_status FROM public.create_writer_claim(
    '18000000-0000-0000-0000-000000000001',
    '48000000-0000-0000-0000-000000000001', false
  )),
  'pending', 'a writer can create one pending claim transaction'
);
SELECT is(
  (SELECT content_status FROM public.entries WHERE id = '48000000-0000-0000-0000-000000000001'),
  'claim_requested', 'pending claim changes the entry state atomically'
);
SELECT is(
  (SELECT count(*)::integer FROM public.claims WHERE entry_id = '48000000-0000-0000-0000-000000000001'),
  1, 'pending claim transaction creates exactly one claim row'
);
SELECT throws_ok(
  $$SELECT * FROM public.create_writer_claim('18000000-0000-0000-0000-000000000004', '48000000-0000-0000-0000-000000000001', false)$$,
  'P0001', 'entry_not_claimable', 'a second claimant cannot pass the claimed entry state'
);
SELECT is(
  (SELECT count(*)::integer FROM public.audit_log
   WHERE entry_id = '48000000-0000-0000-0000-000000000001'
     AND field_name IN ('content_track', 'content_status')),
  2, 'claim request and state change share one audit transaction'
);

SELECT is(
  (SELECT resolution FROM public.resolve_writer_claim(
    '18000000-0000-0000-0000-000000000003',
    (SELECT id FROM public.claims WHERE entry_id = '48000000-0000-0000-0000-000000000001'),
    'approve'
  )),
  'approve', 'manager approval resolves the pending claim'
);
SELECT is(
  (SELECT status FROM public.claims WHERE entry_id = '48000000-0000-0000-0000-000000000001'),
  'approved', 'approved claim stores its terminal state'
);
SELECT is(
  (SELECT content_status FROM public.entries WHERE id = '48000000-0000-0000-0000-000000000001'),
  'claimed', 'approval moves the entry to claimed'
);
SELECT is(
  (SELECT user_id FROM public.entry_authors WHERE entry_id = '48000000-0000-0000-0000-000000000001' AND role = 'primary'),
  '18000000-0000-0000-0000-000000000001'::uuid,
  'approval assigns the claimant as the primary author'
);
SELECT is(
  (SELECT count(*)::integer FROM public.audit_log
   WHERE entry_id = '48000000-0000-0000-0000-000000000001'
     AND field_name IN ('content_track', 'content_status')),
  3, 'approval adds exactly one status audit'
);
SELECT throws_ok(
  $$SELECT * FROM public.resolve_writer_claim(
    '18000000-0000-0000-0000-000000000003',
    (SELECT id FROM public.claims WHERE entry_id = '48000000-0000-0000-0000-000000000001'),
    'deny'
  )$$,
  'P0001', 'claim_not_pending', 'a resolved claim cannot be resolved again'
);

SELECT lives_ok(
  $$SELECT * FROM public.create_writer_claim(
    '18000000-0000-0000-0000-000000000001',
    '48000000-0000-0000-0000-000000000002', false
  )$$,
  'a second entry can open an independent pending claim'
);
SELECT is(
  (SELECT resolution FROM public.resolve_writer_claim(
    '18000000-0000-0000-0000-000000000003',
    (SELECT id FROM public.claims WHERE entry_id = '48000000-0000-0000-0000-000000000002'),
    'deny'
  )),
  'deny', 'manager denial resolves the pending claim'
);
SELECT is(
  (SELECT status FROM public.claims WHERE entry_id = '48000000-0000-0000-0000-000000000002'),
  'denied', 'denied claim stores its terminal state'
);
SELECT is(
  (SELECT content_status FROM public.entries WHERE id = '48000000-0000-0000-0000-000000000002'),
  'writer_needed', 'denial reopens the writer slot'
);
SELECT is(
  (SELECT count(*)::integer FROM public.entry_authors WHERE entry_id = '48000000-0000-0000-0000-000000000002'),
  0, 'denial does not create an assignment'
);

SELECT is(
  (SELECT claim_status FROM public.create_writer_claim(
    '18000000-0000-0000-0000-000000000003',
    '48000000-0000-0000-0000-000000000003', true
  )),
  'approved', 'manager self-claim auto-approves in one transaction'
);
SELECT is(
  (SELECT content_status FROM public.entries WHERE id = '48000000-0000-0000-0000-000000000003'),
  'claimed', 'auto-approval moves the entry directly to claimed'
);
SELECT is(
  (SELECT user_id FROM public.entry_authors WHERE entry_id = '48000000-0000-0000-0000-000000000003'),
  '18000000-0000-0000-0000-000000000003'::uuid,
  'auto-approval creates the primary assignment'
);
SELECT is(
  (SELECT count(*)::integer FROM public.audit_log WHERE entry_id = '48000000-0000-0000-0000-000000000003'),
  2, 'auto-approval records claim and state audits together'
);

UPDATE public.entries
SET content_status = 'claimed'
WHERE id = '48000000-0000-0000-0000-000000000004';
INSERT INTO public.entry_authors (entry_id, user_id, role)
VALUES ('48000000-0000-0000-0000-000000000004', '18000000-0000-0000-0000-000000000001', 'primary');
INSERT INTO public.entry_checklist (entry_id, checklist_item_id)
VALUES ('48000000-0000-0000-0000-000000000004', '38000000-0000-0000-0000-000000000001');

SELECT throws_ok(
  $$SELECT public.transition_editorial_entry('18000000-0000-0000-0000-000000000001', '48000000-0000-0000-0000-000000000004', 'submit', NULL)$$,
  'P0004', 'checklist_incomplete', 'required checklist work blocks submission inside the transaction'
);
UPDATE public.entry_checklist
SET is_completed = true,
    completed_by = '18000000-0000-0000-0000-000000000001',
    completed_at = now()
WHERE entry_id = '48000000-0000-0000-0000-000000000004';
SELECT ok(
  public.transition_editorial_entry('18000000-0000-0000-0000-000000000001', '48000000-0000-0000-0000-000000000004', 'submit', NULL),
  'assigned writer can submit after completing required work'
);
SELECT is(
  (SELECT content_status FROM public.entries WHERE id = '48000000-0000-0000-0000-000000000004'),
  'submitted', 'submission advances the content track'
);
SELECT is(
  (SELECT editor_status FROM public.entries WHERE id = '48000000-0000-0000-0000-000000000004'),
  'ready_for_edit', 'submission opens the editor track'
);
SELECT is(
  (SELECT count(*)::integer FROM public.audit_log WHERE entry_id = '48000000-0000-0000-0000-000000000004'),
  2, 'submission commits both track audits together'
);
SELECT throws_ok(
  $$SELECT public.transition_editorial_entry('18000000-0000-0000-0000-000000000001', '48000000-0000-0000-0000-000000000004', 'submit', NULL)$$,
  'P0001', 'content_not_submittable', 'duplicate submission is rejected'
);

SELECT ok(
  public.transition_editorial_entry('18000000-0000-0000-0000-000000000002', '48000000-0000-0000-0000-000000000004', 'claim_edit', NULL),
  'one editor can claim the ready edit slot'
);
SELECT is(
  (SELECT user_id FROM public.entry_editors WHERE entry_id = '48000000-0000-0000-0000-000000000004'),
  '18000000-0000-0000-0000-000000000002'::uuid,
  'editor claim creates exactly the selected assignment'
);
SELECT throws_ok(
  $$SELECT public.transition_editorial_entry('18000000-0000-0000-0000-000000000004', '48000000-0000-0000-0000-000000000004', 'claim_edit', NULL)$$,
  'P0001', 'edit_already_claimed', 'a competing editor cannot replace the assignment'
);

INSERT INTO public.graphic_requests (entry_id, title)
VALUES ('48000000-0000-0000-0000-000000000004', 'Pending graphic');
SELECT throws_ok(
  $$SELECT public.transition_editorial_entry('18000000-0000-0000-0000-000000000002', '48000000-0000-0000-0000-000000000004', 'mark_edited', NULL)$$,
  'P0004', 'graphics_incomplete', 'unfinished graphics block edited state inside the transaction'
);
UPDATE public.graphic_requests
SET graphic_status = 'submitted'
WHERE entry_id = '48000000-0000-0000-0000-000000000004';
SELECT ok(
  public.transition_editorial_entry('18000000-0000-0000-0000-000000000002', '48000000-0000-0000-0000-000000000004', 'mark_edited', NULL),
  'completed graphics allow the edited transition'
);
SELECT is(
  (SELECT editor_status FROM public.entries WHERE id = '48000000-0000-0000-0000-000000000004'),
  'edited', 'edited transition advances the editor track'
);
SELECT ok(
  public.transition_editorial_entry('18000000-0000-0000-0000-000000000002', '48000000-0000-0000-0000-000000000004', 'mark_edited', NULL),
  'mark edited is idempotent after the terminal dashboard transition'
);
SELECT is(
  (SELECT count(*)::integer FROM public.audit_log WHERE entry_id = '48000000-0000-0000-0000-000000000004' AND new_value = 'edited'),
  1, 'idempotent mark edited does not duplicate its audit row'
);

UPDATE public.entries
SET content_status = 'submitted', editor_status = 'ready_for_edit'
WHERE id = '48000000-0000-0000-0000-000000000005';
INSERT INTO public.entry_authors (entry_id, user_id, role)
VALUES ('48000000-0000-0000-0000-000000000005', '18000000-0000-0000-0000-000000000001', 'primary');
SELECT ok(
  public.transition_editorial_entry('18000000-0000-0000-0000-000000000002', '48000000-0000-0000-0000-000000000005', 'send_to_polishing', 'Please tighten the conclusion'),
  'editor can send submitted work to polishing with a reason'
);
SELECT is(
  (SELECT content_status FROM public.entries WHERE id = '48000000-0000-0000-0000-000000000005'),
  'polishing', 'polishing request returns the content track to the writer'
);
SELECT is(
  (SELECT new_value FROM public.audit_log WHERE entry_id = '48000000-0000-0000-0000-000000000005'),
  'polishing: Please tighten the conclusion', 'polishing reason is retained in the transactional audit'
);
SELECT ok(
  public.transition_editorial_entry('18000000-0000-0000-0000-000000000001', '48000000-0000-0000-0000-000000000005', 'submit', NULL),
  'assigned writer can resubmit polished work'
);
SELECT is(
  (SELECT content_status FROM public.entries WHERE id = '48000000-0000-0000-0000-000000000005'),
  'submitted', 'resubmission returns content to the editor queue'
);

-- Use two independent sessions against committed fixture rows to prove the
-- row lock serializes simultaneous claims. Worker one explicitly locks the
-- entry before worker two starts; after worker one claims and commits, worker
-- two must re-check the committed state and fail.
DO $setup$
BEGIN
  PERFORM dblink_connect(
    'editorial_worker_1',
    'host=host.docker.internal port=54322 dbname=' || current_database() ||
      ' user=postgres password=postgres'
  );
  PERFORM dblink_connect(
    'editorial_worker_2',
    'host=host.docker.internal port=54322 dbname=' || current_database() ||
      ' user=postgres password=postgres'
  );
  PERFORM dblink_exec(
    'editorial_worker_1',
    $$DROP FUNCTION IF EXISTS public.hold_editorial_test_result(text);
    DELETE FROM public.entries WHERE id = '48000000-0000-0000-0000-000000000091';
    DELETE FROM public.tiers WHERE id = '28000000-0000-0000-0000-000000000091';
    DELETE FROM public.users WHERE id IN (
      '18000000-0000-0000-0000-000000000091',
      '18000000-0000-0000-0000-000000000092'
    );
    INSERT INTO public.users (id, wp_user_id, wp_site, email, display_name)
    VALUES
      ('18000000-0000-0000-0000-000000000091', 1891, 'pl', 'race-one-18@example.test', 'Race One'),
      ('18000000-0000-0000-0000-000000000092', 1892, 'pl', 'race-two-18@example.test', 'Race Two');
    INSERT INTO public.tiers (id, name, label, sort_order)
    VALUES ('28000000-0000-0000-0000-000000000091', 'Race Tier 18', 'Race Tier 18', 18091);
    INSERT INTO public.entries (id, title, site, tier_id, created_by)
    VALUES (
      '48000000-0000-0000-0000-000000000091', 'Concurrent claim', 'pl',
      '28000000-0000-0000-0000-000000000091',
      '18000000-0000-0000-0000-000000000091'
    )$$
  );
END;
$setup$;
SELECT ok(
  dblink_exec('editorial_worker_1', 'BEGIN') = 'BEGIN',
  'first concurrent claimant starts an explicit transaction'
);
DO $lock$
BEGIN
  PERFORM *
  FROM dblink(
    'editorial_worker_1',
    $$SELECT 1 FROM public.entries
      WHERE id = '48000000-0000-0000-0000-000000000091'
      FOR UPDATE$$
  ) AS result(locked integer);
END;
$lock$;
SELECT ok(
  dblink_send_query(
    'editorial_worker_2',
    $$SELECT claim_status FROM public.create_writer_claim(
      '18000000-0000-0000-0000-000000000092',
      '48000000-0000-0000-0000-000000000091', false
    )$$
  ) = 1,
  'second concurrent claimant starts while the first holds the entry lock'
);
DO $$ BEGIN PERFORM pg_sleep(0.1); END $$;
SELECT is(
  (SELECT claim_status FROM dblink(
    'editorial_worker_1',
    $$SELECT claim_status FROM public.create_writer_claim(
      '18000000-0000-0000-0000-000000000091',
      '48000000-0000-0000-0000-000000000091', false
    )$$
  ) AS result(claim_status text)),
  'pending', 'first concurrent claimant creates the one pending claim'
);
DO $$
BEGIN
  PERFORM dblink_exec('editorial_worker_1', 'COMMIT');
END;
$$;
DO $$
BEGIN
  PERFORM *
  FROM dblink_get_result('editorial_worker_2', false) AS result(claim_status text);
END;
$$;
SELECT ok(
  dblink_error_message('editorial_worker_2') LIKE '%entry_not_claimable%',
  'second concurrent claimant re-checks state after the lock and fails'
);
SELECT is(
  (SELECT count(*)::integer FROM dblink(
    'editorial_worker_1',
    $$SELECT count(*)::integer FROM public.claims
      WHERE entry_id = '48000000-0000-0000-0000-000000000091'$$
  ) AS result(claim_count integer)),
  1, 'simultaneous claims leave exactly one claim and assignment decision'
);
DO $cleanup$
BEGIN
  PERFORM dblink_exec(
    'editorial_worker_1',
    $$DELETE FROM public.entries WHERE id = '48000000-0000-0000-0000-000000000091';
    DELETE FROM public.tiers WHERE id = '28000000-0000-0000-0000-000000000091';
    DELETE FROM public.users WHERE id IN (
      '18000000-0000-0000-0000-000000000091',
      '18000000-0000-0000-0000-000000000092'
    )$$
  );
  PERFORM dblink_disconnect('editorial_worker_1');
  PERFORM dblink_disconnect('editorial_worker_2');
END;
$cleanup$;

SELECT * FROM finish();
ROLLBACK;
