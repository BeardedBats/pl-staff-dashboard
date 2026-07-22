BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT no_plan();

SELECT has_table('public', 'wordpress_sync_events', 'WordPress attempts are durable');
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.wordpress_sync_events', 'SELECT'),
  'authenticated clients cannot read integration attempts'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.begin_wordpress_sync_event(text,integer,text,text)', 'EXECUTE'),
  'authenticated clients cannot begin integration attempts'
);

SELECT * FROM public.begin_wordpress_sync_event('pl', 2601, 'event-2601', 'webhook');
SELECT is(
  (SELECT attempt_count FROM public.wordpress_sync_events WHERE event_key = 'event-2601'),
  1,
  'first delivery starts attempt one'
);
SELECT ok(
  public.finish_wordpress_sync_event(
    (SELECT id FROM public.wordpress_sync_events WHERE event_key = 'event-2601'),
    false,
    'temporary upstream failure'
  ),
  'failed delivery finishes atomically'
);

SELECT * FROM public.begin_wordpress_sync_event('pl', 2601, 'event-2601', 'webhook');
SELECT is(
  (SELECT attempt_count FROM public.wordpress_sync_events WHERE event_key = 'event-2601'),
  2,
  'the same failed event retries without duplicating its row'
);
SELECT ok(
  public.finish_wordpress_sync_event(
    (SELECT id FROM public.wordpress_sync_events WHERE event_key = 'event-2601'),
    true,
    NULL
  ),
  'successful retry finishes atomically'
);
SELECT is(
  (SELECT count(*)::integer FROM public.wordpress_sync_events WHERE event_key = 'event-2601'),
  1,
  'idempotency key remains unique'
);

SELECT throws_ok(
  $$INSERT INTO public.wordpress_sync_events(site, wp_post_id, event_key, source)
    VALUES ('pl', 0, 'bad-post', 'webhook')$$,
  '23514',
  NULL,
  'invalid WordPress IDs are rejected'
);
SELECT throws_ok(
  $$INSERT INTO public.wordpress_sync_events(site, wp_post_id, event_key, source)
    VALUES ('pl', 2602, 'bad key', 'webhook')$$,
  '23514',
  NULL,
  'unsafe event keys are rejected'
);

SELECT * FROM finish();
ROLLBACK;
