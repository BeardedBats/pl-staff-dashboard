# Migration and rollback

The committed database history is contiguous from
`0001_initial_schema.sql` through `0030_prevent_raptive_history_overlap.sql`. The
current application stack depends on migrations `0013`–`0030`; apply those
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
`0030_prevent_raptive_history_overlap.sql`. Apply once:

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

### Migration 0023 contingency

Migration `0023` adds availability and a submitted-only bulk editor-claim
transaction. It executes transactionally. A failed apply must leave no
availability columns or bulk-claim function. After a successful apply, the
preferred recovery is a forward repair because the Phase 4 application reads
the new columns.

Only before the Phase 4 application is deployed, and only after a verified
backup, the release operator may reverse `0023` in one transaction:

```sql
BEGIN;
DROP FUNCTION IF EXISTS public.bulk_claim_editor_entries(uuid, uuid[]);
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_availability_note_length_check,
  DROP CONSTRAINT IF EXISTS users_availability_status_check,
  DROP COLUMN IF EXISTS availability_until,
  DROP COLUMN IF EXISTS availability_note,
  DROP COLUMN IF EXISTS availability_status;
COMMIT;
```

After application deployment, do not run that reversal; keep the compatible
schema and ship a forward fix or restore the database and application together.

### Migration 0024 contingency

Migration `0024` adds structured graphic requirements and the worker-review / editorial-approval state machine. It executes transactionally. A failed apply must leave no new columns, triggers, or functions. After a successful apply, prefer a forward repair because the Phase 4 application reads the new columns and approval gate.

Only before the Phase 4 application is deployed, and only after a verified backup, the release operator may reverse `0024` in one transaction:

```sql
BEGIN;
DROP TRIGGER IF EXISTS trg_graphic_approval_stamp ON public.graphic_requests;
DROP TRIGGER IF EXISTS trg_graphic_review_before_approval ON public.graphic_requests;
DROP TRIGGER IF EXISTS trg_graphic_version_clears_review ON public.graphic_request_versions;
DROP FUNCTION IF EXISTS public.stamp_graphic_approval();
DROP FUNCTION IF EXISTS public.enforce_graphic_review_before_approval();
DROP FUNCTION IF EXISTS public.clear_graphic_review_on_new_version();
DROP FUNCTION IF EXISTS public.submit_graphic_for_review(uuid, uuid);
ALTER TABLE public.graphic_requests
  DROP CONSTRAINT IF EXISTS graphic_requests_requirements_object_check,
  DROP COLUMN IF EXISTS approved_at,
  DROP COLUMN IF EXISTS review_submitted_at,
  DROP COLUMN IF EXISTS requirements;
COMMIT;
```

After application deployment, do not reverse `0024`; deploy a compatible forward migration or restore the database and application together.

### Migration 0025 contingency

Migration `0025` adds in-app notification scheduling, bounded attempt metadata, and an atomic preference/settings transaction. A failed apply must leave no partial columns or function. After a successful apply, prefer a forward repair because the Phase 4 application reads the scheduling fields.

Only before the Phase 4 application is deployed, and only after a verified backup, the release operator may reverse `0025` in one transaction:

```sql
BEGIN;
DROP FUNCTION IF EXISTS public.replace_notification_preferences(uuid, jsonb, text, time, time, time);
DROP INDEX IF EXISTS public.idx_notifications_user_available;
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_delivery_attempts_check,
  DROP COLUMN IF EXISTS delivery_attempts,
  DROP COLUMN IF EXISTS available_at;
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_notification_quiet_pair_check,
  DROP CONSTRAINT IF EXISTS users_notification_delivery_mode_check,
  DROP COLUMN IF EXISTS notification_quiet_end,
  DROP COLUMN IF EXISTS notification_quiet_start,
  DROP COLUMN IF EXISTS notification_digest_time,
  DROP COLUMN IF EXISTS notification_delivery_mode;
COMMIT;
```

After application deployment, do not reverse `0025`; deploy a compatible forward migration or restore the database and application together.

### Migration 0026 contingency

Migration `0026` adds the entry-level WordPress synchronization status, last
successful time, bounded error, and attention index. It executes
transactionally. After Phase 5 application deployment, prefer a forward repair
because entry detail and operational health read these fields.

Only before Phase 5 deployment, and only after a verified backup, reverse it
in one transaction:

