BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT no_plan();

SELECT has_column('public', 'graphic_requests', 'requirements', 'graphic requests store a structured brief');
SELECT has_column('public', 'graphic_requests', 'review_submitted_at', 'graphic requests store review submission time');
SELECT has_column('public', 'graphic_requests', 'approved_at', 'graphic requests store approval time');
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.submit_graphic_for_review(uuid,uuid)', 'EXECUTE'),
  'authenticated clients cannot call the review transition directly'
);
SELECT ok(
  has_function_privilege('service_role', 'public.submit_graphic_for_review(uuid,uuid)', 'EXECUTE'),
  'the server can call the review transition'
);

INSERT INTO public.users (id, wp_user_id, wp_site, email, display_name)
VALUES
  ('24000000-0000-0000-0000-000000000001', 2401, 'pl', 'artist-24@example.test', 'Artist 24'),
  ('24000000-0000-0000-0000-000000000002', 2402, 'pl', 'reviewer-24@example.test', 'Reviewer 24');
INSERT INTO public.tiers (id, name, label, sort_order)
VALUES ('34000000-0000-0000-0000-000000000001', 'Graphics 24', 'Graphics 24', 24000);
INSERT INTO public.entries (id, title, site, tier_id, wp_post_id, created_by)
VALUES (
  '44000000-0000-0000-0000-000000000001', 'Graphics review entry', 'pl',
  '34000000-0000-0000-0000-000000000001', 24001,
  '24000000-0000-0000-0000-000000000002'
);

SELECT throws_ok(
  $$INSERT INTO public.graphic_requests (
    id, entry_id, title, created_by, requirements
  ) VALUES (
    '54000000-0000-0000-0000-000000000099',
    '44000000-0000-0000-0000-000000000001',
    'Malformed brief',
    '24000000-0000-0000-0000-000000000002',
    '{"asset_type":"featured"}'::jsonb
  )$$,
  '23514',
  NULL,
  'the database rejects incomplete graphic requirements'
);

INSERT INTO public.graphic_requests (
  id, entry_id, title, graphic_status, claimed_by, created_by, requirements
) VALUES (
  '54000000-0000-0000-0000-000000000001',
  '44000000-0000-0000-0000-000000000001',
  'Reviewable featured image',
  'claimed',
  '24000000-0000-0000-0000-000000000001',
  '24000000-0000-0000-0000-000000000002',
  '{"asset_type":"featured","placement":"Article header","width":1200,"height":675,"format":"webp","alt_text":"Pitcher on the mound"}'::jsonb
);
INSERT INTO public.graphic_request_versions (
  id, request_id, version_number, storage_path, file_name, file_size, mime_type, uploaded_by
) VALUES (
  '64000000-0000-0000-0000-000000000001',
  '54000000-0000-0000-0000-000000000001',
  1,
  '44000000-0000-0000-0000-000000000001/v1.webp',
  'v1.webp',
  128,
  'image/webp',
  '24000000-0000-0000-0000-000000000001'
);
UPDATE public.graphic_requests
SET current_version_id = '64000000-0000-0000-0000-000000000001',
    storage_path = '44000000-0000-0000-0000-000000000001/v1.webp',
    file_name = 'v1.webp',
    file_size = 128,
    mime_type = 'image/webp'
WHERE id = '54000000-0000-0000-0000-000000000001';

SELECT throws_ok(
  $$SELECT public.submit_graphic_for_review(
    '24000000-0000-0000-0000-000000000002',
    '54000000-0000-0000-0000-000000000001'
  )$$,
  'P0001',
  'graphic_not_ready_for_review',
  'a different actor cannot submit the assigned worker version'
);
SELECT throws_ok(
  $$SELECT * FROM public.begin_graphic_submission(
    '24000000-0000-0000-0000-000000000002',
    '54000000-0000-0000-0000-000000000001',
    true
  )$$,
  'P0001',
  'graphic_review_required',
  'approval cannot acquire a WordPress lease before review submission'
);
SELECT ok(
  public.submit_graphic_for_review(
    '24000000-0000-0000-0000-000000000001',
    '54000000-0000-0000-0000-000000000001'
  ),
  'the assigned worker submits the current version for review'
);
SELECT ok(
  (SELECT review_submitted_at IS NOT NULL FROM public.graphic_requests WHERE id = '54000000-0000-0000-0000-000000000001'),
  'review submission is stored durably'
);

CREATE TEMP TABLE review_lease AS
SELECT * FROM public.begin_graphic_submission(
  '24000000-0000-0000-0000-000000000002',
  '54000000-0000-0000-0000-000000000001',
  true
);
SELECT ok((SELECT lease_token IS NOT NULL FROM review_lease), 'a reviewed version can acquire the approval lease');
SELECT ok(
  public.release_graphic_submission(
    '54000000-0000-0000-0000-000000000001',
    (SELECT lease_token FROM review_lease)
  ),
  'a failed external approval can release its lease safely'
);

INSERT INTO public.graphic_request_versions (
  id, request_id, version_number, storage_path, file_name, file_size, mime_type, uploaded_by
) VALUES (
  '64000000-0000-0000-0000-000000000002',
  '54000000-0000-0000-0000-000000000001',
  2,
  '44000000-0000-0000-0000-000000000001/v2.webp',
  'v2.webp',
  256,
  'image/webp',
  '24000000-0000-0000-0000-000000000001'
);
UPDATE public.graphic_requests
SET current_version_id = '64000000-0000-0000-0000-000000000002',
    storage_path = '44000000-0000-0000-0000-000000000001/v2.webp',
    file_name = 'v2.webp',
    file_size = 256
WHERE id = '54000000-0000-0000-0000-000000000001';
SELECT ok(
  (SELECT review_submitted_at IS NULL FROM public.graphic_requests WHERE id = '54000000-0000-0000-0000-000000000001'),
  'uploading a new immutable version clears the prior review submission'
);

SELECT ok(
  public.submit_graphic_for_review(
    '24000000-0000-0000-0000-000000000001',
    '54000000-0000-0000-0000-000000000001'
  ),
  'the worker resubmits the replacement version'
);
CREATE TEMP TABLE approval_lease AS
SELECT * FROM public.begin_graphic_submission(
  '24000000-0000-0000-0000-000000000002',
  '54000000-0000-0000-0000-000000000001',
  true
);
SELECT ok(
  public.record_graphic_wp_media(
    '54000000-0000-0000-0000-000000000001',
    (SELECT lease_token FROM approval_lease),
    24002
  ),
  'approved media is checkpointed before completion'
);
SELECT is(
  public.complete_graphic_submission(
    '24000000-0000-0000-0000-000000000002',
    '54000000-0000-0000-0000-000000000001',
    (SELECT lease_token FROM approval_lease)
  ),
  24002,
  'approval completes against the reviewed replacement version'
);
SELECT ok(
  (
    SELECT graphic_status = 'submitted'
      AND is_featured
      AND approved_at IS NOT NULL
    FROM public.graphic_requests
    WHERE id = '54000000-0000-0000-0000-000000000001'
  ),
  'completion atomically records approved and featured state'
);

SELECT * FROM finish();
ROLLBACK;
