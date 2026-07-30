# Release candidate

This is the one ordered Phase 7 procedure. Run it against one immutable commit;
do not create a second full gate merely because evidence was recorded.
WordPress remains authoritative for article content, publication metadata, and
status. The dashboard polls it read-only and never performs generalized content
merge or Yoast write-back.

## Preconditions

- Record the release commit, stacked PR order, operator, verifier, UTC start,
  last known-good production deployment, and Supabase project
  `ovnwmayhbmbdzbxrfrul`.
- The committed migration history is contiguous through
  `0033_recovery_and_health.sql` and the prior production stack is verified
  through `0031_atomic_tier_reordering.sql`.
- Use a new clean checkout of the immutable release commit. Never copy the
  current worktree's `.env.local`, `.vercel`, Supabase link state, or user files
  into it.
- Production migration authority, current database and Storage backup evidence,
  Vercel production authority, and a dedicated non-production-content test
  session must be available before the production section begins.

## Release-candidate gate

In the clean checkout, install from the lockfile and run this suite once:

```powershell
npm ci
npm run ops:verify-runbooks
npm run lint
npm run typecheck
npm run test:coverage
npm audit --audit-level=low
npm run build
npm run test:database
npm run db:types:check
npm run db:lint
npm run test:browser
npm run test:quality
```

The gate is green only when the database test starts from a clean local stack,
all authorization/session/RLS/secret-boundary and negative-role probes pass,
all WordPress recovery and Raptive correctness/replay/reconciliation probes
pass, and the browser/quality runs cover the complete committed
route/role/viewport matrix including accessibility.

Push that exact commit once. Require one exact-head GitHub Actions run and one
Vercel preview. Record the run/deployment IDs without changing the commit.

## Ordered production procedure

Until every production precondition is available, the status is:
**NO PRODUCTION CHANGE — RELEASE CANDIDATE ONLY.** Do not repeatedly probe
known-missing Supabase DDL access.

1. Run `npm run ops:preflight:production -- --require-release-access`. Stop if
   the sanitized report is not fully green.
2. Follow [Backup and restore](./BACKUP_AND_RESTORE.md). Freeze writes for the
   final logical snapshot, export the private `graphics` bucket separately,
   verify hashes/counts, and record the accepted recovery point.
3. Follow [Migration and rollback](./MIGRATION_AND_ROLLBACK.md). The linked dry
   run must contain the following unapplied files in this exact order, with no
   omissions or additions:

```text
0013_verified_database_invariants.sql
0014_transactional_bulk_entries.sql
0015_cron_execution_control.sql
0016_reassert_server_only_data_boundary.sql
0017_remove_unsupported_notification_channels.sql
0018_transactional_editorial_workflows.sql
0019_transactional_graphic_versions.sql
0020_transactional_raptive_import.sql
0021_restore_service_role_table_access.sql
0022_operational_observability.sql
0023_humane_capacity_and_editor_bulk_claims.sql
0024_graphics_review_requirements.sql
0025_notification_delivery_controls.sql
0026_wordpress_entry_sync_state.sql
0027_raptive_creator_api_sync.sql
0028_site_safe_raptive_import.sql
0029_compact_raptive_history.sql
0030_prevent_raptive_history_overlap.sql
0031_atomic_tier_reordering.sql
0032_analytics_correctness.sql
0033_recovery_and_health.sql
```

   If production already contains a verified prefix, apply only the remaining
   contiguous suffix. Apply once, verify history/schema/grants/RLS/constraints,
   and use the documented forward-repair/restore decision tree if verification
   fails. Do not edit applied migrations or improvise destructive reversals.
4. Merge the stacked PRs from #9 through the Phase 7 PR in base-to-head order.
   Confirm every merge preserves the reviewed ancestry. Watch the final
   production deployment and verify it resolves to the release tree.
5. Run the production smoke below. Reopen normal operation only after both the
   operator and verifier sign off.

## Production smoke

Use only read-only paths except for explicitly approved disposable fixtures.
Record status and safe error IDs, never response bodies containing staff or
article data.