```sql
BEGIN;
DROP INDEX IF EXISTS public.entries_wp_sync_attention_idx;
ALTER TABLE public.entries
  DROP COLUMN IF EXISTS wp_last_sync_error,
  DROP COLUMN IF EXISTS wp_last_synced_at,
  DROP COLUMN IF EXISTS wp_sync_status;
COMMIT;
```

After deployment, ship a compatible forward migration or restore the database
and application together.

### Migration 0027 contingency

Migration `0027` adds site attribution to Raptive revenue, private forced-RLS
connection state, and service-role-only configure/enable/fail/atomic-daily-sync
RPCs. It backfills site attribution only where an existing revenue row is
already joined to an entry. The migration is transactional.

Only before the Phase 7 application is deployed, before any live sync is
enabled, and after a verified backup, reverse it in one transaction:

```sql
BEGIN;
DROP TRIGGER IF EXISTS trg_raptive_revenue_assign_site ON public.raptive_revenue;
DROP FUNCTION IF EXISTS public.assign_raptive_revenue_site();
DROP FUNCTION IF EXISTS public.commit_raptive_live_sync(text, text, date, jsonb, jsonb);
DROP FUNCTION IF EXISTS public.fail_raptive_live_sync(text, text, date, text);
DROP FUNCTION IF EXISTS public.set_raptive_connection_enabled(text, boolean);
DROP FUNCTION IF EXISTS public.configure_raptive_connection(text, text, text, text, uuid);
DROP TABLE IF EXISTS public.raptive_connections;
DROP INDEX IF EXISTS public.raptive_revenue_site_date_idx;
ALTER TABLE public.raptive_revenue DROP COLUMN IF EXISTS wp_site;
COMMIT;
```

After deployment or any live write, do not run this reversal: it would discard
connection/reconciliation state and site attribution. Disable the connector,
preserve the affected daily rows, and ship a compatible forward repair or
restore database and application together.

### Migrations 0028–0029 contingency

Migration `0028` makes workbook identity site-safe and migration `0029` adds
the compact service-only historical table, batch upsert, summary, and analytics
union. Apply them before importing the immutable history manifest. Before any
history write, they may be reversed by dropping the `0029` table/functions and
restoring `commit_raptive_import` from `0022`; after a history write, preserve
the manifest and table, then use a forward repair or restore. Never drop the
compact table as an incident shortcut.

### Migration 0030 contingency

Migration `0030` serializes writes for each Raptive site/day and rejects both
raw-over-compact and compact-over-raw overlap. Before deploying application
code that relies on this invariant, it can be reversed by dropping
`trg_raptive_revenue_prevent_history_overlap`,
`trg_raptive_history_prevent_revenue_overlap`, and
`prevent_raptive_history_overlap()`. After deployment, preserve the invariant
and use a forward repair or restore instead.

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
- Availability values and note length constraints reject invalid writes;
  authenticated clients cannot execute `bulk_claim_editor_entries`, while the
  service role can. A disposable editor batch must create matching assignment
  and audit rows or roll back completely on one conflict.
- Malformed graphic briefs are rejected; authenticated clients cannot execute
  `submit_graphic_for_review`; a replacement asset clears review state; and a
  WordPress approval lease is impossible until the assigned worker submits the
  current immutable version for review.
- Notification delivery modes and quiet-hour pairs reject invalid values;
  authenticated clients cannot execute `replace_notification_preferences`;
  and one invalid event must roll back both the preference set and delivery
  settings. Future scheduled items must remain outside unread counts until due.
- Entry sync status accepts only `pending`, `synced`, `stale`, and `error`;
  invalid states and overlong error details are rejected. There is no
  WordPress webhook/event ledger or generalized content-conflict schema.
- WordPress polling remains read-only for article content and publication
  metadata. A successful reconciliation updates the dashboard sync state and
  watermark; partial-page and upstream failures retain the previous watermark
  so an authorized manual refresh can recover without skipping changes.
- Raptive connection state has forced RLS and is inaccessible to anon and
  authenticated roles; only service-role RPCs can configure or write it. A
  connection starts disabled. A disposable one-day sync must replace only its
  selected PL/QB day, preserve the other site, reject duplicates/invalid rows,
  refuse unattributed historical overlap, and reconcile row count, earnings,
  date, and safe failure state atomically.
- Compact Raptive history has forced RLS; anon/authenticated roles have no
  table or RPC access. Batch upserts reject missing entries and cross-site
  attribution, remain idempotent for matched and null-entry site/day keys, and
  the summary must reconcile the immutable manifest exactly.
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
