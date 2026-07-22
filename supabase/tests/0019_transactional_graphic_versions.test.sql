BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS dblink WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT no_plan();

SELECT ok(
  NOT has_table_privilege('authenticated', 'public.graphic_request_versions', 'SELECT'),
  'authenticated clients cannot read private graphic versions directly'
);
SELECT ok(
  has_table_privilege('service_role', 'public.graphic_request_versions', 'SELECT'),
  'service role can read private graphic versions'
);

SELECT ok(NOT has_function_privilege('authenticated', 'public.record_graphic_upload(uuid,uuid,boolean,text,text,text,integer,text)', 'EXECUTE'), 'record upload RPC is server-only');
SELECT ok(has_function_privilege('service_role', 'public.record_graphic_upload(uuid,uuid,boolean,text,text,text,integer,text)', 'EXECUTE'), 'service role can record an upload');
SELECT ok(NOT has_function_privilege('authenticated', 'public.begin_graphic_submission(uuid,uuid,boolean)', 'EXECUTE'), 'begin submission RPC is server-only');
SELECT ok(has_function_privilege('service_role', 'public.begin_graphic_submission(uuid,uuid,boolean)', 'EXECUTE'), 'service role can begin submission');
SELECT ok(NOT has_function_privilege('authenticated', 'public.record_graphic_wp_media(uuid,uuid,integer)', 'EXECUTE'), 'record WP media RPC is server-only');
SELECT ok(has_function_privilege('service_role', 'public.record_graphic_wp_media(uuid,uuid,integer)', 'EXECUTE'), 'service role can record WP media');
SELECT ok(NOT has_function_privilege('authenticated', 'public.complete_graphic_submission(uuid,uuid,uuid)', 'EXECUTE'), 'complete submission RPC is server-only');
SELECT ok(has_function_privilege('service_role', 'public.complete_graphic_submission(uuid,uuid,uuid)', 'EXECUTE'), 'service role can complete submission');
SELECT ok(NOT has_function_privilege('authenticated', 'public.release_graphic_submission(uuid,uuid)', 'EXECUTE'), 'release submission RPC is server-only');
SELECT ok(has_function_privilege('service_role', 'public.release_graphic_submission(uuid,uuid)', 'EXECUTE'), 'service role can release submission');
SELECT ok(NOT has_function_privilege('authenticated', 'public.transition_graphic_request(uuid,uuid,text,text,boolean)', 'EXECUTE'), 'graphic transition RPC is server-only');
SELECT ok(has_function_privilege('service_role', 'public.transition_graphic_request(uuid,uuid,text,text,boolean)', 'EXECUTE'), 'service role can transition graphics');
SELECT ok(NOT has_function_privilege('authenticated', 'public.delete_graphic_request(uuid,uuid,boolean)', 'EXECUTE'), 'graphic delete RPC is server-only');
SELECT ok(has_function_privilege('service_role', 'public.delete_graphic_request(uuid,uuid,boolean)', 'EXECUTE'), 'service role can delete graphics');

INSERT INTO public.users (id, wp_user_id, wp_site, email, display_name)
VALUES
  ('19000000-0000-0000-0000-000000000001', 1901, 'pl', 'artist-19@example.test', 'Artist 19'),
  ('19000000-0000-0000-0000-000000000002', 1902, 'pl', 'reviewer-19@example.test', 'Reviewer 19'),
  ('19000000-0000-0000-0000-000000000003', 1903, 'pl', 'admin-19@example.test', 'Admin 19');
INSERT INTO public.tiers (id, name, label, sort_order)
VALUES ('29000000-0000-0000-0000-000000000001', 'Graphics 19', 'Graphics 19', 19000);
INSERT INTO public.entries (id, title, site, tier_id, wp_post_id, created_by)
VALUES (
  '39000000-0000-0000-0000-000000000001', 'Graphics entry', 'pl',
  '29000000-0000-0000-0000-000000000001', 19001,
  '19000000-0000-0000-0000-000000000002'
);
INSERT INTO public.graphic_requests (id, entry_id, title, created_by)
VALUES
  ('49000000-0000-0000-0000-000000000001', '39000000-0000-0000-0000-000000000001', 'Primary graphic', '19000000-0000-0000-0000-000000000002'),
  ('49000000-0000-0000-0000-000000000002', '39000000-0000-0000-0000-000000000001', 'Replacement featured', '19000000-0000-0000-0000-000000000002'),
  ('49000000-0000-0000-0000-000000000003', '39000000-0000-0000-0000-000000000001', 'Delete versions', '19000000-0000-0000-0000-000000000002');

