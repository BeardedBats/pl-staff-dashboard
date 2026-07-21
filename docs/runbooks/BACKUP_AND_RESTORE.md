# Backup and restore

Supabase physical backups cover the database, not Storage objects. The
`graphics` bucket therefore needs a separate export. A backup is not release
evidence until both parts are verified.

Snapshot observed on 2026-07-21: the production project reported eight
completed daily physical backups, the latest at `2026-07-21T04:06:20.088Z`,
and `pitr_enabled: false`. This is historical evidence only; always refresh it.

## Preconditions

- Production project ref is `ovnwmayhbmbdzbxrfrul`.
- `npx supabase --version` is 2.109.1 or a reviewed newer version.
- The operator can run `supabase backups list` and has either a linked project
  plus database password or a percent-encoded `SUPABASE_DB_URL` for logical
  dumps.
- The destination is encrypted, access-controlled, outside the repository,
  empty, and has enough free space.
- Writes are frozen for the final pre-migration logical/Storage snapshot, or
  the release record explicitly accepts the time gap from the last physical
  backup.

## Procedure

From PowerShell, create a new destination; never reuse an earlier backup:

```powershell
$backupRoot = Join-Path $env:LOCALAPPDATA ("pl-dashboard-backup-" + (Get-Date -Format "yyyyMMdd-HHmmss"))
New-Item -ItemType Directory -Path $backupRoot | Out-Null
```

Inventory managed physical backups:

```powershell
npx supabase backups list --project-ref ovnwmayhbmbdzbxrfrul --output json
```

For a release-time logical copy, link only after confirming the project ref,
then dump roles, schema, and data separately:

```powershell
npx supabase link --project-ref ovnwmayhbmbdzbxrfrul
npx supabase db dump --linked --role-only --file (Join-Path $backupRoot "roles.sql")
npx supabase db dump --linked --file (Join-Path $backupRoot "schema.sql")
npx supabase db dump --linked --data-only --use-copy `
  -x storage.buckets_vectors `
  -x storage.vector_indexes `
  --file (Join-Path $backupRoot "data.sql")
```

Export Storage separately. `ss:///graphics` means the exact remote bucket;
the local destination must be new:

```powershell
npx supabase storage cp --linked --recursive ss:///graphics (Join-Path $backupRoot "graphics")
Get-ChildItem -LiteralPath $backupRoot -File -Recurse |
  Get-FileHash -Algorithm SHA256 |
  Export-Csv -NoTypeInformation (Join-Path $backupRoot "sha256.csv")
```

Record file count and total bytes without printing content:

```powershell
$files = Get-ChildItem -LiteralPath $backupRoot -File -Recurse
$files.Count
($files | Measure-Object -Property Length -Sum).Sum
```

## Restore decision

Prefer a restore to a new Supabase project for rehearsal or investigation.
Never rehearse against production.

For a logical restore, create an empty **Supabase project** rather than an
uninitialized Postgres database. Enable the source project's non-default
extensions and Database Webhooks first. Obtain the target's direct or
session-pooler connection string as `RESTORE_DB_URL`, then use Supabase's
single-transaction restore shape. `session_replication_role = replica` is
required for the circular foreign keys in graphics versions and threaded
comments; it disables triggers only inside this atomic restore transaction:

```powershell
psql `
  --single-transaction `
  --variable ON_ERROR_STOP=1 `
  --file (Join-Path $backupRoot "roles.sql") `
  --file (Join-Path $backupRoot "schema.sql") `
  --command 'SET session_replication_role = replica' `
  --file (Join-Path $backupRoot "data.sql") `
  --dbname $env:RESTORE_DB_URL
```

The logical dump intentionally does not replace Supabase-managed migration
history in `auth.schema_migrations` or `storage.migrations`. If repository
migration history must also be preserved, follow Supabase's separate
`supabase_migrations` history procedure; do not improvise by copying platform
migration tables.

Restore Storage only after the new target is linked and empty:

```powershell
npx supabase storage cp --linked --recursive (Join-Path $backupRoot "graphics") ss:///graphics
```

A same-project physical restore causes downtime and can discard writes after
the selected point. With PITR enabled, the reviewed CLI shape is:

```text
npx supabase backups restore --project-ref ovnwmayhbmbdzbxrfrul --timestamp UNIX_SECONDS
```

PITR is currently off, so do not run that command. Use Supabase Dashboard >
Database > Backups for a reviewed daily-backup restore, or restore into a new
project. Supabase documents that custom-role passwords are not included and
Storage objects are not restored with the database.

## Stop conditions

- The latest completed backup is after the incident began or too old for the
  accepted recovery-point objective.
- `pitr_enabled` is false but the plan assumes a point-in-time restore.
- The Storage export is incomplete, hashes are missing, or object counts differ.
- `RESTORE_DB_URL` identifies production during a rehearsal.
- The target is not a newly initialized Supabase project with required
  extensions and Webhooks configured.
- Any `psql` step reports an error; do not continue to later restore stages.

## Verification

- Re-run `supabase backups list` and capture only IDs, timestamps, and status.
- Verify `sha256.csv` hashes and counts against the exported files.
- On a new-project rehearsal, run migrations/tests against the restored schema,
  compare application table/object counts (excluding Supabase-managed platform
  migration tables), confirm every constraint has the same validation state as
  the source, confirm the `graphics` bucket remains private, and perform
  authenticated signed reads for a sample object.
- After a real restore, use the [Deployment](./DEPLOYMENT.md) smoke gate before
  reopening writes.

## Evidence to retain

- Physical backup ID/timestamp/status and whether PITR was enabled.
- Logical dump filenames, byte sizes, SHA-256 hashes, and CLI version.
- Storage object count, total bytes, manifest hash, and destination owner.
- Restore target ref, start/end UTC, errors, validation queries, and decision to
  reopen writes.

Reference: [Supabase Database Backups](https://supabase.com/docs/guides/platform/backups)
and [Backup/Restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).
