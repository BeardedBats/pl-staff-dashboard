BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(5);

SELECT hasnt_column('public', 'users', 'discord_id', 'users have no unsupported Discord identifier');
SELECT hasnt_column('public', 'notification_preferences', 'discord_enabled', 'preferences expose no Discord channel');
SELECT hasnt_column('public', 'notification_preferences', 'email_enabled', 'preferences expose no email channel');
SELECT hasnt_column('public', 'notifications', 'discord_sent', 'notifications cannot claim a Discord delivery');
SELECT hasnt_column('public', 'notifications', 'email_sent', 'notifications cannot claim an email delivery');

SELECT * FROM finish();
ROLLBACK;