| Boundary | Verification |
| --- | --- |
| Public/auth | Login returns 200; anonymous `/api/auth/me` returns 401; logout and expired/revoked sessions fail closed. |
| Roles/resources | Writer, editor, graphics, manager, EIC, operations, and admin navigation matches API authority; cross-site, cross-entry, and negative-role requests remain denied. |
| WordPress/SEO | One PL entry/detail loads public/admin links and sync state; authorized refresh recovers safely; title generation and SEO analysis are read-only; no WordPress/Yoast write-back occurs. QB remains explicitly unconfigured unless real credentials have been approved. |
| Cron/recovery | Each configured job has an explainable fresh durable run after its next schedule window; overlap/retry state is healthy; one authorized manual recovery is allowed only for a stale/failed job. |
| Graphics/storage | The `graphics` bucket is private; a public object URL fails and an authorized signed read succeeds; approval boundaries remain enforced. |
| Integrations/health | Settings > Sync > System health loads for both-site Admin+; WordPress, GA4, notifications, Raptive import/live status, and cron states are explainable; no new critical alert or 5xx spike appears. |
| Raptive historical | Confirm browser upload remains Operations-only. Import the immutable compact manifest only after its hashes, 98 MB measured footprint, exact PL/QB totals, entry/site boundaries, and backup are verified; raw URL-level history must not enter the no-spend database. |
| Raptive live | Credentials remain server-only; EIC has read-only status; only Operations can discover/map/enable/sync. Confirm an active authorized site is host-matched and disabled by default, then enable and reconcile one complete day. Negative-role and cross-site requests remain denied. |

After any repair, rerun only failed or affected gates, then run one final smoke
covering login/session closure, representative role/resource denial,
WordPress/SEO read-only behavior, cron/health, private graphics, and Raptive
integration status.

## Nick's Raptive actions

Both original real inputs were supplied on 2026-07-22: five aggregate
workbooks (also present in the linked Drive folder) and the published contract
plus server-only Vercel credentials. No additional Nick action is pending.

The Raptive API contract is the published Creator API v1 contract linked in
`docs/RAPTIVE_INGESTION_CONTRACT.md`; no undocumented endpoint is used.

1. **Supplied:** five historical aggregate workbooks. The verified compact
   manifest covers 2019-02-06 through 2026-05-10 and must be imported only by
   the ordered, hash-checking, resumable service procedure after `0028`/`0029`.
2. **Supplied:** Raptive Creator API v1 plus `RAPTIVE_CLIENT_ID` and
   `RAPTIVE_CLIENT_SECRET` in Vercel Preview/Production. Validate them without
   exposing values using `node scripts/verify-raptive-api.mjs`; production
   enablement still waits for the release deployment, host mapping, and a
   reconciled one-day Operations smoke.

## Stop conditions

- The exact release commit or stacked PR order is ambiguous.
- Any clean-checkout, exact-head CI, preview, backup, migration, deployment, or
  smoke result is red.
- Supabase DDL, backup/Storage export, Vercel production, or dedicated test
  session authority is absent.
- Migration dry-run history differs from the ordered stack, or rollback/restore
  compatibility is unproven.
- A test would expose secrets or mutate/publish real editorial content.
- Nick's workbook or the published API contract leaves identity, timezone, totals, correction,
  or authorization semantics ambiguous.

## Verification

- The clean checkout, GitHub Actions, and preview all identify the same commit.
- Production migration history ends at `0033`; schema, grants, RLS, constraints,
  generated types, private Storage, and backup evidence match the release.
- Production resolves to the intended release and every smoke boundary passes.
- The real Raptive workbook reconciles exactly. The live connector follows the
  authorized Creator API v1 contract, shares canonical normalization, and its
  daily row/earnings totals reconcile through service-role-only state.
- The final release smoke passes after all affected repairs.

## Evidence to retain

- Release commit, PR order/merge SHAs, Actions run, preview and production
  deployment IDs/URLs, UTC times, operator, and verifier.
- Clean-checkout suite totals, migration before/dry-run/after lists, backup and
  Storage manifests, schema/RLS probes, smoke matrix, and sanitized log counts.
- Raptive workbook name/hash/size/rows/date range (not its contents), preview and
  committed totals, deduplication/reconciliation results, actual API contract
  version, credential owner, and enablement decision.
- Residual risks, accepted exceptions with owner/date, repairs, affected-gate
  reruns, and final smoke result.