SELECT ok(
  public.transition_graphic_request(
    '19000000-0000-0000-0000-000000000001',
    '49000000-0000-0000-0000-000000000001',
    'claim'
  ),
  'one artist can claim a needed graphic'
);
SELECT is((SELECT graphic_status FROM public.graphic_requests WHERE id = '49000000-0000-0000-0000-000000000001'), 'claimed', 'claim advances the graphic state');
SELECT is((SELECT claimed_by FROM public.graphic_requests WHERE id = '49000000-0000-0000-0000-000000000001'), '19000000-0000-0000-0000-000000000001'::uuid, 'claim stores the exact assignee');
SELECT throws_ok(
  $$SELECT public.transition_graphic_request('19000000-0000-0000-0000-000000000003', '49000000-0000-0000-0000-000000000001', 'claim')$$,
  'P0001', 'graphic_not_claimable', 'a competing claim loses after the locked state changes'
);

SELECT is(
  (SELECT recorded_version_number FROM public.record_graphic_upload(
    '19000000-0000-0000-0000-000000000001',
    '49000000-0000-0000-0000-000000000001', false, '',
    '39000000-0000-0000-0000-000000000001/v1.png', 'v1.png', 128, 'image/png'
  )),
  1, 'first upload becomes immutable version 1'
);
SELECT is((SELECT storage_path FROM public.graphic_requests WHERE id = '49000000-0000-0000-0000-000000000001'), '39000000-0000-0000-0000-000000000001/v1.png', 'request points at version 1');
SELECT is((SELECT count(*)::integer FROM public.graphic_request_versions WHERE request_id = '49000000-0000-0000-0000-000000000001'), 1, 'version row is retained');
SELECT throws_ok(
  $$SELECT * FROM public.record_graphic_upload(
    '19000000-0000-0000-0000-000000000001',
    '49000000-0000-0000-0000-000000000001', false, '',
    '39000000-0000-0000-0000-000000000001/stale.png', 'stale.png', 128, 'image/png'
  )$$,
  'P0001', 'graphic_upload_conflict', 'stale concurrent upload cannot replace the winner'
);
SELECT is((SELECT count(*)::integer FROM public.graphic_request_versions WHERE request_id = '49000000-0000-0000-0000-000000000001'), 1, 'losing upload creates no version row');
SELECT is(
  (SELECT recorded_version_number FROM public.record_graphic_upload(
    '19000000-0000-0000-0000-000000000001',
    '49000000-0000-0000-0000-000000000001', false,
    '39000000-0000-0000-0000-000000000001/v1.png',
    '39000000-0000-0000-0000-000000000001/v2.png', 'v2.png', 256, 'image/png'
  )),
  2, 'replacement upload appends version 2'
);
SELECT is((SELECT count(*)::integer FROM public.graphic_request_versions WHERE request_id = '49000000-0000-0000-0000-000000000001'), 2, 'replacement preserves version 1');

SELECT ok(public.transition_graphic_request('19000000-0000-0000-0000-000000000002', '49000000-0000-0000-0000-000000000001', 'flag', 'Needs a clearer label'), 'reviewer can flag the current version');
SELECT is((SELECT graphic_status FROM public.graphic_requests WHERE id = '49000000-0000-0000-0000-000000000001'), 'flagged', 'flag enters review-revision state');
SELECT is((SELECT flagged_version_id FROM public.graphic_requests WHERE id = '49000000-0000-0000-0000-000000000001'), (SELECT current_version_id FROM public.graphic_requests WHERE id = '49000000-0000-0000-0000-000000000001'), 'flag pins the rejected version');
SELECT throws_ok(
  $$SELECT public.transition_graphic_request('19000000-0000-0000-0000-000000000001', '49000000-0000-0000-0000-000000000001', 'unflag')$$,
  'P0001', 'new_graphic_version_required', 'artist cannot clear review without a replacement version'
);
SELECT is(
  (SELECT recorded_version_number FROM public.record_graphic_upload(
    '19000000-0000-0000-0000-000000000001',
    '49000000-0000-0000-0000-000000000001', false,
    '39000000-0000-0000-0000-000000000001/v2.png',
    '39000000-0000-0000-0000-000000000001/v3.png', 'v3.png', 384, 'image/png'
  )),
  3, 'flagged request accepts a replacement version'
);
SELECT is((SELECT graphic_status FROM public.graphic_requests WHERE id = '49000000-0000-0000-0000-000000000001'), 'flagged', 'replacement remains flagged until explicit review completion');
SELECT ok(public.transition_graphic_request('19000000-0000-0000-0000-000000000001', '49000000-0000-0000-0000-000000000001', 'unflag'), 'artist can clear review after uploading a newer version');
SELECT is((SELECT graphic_status FROM public.graphic_requests WHERE id = '49000000-0000-0000-0000-000000000001'), 'claimed', 'successful review returns the request to submit-ready state');

