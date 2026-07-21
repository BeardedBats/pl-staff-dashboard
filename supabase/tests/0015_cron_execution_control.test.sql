BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SET search_path = public, extensions;

SELECT plan(22);

SELECT ok(NOT has_table_privilege('anon', 'public.cron_runs', 'SELECT'), 'anon cannot read cron runs');
SELECT ok(NOT has_table_privilege('authenticated', 'public.cron_runs', 'SELECT'), 'authenticated cannot read cron runs');
SELECT ok(has_table_privilege('service_role', 'public.cron_runs', 'SELECT'), 'service role can read cron runs');
SELECT ok(NOT has_function_privilege('anon', 'public.claim_cron_run(text,text,text,integer)', 'EXECUTE'), 'anon cannot claim cron runs');
SELECT ok(NOT has_function_privilege('authenticated', 'public.finish_cron_run(uuid,boolean,jsonb,text)', 'EXECUTE'), 'authenticated cannot finish cron runs');
SELECT ok(has_function_privilege('service_role', 'public.claim_cron_run(text,text,text,integer)', 'EXECUTE'), 'service role can claim cron runs');

CREATE TEMP TABLE first_claim AS
SELECT * FROM claim_cron_run('test-job', 'window-1', 'vercel', 900);

SELECT is((SELECT claim_status FROM first_claim), 'claimed', 'first window claim succeeds');
SELECT is((SELECT attempt FROM first_claim), 1, 'first claim starts at attempt one');
SELECT is((SELECT claim_status FROM claim_cron_run('test-job', 'window-1', 'vercel', 900)), 'overlap', 'active duplicate cannot overlap');
SELECT is((SELECT claim_status FROM claim_cron_run('test-job', 'window-2', 'vercel', 900)), 'overlap', 'different window cannot overlap active job');
SELECT ok(finish_cron_run((SELECT run_id FROM first_claim), true, '{"changed":2}', NULL), 'active run can finish successfully');
SELECT is((SELECT claim_status FROM claim_cron_run('test-job', 'window-1', 'vercel', 900)), 'duplicate', 'successful window is idempotent');
SELECT ok(NOT finish_cron_run((SELECT run_id FROM first_claim), true, NULL, NULL), 'finished run cannot finish twice');

CREATE TEMP TABLE failed_claim AS
SELECT * FROM claim_cron_run('retry-job', 'window-1', 'vercel', 900);
SELECT ok(finish_cron_run((SELECT run_id FROM failed_claim), false, NULL, 'http_500'), 'failed attempt is recorded');
SELECT is((SELECT attempt FROM claim_cron_run('retry-job', 'window-1', 'vercel', 900)), 2, 'failed window can retry once');
SELECT ok(finish_cron_run((SELECT id FROM cron_runs WHERE job_name = 'retry-job'), false, NULL, 'http_500'), 'second failure is recorded');
SELECT is((SELECT attempt FROM claim_cron_run('retry-job', 'window-1', 'vercel', 900)), 3, 'failed window can retry a third time');
SELECT ok(finish_cron_run((SELECT id FROM cron_runs WHERE job_name = 'retry-job'), false, NULL, 'http_500'), 'third failure is recorded');
SELECT is((SELECT claim_status FROM claim_cron_run('retry-job', 'window-1', 'vercel', 900)), 'exhausted', 'fourth attempt is refused');

CREATE TEMP TABLE expired_claim AS
SELECT * FROM claim_cron_run('expired-job', 'window-1', 'vercel', 30);
UPDATE cron_runs SET lease_expires_at = now() - interval '1 second' WHERE job_name = 'expired-job';
SELECT is((SELECT attempt FROM claim_cron_run('expired-job', 'window-1', 'vercel', 30)), 2, 'expired lease is recoverable');

SELECT throws_ok($$SELECT * FROM claim_cron_run('BAD JOB', 'key', 'vercel', 900)$$, '22023', NULL, 'invalid job name is rejected');
SELECT throws_ok($$SELECT * FROM claim_cron_run('valid-job', '', 'vercel', 900)$$, '22023', NULL, 'empty run key is rejected');

SELECT * FROM finish();
ROLLBACK;
