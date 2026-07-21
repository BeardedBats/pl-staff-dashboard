# Deployment

Production is deployed by Vercel from the GitHub production branch. Database
changes and application deployment are separate systems; a green Vercel build
does not prove the production database has the required schema.

## Preconditions

- The exact release PR(s), commit order, database migration range, and last
  known-good production deployment are recorded.
- The [Migration and rollback](./MIGRATION_AND_ROLLBACK.md) preflight is green.
- All required migrations are already applied to production before application
  code that depends on them is merged/promoted.
- All GitHub Application, Database, Dependencies, Browser, and Vercel checks are
  green on the exact head.
- Production environment key names match `.env.example`; changed values have
  been deployed in a new build because Vercel env changes do not alter existing
  deployments.

## Procedure

1. Run `npm run ops:preflight:production -- --require-release-access` and attach
   the sanitized report.
2. Apply and verify database migrations using the migration runbook.
3. Merge stacked PRs in dependency order. Do not merge a child before its base.
4. Watch the production Vercel deployment to completion and record its URL,
   deployment ID, commit, build log, and environment.
5. Verify public fail-closed behavior:

```powershell
curl.exe -sS -o NUL -w "%{http_code}" https://pl-staff-dashboard.vercel.app/login
curl.exe -sS -o NUL -w "%{http_code}" https://pl-staff-dashboard.vercel.app/api/auth/me
```

Expected: login `200`, anonymous current-user API `401`.

6. With a dedicated non-production-content test session, verify role navigation,
   the authorized health view, one read-only entry/detail path, and no browser
   error overlay. Do not use a personal production account for automation.
7. In **Settings > Sync > System health**, refresh and explain every warning or
   critical state. Verify cron freshness after each job's next schedule window.
8. Inspect structured logs without expanding or copying secret-bearing request
   payloads:

```text
vercel logs --environment production --status-code 5xx --since 30m
```

## Application rollback

For an application-only regression with a compatible database:

```text
vercel list --prod
vercel inspect BAD_DEPLOYMENT_URL
vercel rollback LAST_KNOWN_GOOD_DEPLOYMENT_URL
vercel rollback status
vercel logs --environment production --status-code 5xx --since 5m
```

Vercel rollback changes routing without rebuilding. It also reverts the bundled
cron configuration and uses the old deployment's environment snapshot. After a
rollback, automatic production-domain assignment is pinned. Promote a verified
fixed deployment to resume normal behavior:

```text
vercel promote FIXED_DEPLOYMENT_URL
vercel promote status
```

Do not use application rollback for a database-corruption incident; follow the
migration/restore decision tree first.

## Stop conditions

- Vercel CLI/dashboard authority is unavailable or the project is not clearly
  `pl-staff-dashboard` under the intended team.
- Production migrations are behind the application release.
- Any exact-head CI check, Vercel build, backup, or smoke check is red.
- The proposed rollback bundle is not compatible with the current schema/env.
- A test would create, change, or publish real editorial content without an
  approved disposable fixture and cleanup plan.

## Verification

- Production URL resolves to the intended deployment and commit.
- Login/current-user boundaries return 200/401 as expected.
- Authorized health refresh returns 200; cron and integration states are
  explainable; logs show no new error spike.
- The graphics bucket remains private and signed reads still work.
- Synthetic fixtures, if any, are deleted and cleanup is independently checked.

## Evidence to retain

- GitHub PR/merge SHA, Actions run, Vercel deployment URL/ID, environment, and
  UTC deployment time.
- Database migration list, backup evidence, smoke results, health snapshot, and
  sanitized error-code counts.
- Rollback/promote commands and status if used.

References: [Vercel deployments](https://vercel.com/docs/deployments/overview),
[production rollback](https://vercel.com/docs/deployments/rollback-production-deployment),
and [Instant Rollback behavior](https://vercel.com/docs/instant-rollback).