CREATE TEMP TABLE first_lease AS
SELECT * FROM public.begin_graphic_submission(
  '19000000-0000-0000-0000-000000000001',
  '49000000-0000-0000-0000-000000000001', false
);
SELECT ok((SELECT lease_token IS NOT NULL FROM first_lease), 'submission acquires a durable lease');
SELECT throws_ok(
  $$SELECT * FROM public.begin_graphic_submission('19000000-0000-0000-0000-000000000001', '49000000-0000-0000-0000-000000000001', false)$$,
  'P0001', 'graphic_submission_in_progress', 'second submit cannot acquire the active lease'
);
SELECT ok(
  public.record_graphic_wp_media(
    '49000000-0000-0000-0000-000000000001',
    (SELECT lease_token FROM first_lease),
    19101
  ),
  'WordPress media ID is checkpointed under the lease'
);
SELECT is((SELECT wp_media_id FROM public.graphic_requests WHERE id = '49000000-0000-0000-0000-000000000001'), 19101, 'request stores retryable WP media ID');
SELECT is((SELECT wp_media_id FROM public.graphic_request_versions WHERE request_id = '49000000-0000-0000-0000-000000000001' AND version_number = 3), 19101, 'current immutable version stores its WP media ID');
SELECT is(
  public.complete_graphic_submission(
    '19000000-0000-0000-0000-000000000001',
    '49000000-0000-0000-0000-000000000001',
    (SELECT lease_token FROM first_lease)
  ),
  19101, 'submission completion returns the checkpointed media ID'
);
SELECT ok((SELECT graphic_status = 'submitted' AND is_featured FROM public.graphic_requests WHERE id = '49000000-0000-0000-0000-000000000001'), 'completion atomically marks submitted and featured');
SELECT ok((SELECT submission_token IS NULL AND submission_started_at IS NULL FROM public.graphic_requests WHERE id = '49000000-0000-0000-0000-000000000001'), 'completion releases the lease');
SELECT is((SELECT count(*)::integer FROM public.graphic_requests WHERE entry_id = '39000000-0000-0000-0000-000000000001' AND is_featured), 1, 'entry has exactly one featured request');

SELECT ok(public.transition_graphic_request('19000000-0000-0000-0000-000000000001', '49000000-0000-0000-0000-000000000002', 'claim'), 'artist claims replacement featured request');
SELECT is(
  (SELECT recorded_version_number FROM public.record_graphic_upload(
    '19000000-0000-0000-0000-000000000001',
    '49000000-0000-0000-0000-000000000002', false, '',
    '39000000-0000-0000-0000-000000000001/featured-2.png', 'featured-2.png', 256, 'image/png'
  )),
  1, 'replacement featured request gets version 1'
);
CREATE TEMP TABLE second_lease AS
SELECT * FROM public.begin_graphic_submission(
  '19000000-0000-0000-0000-000000000001',
  '49000000-0000-0000-0000-000000000002', false
);
SELECT ok(public.record_graphic_wp_media('49000000-0000-0000-0000-000000000002', (SELECT lease_token FROM second_lease), 19102), 'second request checkpoints its media');
SELECT is(public.complete_graphic_submission('19000000-0000-0000-0000-000000000001', '49000000-0000-0000-0000-000000000002', (SELECT lease_token FROM second_lease)), 19102, 'second request completes');
SELECT is((SELECT count(*)::integer FROM public.graphic_requests WHERE entry_id = '39000000-0000-0000-0000-000000000001' AND is_featured), 1, 'featured uniqueness survives replacement');
SELECT ok(NOT (SELECT is_featured FROM public.graphic_requests WHERE id = '49000000-0000-0000-0000-000000000001'), 'previous request is unfeatured atomically');

