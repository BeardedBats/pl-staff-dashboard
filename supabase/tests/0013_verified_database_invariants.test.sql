BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(41);

INSERT INTO users (id, wp_user_id, wp_site, email, display_name, discord_id)
VALUES
  ('10000000-0000-0000-0000-000000000001', 101, 'pl', 'owner@example.test', 'Owner', '111111'),
  ('10000000-0000-0000-0000-000000000002', 102, 'pl', 'second@example.test', 'Second', '222222'),
  ('10000000-0000-0000-0000-000000000003', 103, 'qb', NULL, 'Placeholder', NULL);

SELECT throws_ok(
  $$INSERT INTO users (wp_user_id, wp_site, email, display_name) VALUES (104, 'pl', 'UPPER@example.test', 'Upper')$$,
  '23514', NULL, 'email must be normalized'
);
SELECT throws_ok(
  $$INSERT INTO users (wp_user_id, wp_site, email, display_name) VALUES (105, 'qb', 'owner@example.test', 'Duplicate')$$,
  '23505', NULL, 'email is globally unique'
);
SELECT throws_ok(
  $$INSERT INTO users (wp_user_id, wp_site, email, display_name) VALUES (101, 'pl', 'identity@example.test', 'Duplicate identity')$$,
  '23505', NULL, 'WordPress identity is unique per site'
);
SELECT throws_ok(
  $$UPDATE users SET discord_id = '111111' WHERE id = '10000000-0000-0000-0000-000000000002'$$,
  '23505', NULL, 'Discord identity is unique'
);
SELECT lives_ok(
  $$INSERT INTO users (wp_user_id, wp_site, email, display_name) VALUES (106, 'qb', NULL, 'Null email')$$,
  'placeholder users may have a null email'
);

INSERT INTO tiers (id, name, label, sort_order)
VALUES ('20000000-0000-0000-0000-000000000001', 'Test Tier', 'Test Tier', 9000);
INSERT INTO categories (id, site, wp_category_id, name)
VALUES ('30000000-0000-0000-0000-000000000001', 'pl', 5001, 'Shared Name');

SELECT lives_ok(
  $$INSERT INTO categories (id, site, wp_category_id, name) VALUES ('30000000-0000-0000-0000-000000000002', 'qb', 5001, 'Shared Name')$$,
  'WordPress category IDs and names may repeat across sites'
);
SELECT lives_ok(
  $$INSERT INTO categories (id, site, wp_category_id, name) VALUES ('30000000-0000-0000-0000-000000000003', 'pl', 5002, 'Shared Name')$$,
  'category display names are intentionally not unique'
);
SELECT throws_ok(
  $$INSERT INTO categories (site, wp_category_id, name) VALUES ('pl', 5001, 'Duplicate ID')$$,
  '23505', NULL, 'WordPress category identity is unique within a site'
);

INSERT INTO season_modes (id, name, is_active, auto_switch_start, auto_switch_end)
VALUES ('40000000-0000-0000-0000-000000000001', 'Test Season', false, '2026-01-01', NULL);

SELECT lives_ok(
  $$UPDATE season_modes SET auto_switch_end = NULL WHERE id = '40000000-0000-0000-0000-000000000001'$$,
  'an open-ended season window remains valid'
);
SELECT throws_ok(
  $$INSERT INTO season_modes (name, auto_switch_start, auto_switch_end) VALUES ('Backwards', '2026-12-31', '2026-01-01')$$,
  '23514', NULL, 'season start cannot follow season end'
);
SELECT throws_ok(
  $$INSERT INTO season_modes (name, is_active) VALUES ('Second Active', true)$$,
  '23505', NULL, 'at most one season is active'
);
SELECT is(
  activate_season_mode('40000000-0000-0000-0000-000000000001'),
  true,
  'atomic season activation succeeds for a real mode'
);
SELECT is(
  (SELECT count(*)::integer FROM season_modes WHERE is_active),
  1,
  'atomic activation leaves exactly one active mode'
);
SELECT is(
  activate_season_mode('40000000-0000-0000-0000-000000000099'),
  false,
  'atomic season activation rejects a missing mode'
);
SELECT ok(
  (SELECT is_active FROM season_modes WHERE id = '40000000-0000-0000-0000-000000000001'),
  'failed activation preserves the current active mode'
);

