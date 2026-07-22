BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT no_plan();

SELECT has_column('public', 'users', 'notification_delivery_mode', 'users store notification delivery mode');
SELECT has_column('public', 'users', 'notification_digest_time', 'users store local digest time');
SELECT has_column('public', 'users', 'notification_quiet_start', 'users store quiet-hours start');
SELECT has_column('public', 'users', 'notification_quiet_end', 'users store quiet-hours end');
SELECT has_column('public', 'notifications', 'available_at', 'notifications store their visibility time');
SELECT has_column('public', 'notifications', 'delivery_attempts', 'notifications store bounded delivery attempts');
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.replace_notification_preferences(uuid,jsonb,text,time,time,time)', 'EXECUTE'),
  'authenticated clients cannot replace preferences directly'
);
SELECT ok(
  has_function_privilege('service_role', 'public.replace_notification_preferences(uuid,jsonb,text,time,time,time)', 'EXECUTE'),
  'the server can replace preferences atomically'
);

INSERT INTO public.users (
  id, wp_user_id, wp_site, email, display_name, timezone
) VALUES (
  '25000000-0000-0000-0000-000000000001',
  2501,
  'pl',
  'delivery-25@example.test',
  'Delivery 25',
  'America/New_York'
);

SELECT ok(
  public.replace_notification_preferences(
    '25000000-0000-0000-0000-000000000001',
    '[{"event_type":"mention","in_app_enabled":true}]'::jsonb,
    'daily_digest',
    '09:30'::time,
    '22:00'::time,
    '07:00'::time
  ),
  'delivery settings and event preferences save together'
);
SELECT is(
  (SELECT notification_delivery_mode FROM public.users WHERE id = '25000000-0000-0000-0000-000000000001'),
  'daily_digest',
  'daily delivery mode is stored'
);
SELECT is(
  (SELECT notification_digest_time::text FROM public.users WHERE id = '25000000-0000-0000-0000-000000000001'),
  '09:30:00',
  'digest time is stored without converting the staff local time'
);
SELECT ok(
  (SELECT in_app_enabled FROM public.notification_preferences WHERE user_id = '25000000-0000-0000-0000-000000000001' AND event_type = 'mention'),
  'the event preference is stored in the same transaction'
);

SELECT throws_ok(
  $$SELECT public.replace_notification_preferences(
    '25000000-0000-0000-0000-000000000001',
    '[{"event_type":"unsupported_event","in_app_enabled":true}]'::jsonb,
    'immediate',
    '08:00'::time,
    NULL,
    NULL
  )$$,
  '23514',
  NULL,
  'one invalid event rejects the entire replacement'
);
SELECT is(
  (SELECT notification_delivery_mode FROM public.users WHERE id = '25000000-0000-0000-0000-000000000001'),
  'daily_digest',
  'a rejected replacement rolls back the delivery-setting update'
);
SELECT is(
  (SELECT count(*)::integer FROM public.notification_preferences WHERE user_id = '25000000-0000-0000-0000-000000000001'),
  1,
  'a rejected replacement preserves the prior preference set'
);

SELECT throws_ok(
  $$UPDATE public.users
    SET notification_quiet_start = '22:00'::time,
        notification_quiet_end = NULL
    WHERE id = '25000000-0000-0000-0000-000000000001'$$,
  '23514',
  NULL,
  'quiet hours cannot be stored as an incomplete pair'
);
SELECT throws_ok(
  $$INSERT INTO public.notifications (
    user_id, type, title, delivery_attempts
  ) VALUES (
    '25000000-0000-0000-0000-000000000001',
    'mention',
    'Invalid attempts',
    4
  )$$,
  '23514',
  NULL,
  'delivery attempts cannot exceed the bounded retry count'
);

SELECT * FROM finish();
ROLLBACK;