SELECT ok(public.transition_graphic_request('19000000-0000-0000-0000-000000000001', '49000000-0000-0000-0000-000000000003', 'claim'), 'artist claims disposable versioned request');
SELECT * FROM public.record_graphic_upload('19000000-0000-0000-0000-000000000001', '49000000-0000-0000-0000-000000000003', false, '', '39000000-0000-0000-0000-000000000001/delete-v1.png', 'delete-v1.png', 64, 'image/png');
SELECT * FROM public.record_graphic_upload('19000000-0000-0000-0000-000000000001', '49000000-0000-0000-0000-000000000003', false, '39000000-0000-0000-0000-000000000001/delete-v1.png', '39000000-0000-0000-0000-000000000001/delete-v2.png', 'delete-v2.png', 64, 'image/png');
SELECT is(
  public.delete_graphic_request('19000000-0000-0000-0000-000000000002', '49000000-0000-0000-0000-000000000003', false),
  ARRAY['39000000-0000-0000-0000-000000000001/delete-v1.png', '39000000-0000-0000-0000-000000000001/delete-v2.png']::text[],
  'delete returns every immutable storage path for cleanup'
);
SELECT is((SELECT count(*)::integer FROM public.graphic_requests WHERE id = '49000000-0000-0000-0000-000000000003'), 0, 'delete removes the request');
SELECT is((SELECT count(*)::integer FROM public.graphic_request_versions WHERE request_id = '49000000-0000-0000-0000-000000000003'), 0, 'delete cascades version metadata');
SELECT throws_ok(
  $$SELECT public.delete_graphic_request('19000000-0000-0000-0000-000000000002', '49000000-0000-0000-0000-000000000002', false)$$,
  'P0001', 'submitted_graphic_not_deletable', 'submitted featured request cannot be deleted'
);

-- Independent-session proof: worker two starts while worker one owns the row
-- lock, then must lose the submission lease after worker one commits.
DO $setup$
BEGIN
  PERFORM dblink_connect('graphic_worker_1', 'host=host.docker.internal port=54322 dbname=' || current_database() || ' user=postgres password=postgres');
  PERFORM dblink_connect('graphic_worker_2', 'host=host.docker.internal port=54322 dbname=' || current_database() || ' user=postgres password=postgres');
  PERFORM dblink_exec('graphic_worker_1', $$
    DELETE FROM public.entries WHERE id = '39000000-0000-0000-0000-000000000091';
    DELETE FROM public.tiers WHERE id = '29000000-0000-0000-0000-000000000091';
    DELETE FROM public.users WHERE id = '19000000-0000-0000-0000-000000000091';
    INSERT INTO public.users (id, wp_user_id, wp_site, email, display_name) VALUES ('19000000-0000-0000-0000-000000000091', 1991, 'pl', 'lease-race-19@example.test', 'Lease Race');
    INSERT INTO public.tiers (id, name, label, sort_order) VALUES ('29000000-0000-0000-0000-000000000091', 'Lease Race 19', 'Lease Race 19', 19091);
    INSERT INTO public.entries (id, title, site, tier_id, wp_post_id, created_by) VALUES ('39000000-0000-0000-0000-000000000091', 'Lease race', 'pl', '29000000-0000-0000-0000-000000000091', 1991, '19000000-0000-0000-0000-000000000091');
    INSERT INTO public.graphic_requests (id, entry_id, title, graphic_status, claimed_by, created_by) VALUES ('49000000-0000-0000-0000-000000000091', '39000000-0000-0000-0000-000000000091', 'Lease race', 'claimed', '19000000-0000-0000-0000-000000000091', '19000000-0000-0000-0000-000000000091')$$);
  PERFORM * FROM dblink('graphic_worker_1', $$SELECT recorded_version_id FROM public.record_graphic_upload('19000000-0000-0000-0000-000000000091', '49000000-0000-0000-0000-000000000091', false, '', '39000000-0000-0000-0000-000000000091/v1.png', 'v1.png', 64, 'image/png')$$) AS result(version_id uuid);
END;
$setup$;
SELECT ok(dblink_exec('graphic_worker_1', 'BEGIN') = 'BEGIN', 'first submit worker begins a transaction');
DO $lock$
BEGIN
  PERFORM * FROM dblink('graphic_worker_1', $$SELECT 1 FROM public.graphic_requests WHERE id = '49000000-0000-0000-0000-000000000091' FOR UPDATE$$) AS result(locked integer);