SELECT throws_ok(
  $$INSERT INTO tiers (name, label, sort_order) VALUES ('Another Tier', 'Another', 9000)$$,
  '23505', NULL, 'tier sort order is unique'
);
INSERT INTO teams (id, name, manager_id, site)
VALUES ('50000000-0000-0000-0000-000000000001', 'Test Team', '10000000-0000-0000-0000-000000000001', 'pl');
SELECT throws_ok(
  $$INSERT INTO teams (name, manager_id, site) VALUES ('test team', '10000000-0000-0000-0000-000000000001', 'pl')$$,
  '23505', NULL, 'team names are case-insensitively unique per site'
);

INSERT INTO checklist_items (id, tier_id, label, sort_order)
VALUES ('60000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'Test item', 9000);
SELECT throws_ok(
  $$INSERT INTO checklist_items (tier_id, label, sort_order) VALUES ('20000000-0000-0000-0000-000000000001', 'Other item', 9000)$$,
  '23505', NULL, 'checklist sort order is unique within a tier'
);

SELECT throws_ok(
  $$INSERT INTO recurring_templates (title_pattern, site, tier_id, category_id, season_mode_id, schedule_rule) VALUES ('Cross-site', 'qb', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '{}'::jsonb)$$,
  '23503', NULL, 'template category must belong to the same site'
);
INSERT INTO recurring_templates (
  id, title_pattern, site, tier_id, category_id, season_mode_id, schedule_rule
) VALUES (
  '70000000-0000-0000-0000-000000000001', 'Valid PL template', 'pl',
  '20000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001',
  '40000000-0000-0000-0000-000000000001', '{}'::jsonb
);

INSERT INTO entries (
  id, title, site, tier_id, category_id, wp_post_id, created_by
) VALUES (
  '80000000-0000-0000-0000-000000000001', 'First entry', 'pl',
  '20000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000001', 7001,
  '10000000-0000-0000-0000-000000000001'
);
INSERT INTO entries (
  id, title, site, tier_id, category_id, created_by
) VALUES (
  '80000000-0000-0000-0000-000000000002', 'Second entry', 'qb',
  '20000000-0000-0000-0000-000000000001',
  '30000000-0000-0000-0000-000000000002',
  '10000000-0000-0000-0000-000000000002'
);

SELECT throws_ok(
  $$INSERT INTO entries (title, site, tier_id, category_id, created_by) VALUES ('Cross category', 'qb', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001')$$,
  '23503', NULL, 'entry category must belong to the same site'
);
SELECT throws_ok(
  $$INSERT INTO entries (title, site, tier_id, category_id, series_id, created_by) VALUES ('Cross series', 'qb', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001')$$,
  '23503', NULL, 'entry series must belong to the same site'
);
SELECT throws_ok(
  $$INSERT INTO entries (title, site, tier_id, wp_post_id, created_by) VALUES ('Duplicate post', 'pl', '20000000-0000-0000-0000-000000000001', 7001, '10000000-0000-0000-0000-000000000001')$$,
  '23505', NULL, 'WordPress post identity is unique within a site'
);
SELECT throws_ok(
  $$UPDATE entries SET word_count = -1 WHERE id = '80000000-0000-0000-0000-000000000001'$$,
  '23514', NULL, 'entry word count cannot be negative'
);

INSERT INTO sessions (id, user_id, token_hash, refresh_token_hash, expires_at)
VALUES (
  '90000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001', 'token-a', 'refresh-a', now() + interval '1 day'
);
SELECT throws_ok(
  $$INSERT INTO sessions (user_id, token_hash, refresh_token_hash, expires_at) VALUES ('10000000-0000-0000-0000-000000000002', 'token-a', 'refresh-b', now() + interval '1 day')$$,
  '23505', NULL, 'access-token hashes are unique'
);
SELECT throws_ok(
  $$INSERT INTO sessions (user_id, token_hash, refresh_token_hash, expires_at) VALUES ('10000000-0000-0000-0000-000000000002', 'token-b', 'refresh-a', now() + interval '1 day')$$,
  '23505', NULL, 'refresh-token hashes are unique'
);

INSERT INTO entry_authors (entry_id, user_id, role)
VALUES ('80000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'primary');
SELECT throws_ok(
  $$INSERT INTO entry_authors (entry_id, user_id, role) VALUES ('80000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'primary')$$,
  '23505', NULL, 'an entry has at most one primary author'
);
SELECT lives_ok(
  $$INSERT INTO entry_authors (entry_id, user_id, role) VALUES ('80000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'co_author')$$,
  'co-authors remain supported'
);

INSERT INTO entry_editors (entry_id, user_id)
VALUES ('80000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001');
SELECT throws_ok(
  $$INSERT INTO entry_editors (entry_id, user_id) VALUES ('80000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002')$$,
  '23505', NULL, 'an entry has at most one editor'
);

INSERT INTO claims (entry_id, user_id, role_type)
VALUES ('80000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'writer');
SELECT throws_ok(
  $$INSERT INTO claims (entry_id, user_id, role_type) VALUES ('80000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'writer')$$,
  '23505', NULL, 'duplicate pending claims are rejected'
);
SELECT throws_ok(
  $$INSERT INTO claims (entry_id, user_id, role_type, status) VALUES ('80000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'writer', 'approved')$$,
  '23514', NULL, 'resolved claims require resolver metadata'
);

INSERT INTO archive_requests (entry_id, requested_by, reason)
VALUES ('80000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Test');
SELECT throws_ok(
  $$INSERT INTO archive_requests (entry_id, requested_by, reason) VALUES ('80000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'Again')$$,
  '23505', NULL, 'an entry has at most one pending archive request'
);
SELECT throws_ok(
  $$INSERT INTO archive_requests (entry_id, requested_by, reason, status) VALUES ('80000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Resolved badly', 'denied')$$,
  '23514', NULL, 'resolved archive requests require resolver metadata'
);

SELECT throws_ok(
  $$INSERT INTO entry_checklist (entry_id, checklist_item_id, is_completed) VALUES ('80000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', true)$$,
  '23514', NULL, 'completed checklist rows require completion metadata'
);

INSERT INTO saved_table_views (user_id, name, is_default)
VALUES ('10000000-0000-0000-0000-000000000001', 'My View', true);
SELECT throws_ok(
  $$INSERT INTO saved_table_views (user_id, name) VALUES ('10000000-0000-0000-0000-000000000001', 'my view')$$,
  '23505', NULL, 'saved-view names are case-insensitively unique per user'
);
SELECT throws_ok(
  $$INSERT INTO saved_table_views (user_id, name, is_default) VALUES ('10000000-0000-0000-0000-000000000001', 'Another View', true)$$,
  '23505', NULL, 'a user has at most one default saved view'
);

SELECT throws_ok(
  $$INSERT INTO notification_preferences (user_id, event_type) VALUES ('10000000-0000-0000-0000-000000000001', 'made_up_event')$$,
  '23514', NULL, 'notification preferences only accept canonical events'
);
SELECT throws_ok(
  $$INSERT INTO article_analytics (entry_id, date, pageviews) VALUES ('80000000-0000-0000-0000-000000000001', '2026-01-01', -1)$$,
  '23514', NULL, 'analytics metrics cannot be negative'
);
SELECT throws_ok(
  $$INSERT INTO raptive_revenue (date, page_url, sessions) VALUES ('2026-01-01', 'https://example.test/a', -1)$$,
  '23514', NULL, 'Raptive traffic counts cannot be negative'
);
SELECT throws_ok(
  $$INSERT INTO raptive_uploads (uploaded_by, file_name, date_range_start, date_range_end) VALUES ('10000000-0000-0000-0000-000000000001', 'bad.csv', '2026-02-01', '2026-01-01')$$,
  '23514', NULL, 'Raptive upload date ranges must be ordered'
);
SELECT throws_ok(
  $$INSERT INTO file_attachments (entry_id, uploaded_by, file_url, file_name, file_size, mime_type) VALUES ('80000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'https://example.test/file', 'file.txt', -1, 'text/plain')$$,
  '23514', NULL, 'attachment size cannot be negative'
);

INSERT INTO comments (id, entry_id, user_id, body)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  '80000000-0000-0000-0000-000000000001',
  '10000000-0000-0000-0000-000000000001', 'Parent'
);
SELECT throws_ok(
  $$INSERT INTO comments (entry_id, user_id, body, parent_id) VALUES ('80000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Wrong entry', 'a0000000-0000-0000-0000-000000000001')$$,
  '23503', NULL, 'comment replies must share their parent entry'
);

SELECT * FROM finish();
ROLLBACK;
