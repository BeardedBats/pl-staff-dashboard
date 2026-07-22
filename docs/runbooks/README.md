# Operations runbooks

These are the production operating procedures for the Pitcher List Staff
Content Dashboard. They are deliberately repository-specific.

| System | Production identifier |
| --- | --- |
| Application | `https://pl-staff-dashboard.vercel.app` |
| GitHub | `BeardedBats/pl-staff-dashboard` |
| Supabase project | `ovnwmayhbmbdzbxrfrul` |
| Supabase region | `us-east-1` |
| Storage bucket | `graphics` (private) |

Use the runbooks in this order for a planned release:

1. [Backup and restore](./BACKUP_AND_RESTORE.md)
2. [Migration and rollback](./MIGRATION_AND_ROLLBACK.md)
3. [Deployment](./DEPLOYMENT.md)

For unplanned work, start with [Incident response](./INCIDENT_RESPONSE.md).
Use [Secret rotation](./SECRET_ROTATION.md) for planned rotation or suspected
credential exposure.

## Preconditions

- Work from the repository root on the exact release commit.
- Use an encrypted, access-controlled workstation and backup destination.
- Keep secret values out of terminals, command history, screenshots, tickets,
  chat, and Git. Record key names and provider IDs only.
- Assign one incident/release lead and one verifier. Only one person applies a
  database migration or production routing change at a time.
- Run `npm run ops:preflight:production` before any production change. Add
  `-- --require-release-access` when the release operator expects all required
  Supabase and Vercel CLI authority to be present.

## Stop conditions

- The branch/commit, target project, or production deployment is ambiguous.
- A completed pre-change database backup and a separate Storage export cannot
  be proven.
- The migration dry run differs from the reviewed migration set.
- A required credential is unavailable, expired, or broader than intended.
- The rollback target has not been identified and checked for schema
  compatibility.
- Any command would reveal a secret or overwrite the only recovery copy.

## Verification

Run `npm run ops:verify-runbooks`. It enforces runbook presence, required
sections, the environment-key inventory, current migration head, and core
recovery commands. The CI Application job runs the same contract.

## Evidence to retain

- UTC start/end time, release or incident lead, and verifier.
- Git commit, PR, GitHub Actions run, Vercel deployment ID/URL, and Supabase
  project ref.
- Backup timestamp plus hashes/manifests; never the backed-up data itself in a
  ticket.
- Commands executed, sanitized results, decision points, smoke results, and
  any follow-up owner/date.

Official references: [Supabase backups](https://supabase.com/docs/guides/platform/backups),
[Supabase migrations](https://supabase.com/docs/guides/deployment/database-migrations),
[Vercel rollback](https://vercel.com/docs/deployments/rollback-production-deployment),
and [Vercel secret rotation](https://vercel.com/docs/environment-variables/rotating-secrets).