END;
$lock$;
SELECT ok(dblink_send_query('graphic_worker_2', $$SELECT lease_token FROM public.begin_graphic_submission('19000000-0000-0000-0000-000000000091', '49000000-0000-0000-0000-000000000091', false)$$) = 1, 'second submit starts while the first owns the row lock');
DO $$ BEGIN PERFORM pg_sleep(0.1); END $$;
SELECT ok((SELECT lease_token IS NOT NULL FROM dblink('graphic_worker_1', $$SELECT lease_token FROM public.begin_graphic_submission('19000000-0000-0000-0000-000000000091', '49000000-0000-0000-0000-000000000091', false)$$) AS result(lease_token uuid)), 'first submit acquires the lease');
DO $$ BEGIN PERFORM dblink_exec('graphic_worker_1', 'COMMIT'); END $$;
DO $$ BEGIN PERFORM * FROM dblink_get_result('graphic_worker_2', false) AS result(lease_token uuid); END $$;
SELECT ok(dblink_error_message('graphic_worker_2') LIKE '%graphic_submission_in_progress%', 'second submit re-checks after the lock and loses the lease');
SELECT is((SELECT count(*)::integer FROM dblink('graphic_worker_1', $$SELECT count(*)::integer FROM public.graphic_requests WHERE id = '49000000-0000-0000-0000-000000000091' AND submission_token IS NOT NULL$$) AS result(active_leases integer)), 1, 'concurrent submit attempts leave one active lease');
DO $cleanup$
BEGIN
  PERFORM dblink_exec('graphic_worker_1', $$DELETE FROM public.entries WHERE id = '39000000-0000-0000-0000-000000000091'; DELETE FROM public.tiers WHERE id = '29000000-0000-0000-0000-000000000091'; DELETE FROM public.users WHERE id = '19000000-0000-0000-0000-000000000091'$$);
  PERFORM dblink_disconnect('graphic_worker_1');
  PERFORM dblink_disconnect('graphic_worker_2');
END;
$cleanup$;

-- Independent-session proof: two different requests for one entry complete
-- without deadlocking. Worker one holds the parent-entry lock while worker two
-- starts; worker two must wait before it can lock its individual request.
DO $completion_setup$
BEGIN
  PERFORM dblink_connect('graphic_complete_1', 'host=host.docker.internal port=54322 dbname=' || current_database() || ' user=postgres password=postgres');
  PERFORM dblink_connect('graphic_complete_2', 'host=host.docker.internal port=54322 dbname=' || current_database() || ' user=postgres password=postgres');
  PERFORM dblink_exec('graphic_complete_1', $$
    DELETE FROM public.entries WHERE id = '39000000-0000-0000-0000-000000000092';
    DELETE FROM public.tiers WHERE id = '29000000-0000-0000-0000-000000000092';
    DELETE FROM public.users WHERE id = '19000000-0000-0000-0000-000000000092';
    INSERT INTO public.users (id, wp_user_id, wp_site, email, display_name) VALUES ('19000000-0000-0000-0000-000000000092', 1992, 'pl', 'complete-race-19@example.test', 'Completion Race');
    INSERT INTO public.tiers (id, name, label, sort_order) VALUES ('29000000-0000-0000-0000-000000000092', 'Completion Race 19', 'Completion Race 19', 19092);
    INSERT INTO public.entries (id, title, site, tier_id, wp_post_id, created_by) VALUES ('39000000-0000-0000-0000-000000000092', 'Completion race', 'pl', '29000000-0000-0000-0000-000000000092', 1992, '19000000-0000-0000-0000-000000000092');
    INSERT INTO public.graphic_requests (id, entry_id, title, graphic_status, claimed_by, created_by)
    VALUES
      ('49000000-0000-0000-0000-000000000092', '39000000-0000-0000-0000-000000000092', 'Completion A', 'claimed', '19000000-0000-0000-0000-000000000092', '19000000-0000-0000-0000-000000000092'),
      ('49000000-0000-0000-0000-000000000093', '39000000-0000-0000-0000-000000000092', 'Completion B', 'claimed', '19000000-0000-0000-0000-000000000092', '19000000-0000-0000-0000-000000000092');
    INSERT INTO public.graphic_request_versions (id, request_id, version_number, storage_path, file_name, file_size, mime_type, uploaded_by, wp_media_id)
    VALUES
      ('69000000-0000-0000-0000-000000000092', '49000000-0000-0000-0000-000000000092', 1, '39000000-0000-0000-0000-000000000092/a.png', 'a.png', 64, 'image/png', '19000000-0000-0000-0000-000000000092', 19921),
      ('69000000-0000-0000-0000-000000000093', '49000000-0000-0000-0000-000000000093', 1, '39000000-0000-0000-0000-000000000092/b.png', 'b.png', 64, 'image/png', '19000000-0000-0000-0000-000000000092', 19922);
    UPDATE public.graphic_requests SET
      current_version_id = CASE id
        WHEN '49000000-0000-0000-0000-000000000092' THEN '69000000-0000-0000-0000-000000000092'::uuid
        ELSE '69000000-0000-0000-0000-000000000093'::uuid END,
      storage_path = CASE id
        WHEN '49000000-0000-0000-0000-000000000092' THEN '39000000-0000-0000-0000-000000000092/a.png'
        ELSE '39000000-0000-0000-0000-000000000092/b.png' END,
      file_name = CASE id
        WHEN '49000000-0000-0000-0000-000000000092' THEN 'a.png'
        ELSE 'b.png' END,
      file_size = 64,
      mime_type = 'image/png',
      wp_media_id = CASE id
        WHEN '49000000-0000-0000-0000-000000000092' THEN 19921
        ELSE 19922 END,
      submission_token = CASE id
        WHEN '49000000-0000-0000-0000-000000000092' THEN '59000000-0000-0000-0000-000000000092'::uuid
        ELSE '59000000-0000-0000-0000-000000000093'::uuid END,
      submission_started_at = clock_timestamp()
    WHERE id IN ('49000000-0000-0000-0000-000000000092', '49000000-0000-0000-0000-000000000093')$$);
