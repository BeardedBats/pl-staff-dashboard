-- The dashboard supports durable in-app notifications only. The removed
-- Discord/email paths were stubs that returned success without delivery,
-- which allowed misleading sent flags and settings with no working adapter.

ALTER TABLE public.notification_preferences
  DROP COLUMN IF EXISTS discord_enabled,
  DROP COLUMN IF EXISTS email_enabled;

ALTER TABLE public.notifications
  DROP COLUMN IF EXISTS discord_sent,
  DROP COLUMN IF EXISTS email_sent;

ALTER TABLE public.users
  DROP COLUMN IF EXISTS discord_id;
