# Incident response

The first objective is to stop additional harm while preserving enough state
to recover. Do not make a destructive change merely to make an alert disappear.

## Severity

| Level | Meaning | Initial response target |
| --- | --- | --- |
| SEV-0 | Active credential abuse, broad unauthorized data access, or ongoing destructive writes | Immediate; contain first |
| SEV-1 | Production unavailable, corrupt data, broken authentication, public private-assets, or failed critical cron with user impact | 15 minutes |
| SEV-2 | Degraded integration, stale scheduled work, bounded import failure, or role-specific feature outage | Same business hour |
| SEV-3 | Warning without current user impact, isolated recoverable error, or documentation/monitoring defect | Next planned work window |

## Preconditions

- Name one incident lead, one verifier/scribe, severity, start time in UTC, and
  affected systems.
- Use a private incident channel that is approved for operational metadata; do
  not paste tokens, request bodies, emails, article content, or backup data.
- Run `npm run ops:preflight:production` and preserve the sanitized report.
- Record the last known-good Git commit/deployment and latest completed backup
  before changing state.

## First 15 minutes

1. Confirm impact from two independent signals: user-visible behavior plus
   health/log/database evidence. A single warning is not proof of outage.
2. Preserve Git SHA, deployment ID, alert error IDs/codes, first/last seen time,
   affected route/job, and sanitized log window.
3. Stop the source of harm:
   - compromised secret: start [Secret rotation](./SECRET_ROTATION.md);
   - application-only 5xx regression: consider `vercel rollback`;
   - corrupt/destructive writes: disable the initiating workflow or place the
     release under a write freeze before restore decisions;
   - private Storage exposure: make the bucket/private path inaccessible before
     asset repair, never delete the only retrievable copy.
4. Do not retry an unknown write or import. First inspect its durable run/audit
   state; a lost response may represent a successful commit.

## Diagnosis by surface

### Application or deployment

```text
vercel logs --environment production --status-code 5xx --since 30m
vercel list --prod
vercel inspect DEPLOYMENT_URL
```

Compare the failing deployment with the last known good. If the database is
compatible, use the deployment rollback section in the deployment runbook.

### Database or migration

Freeze new releases, refresh `supabase backups list`, compare local and remote
history with `supabase migration list --linked`, and preserve the failed
migration output. Do not use `migration repair` until schema reality is proven.
Follow [Migration and rollback](./MIGRATION_AND_ROLLBACK.md).

### Cron or integration

Open **Settings > Sync > System health**, capture the safe error code and
correlation ID, check last-run/freshness state, and follow its remediation.
After fixing the cause, run at most one authorized manual execution and confirm
the durable run succeeds and the alert resolves. Never loop retries against
WordPress, GA4, or notifications.

### Raptive import

Open **Settings > Analytics > Raptive import attempts**. A `running` record
older than five minutes or recent `failed` record is critical. Check the run ID,
safe error code, date range, and whether upload history links to it. Do not
delete the date range or re-upload until the durable state proves the prior
transaction did not succeed.

### Storage

Treat a public `graphics` object as SEV-1. Set the bucket private, prove the
current public URL fails and an authorized signed URL succeeds, compare database
references to origin objects, and create a verified backup before repointing or
deleting anything. CDN invalidation may lag origin changes.

## Communication

Each update should state: severity, confirmed impact, containment, current
hypothesis (clearly labeled), next action/owner, and next update time. Never
claim recovery until the verification section passes.

## Stop conditions

- Target system, incident start, or last known-good point is uncertain.
- The proposed action can discard writes and no accepted recovery point exists.
- A credential would need to be shared through chat/ticket/command arguments.
- The rollback deployment is schema-incompatible.
- The same retry has failed twice without new evidence; pause and escalate.

## Verification

- User-visible symptom is gone from a clean session and a second verifier.
- Production commit/deployment and database migration state are recorded.
- Health refresh succeeds; affected alert resolves; no new critical alert or
  5xx spike appears for at least one relevant job/request window.
- Data/object counts and access boundaries match the pre-incident contract.
- All temporary access, fixtures, bypasses, and write freezes are removed.

## Evidence to retain

- Timeline in UTC, severity changes, owners, decisions, sanitized logs/error
  IDs, deployment/migration/backup identifiers, and commands.
- Before/after health, access, row/object count, and smoke evidence.
- Root cause, contributing controls, recovery point/time achieved, customer
  impact, and concrete follow-ups with owners/dates.