END;
$completion_setup$;
SELECT ok(dblink_exec('graphic_complete_1', 'BEGIN') = 'BEGIN', 'first completion worker begins a transaction');
DO $parent_lock$
BEGIN
  PERFORM * FROM dblink('graphic_complete_1', $$SELECT 1 FROM public.entries WHERE id = '39000000-0000-0000-0000-000000000092' FOR UPDATE$$) AS result(locked integer);
END;
$parent_lock$;
SELECT ok(dblink_send_query('graphic_complete_2', $$SELECT public.complete_graphic_submission('19000000-0000-0000-0000-000000000092', '49000000-0000-0000-0000-000000000093', '59000000-0000-0000-0000-000000000093')$$) = 1, 'second request completion starts while the parent lock is held');
DO $$ BEGIN PERFORM pg_sleep(0.1); END $$;
SELECT is(
  (SELECT media_id FROM dblink('graphic_complete_1', $$SELECT public.complete_graphic_submission('19000000-0000-0000-0000-000000000092', '49000000-0000-0000-0000-000000000092', '59000000-0000-0000-0000-000000000092')$$) AS result(media_id integer)),
  19921,
  'first request completes without waiting on the second request row'
);
SELECT ok(dblink_exec('graphic_complete_1', 'COMMIT') = 'COMMIT', 'first completion releases the parent-entry lock');
SELECT is(
  (SELECT media_id FROM dblink_get_result('graphic_complete_2') AS result(media_id integer)),
  19922,
  'second request completes after the parent-entry lock is released'
);
SELECT is(
  (SELECT featured_id FROM dblink('graphic_complete_1', $$SELECT id FROM public.graphic_requests WHERE entry_id = '39000000-0000-0000-0000-000000000092' AND is_featured$$) AS result(featured_id uuid)),
  '49000000-0000-0000-0000-000000000093'::uuid,
  'serialized completions leave the last completion as the sole featured request'
);
DO $completion_cleanup$
BEGIN
  PERFORM dblink_exec('graphic_complete_1', $$DELETE FROM public.entries WHERE id = '39000000-0000-0000-0000-000000000092'; DELETE FROM public.tiers WHERE id = '29000000-0000-0000-0000-000000000092'; DELETE FROM public.users WHERE id = '19000000-0000-0000-0000-000000000092'$$);
  PERFORM dblink_disconnect('graphic_complete_1');
  PERFORM dblink_disconnect('graphic_complete_2');
END;
$completion_cleanup$;

SELECT * FROM finish();
ROLLBACK;
