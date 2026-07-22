# Migration and rollback

The committed database history is contiguous from
`0001_initial_schema.sql` through `0022_operational_observability.sql`. The
current application stack depends on migrations `0013`–`0022`; apply those
migrations before merging or promoting their application code.

Database migrations are forward-only release records. Do not edit an applied
file and do not improvise a destructive reverse script during an incident.

## Preconditions

- [Backup and restore](./BACKUP_AND_RESTORE.md) is complete after the write
  freeze, including the separate `graphics` export.
- Every stacked PR through the release head is merge-clean and all CI jobs pass.
- `npm run ops:preflight:production -- --require-release-access` passes for the
  release operator.
- One operator owns the database push; a second person verifies project ref,
  migration list, dry-run output, backup evidence, and rollback target.
- The last known-good Vercel deployment URL and Git commit are recorded.

## Apply procedure

First prove the source stack locally:

```powershell
npm ci
npm run lint
npm run typecheck
npm run test:coverage
npm run build
npm run test:database
npm run db:types:check
npm run db:lint
npm run test:browser
```

Confirm and link the production project, then compare history:

```powershell
npx supabase link --project-ref ovnwmayhbmbdzbxrfrul
npx supabase migration list --linked
npx supabase db push --dry-run --linked
```

The dry run must list only reviewed, committed files and must end at
`0022_operational_observability.sql`. Apply once:

```powershell
npx supabase db push --linked
npx supabase migration list --linked
```

Do not run `supabase migration repair` merely to make output green. It changes
only migration-history records; it does not apply or reverse SQL. If history
and schema disagree, stop, inspect both, and use one of these only after proving
the actual schema state:

```text
npx supabase migration repair --linked --status applied VERSION
npx supabase migration repair --linked --status reverted VERSION
```

## Rollback decision tree

1. **Application-only regression, schema still compatible:** use
   `vercel rollback LAST_KNOWN_GOOD_DEPLOYMENT`, verify, and keep production
   pinned until `vercel promote FIXED_DEPLOYMENT` restores normal assignment.
2. **Schema defect without data corruption:** keep the safest compatible app
   deployed and ship a new forward migration. Never modify the applied file.
3. **Security boundary defect:** contain access first and ship a forward repair.
   Never “rollback” `graphics` to public or re-grant anon/authenticated access.
4. **Data corruption or destructive migration:** freeze writes, preserve logs,
   choose a recovery point before the first bad write, and follow
   [Backup and restore](./BACKUP_AND_RESTORE.md). A same-project physical restore
   is a downtime/data-loss decision and requires explicit incident-lead approval.
5. **Unknown compatibility:** do not roll the app back blindly. The old bundle
   may expect pre-migration grants/functions while the database is already new.
   Restore to a new project or create a forward compatibility migration first.

## Stop conditions

- Production DB access is absent. Management access that only lists backups is
  not migration authority.
- Local/remote migration histories diverge, the dry run includes an unexpected
  file, or a reviewed migration is absent.
- The backup is not current enough or Storage was not exported.
- More than one operator is applying migrations.
- Any migration errors or times out. Preserve the exact sanitized error and
  inspect transaction state before retrying.

## Verification

- `supabase migration list --linked` shows every committed migration once.
- Read-only schema checks confirm new tables/functions/grants and forced RLS.
- Anon/authenticated probes remain denied for server-only tables.
- The both-site Admin+ health endpoint loads, all integration probes are
  explainable, and no new critical alert appears.
- Continue to the [Deployment](./DEPLOYMENT.md) gate; do not reopen release
  merges solely because `db push` exited zero.

## Evidence to retain

- Backup evidence, Git SHA, migration-list before/after, and full dry-run file
  list.
- Operator/verifier, UTC start/end, CLI version, applied versions, and sanitized
  output.
- Post-migration schema/grant checks and the chosen rollback decision.

Reference: [Supabase Database Migrations](https://supabase.com/docs/guides/deployment/database-migrations).
