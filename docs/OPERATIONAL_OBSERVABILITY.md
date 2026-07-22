# Operational observability

The dashboard keeps the minimum production signal needed to answer four
questions without exposing credentials, content, personal data, exception
messages, or stack traces:

1. Did each scheduled job run on time and finish?
2. Are WordPress, GA4, and Raptive current and usable?
3. Is an import running, complete, or safely failed?
4. What failed, how often, and what should an operator do next?

## Structured logs

Server failures go through `src/lib/observability/structured-log.ts`. Each log
is one JSON line with timestamp, level, component, event, a safe error code,
and an error correlation ID when the level is `error`.

Attributes are capped at 20 fields and 160 characters per string. Keys that
can carry authorization, cookies, credentials, email addresses, files,
passwords, secrets, tokens, or URLs are removed. Bearer values, JWT-shaped
values, Supabase secret keys, and email-shaped values are redacted. Callers
must not pass exception messages or stack traces as attributes.

## Durable alerts

`operational_alerts` is a forced-RLS, service-role-only table. An alert uses a
stable fingerprint so repeated failures update its occurrence count and last
seen time rather than creating noise. It contains a fixed safe summary, safe
error code, and direct remediation. Recovery resolves the fingerprint while
preserving the historical row.

If alert persistence itself fails, the product operation does not fail again:
the server emits one safe structured warning and continues.

## Health view

Both-site Admin+ users can open **Settings > Sync > System health**. The view
and `/api/settings/operational-health` show:

- all eight canonical Vercel jobs, their latest durable state, freshness, safe
  error code, and remediation;
- Pitcher List and QB List WordPress synchronization freshness;
- GA4 configuration, connection, and synchronization freshness;
- Raptive import state and recent failures; and
- unresolved operational alerts.

Healthy recovery is visible after refresh. A health-probe failure makes the
snapshot critical and records only the probe name in logs. The public HTTP
failure envelope returns a correlation ID, never the underlying exception.

## Import visibility

Every committed Raptive workbook creates an `import_runs` row before matching.
The successful data replacement, upload history row, and import completion are
one database transaction. If a client loses the successful RPC response, the
application re-reads the durable run instead of reporting an ambiguous failure.

EIC and Operations viewers can inspect all recent attempts under **Settings >
Analytics > Raptive import attempts**, including running and failed work that
does not appear in successful upload history.

## Database boundary

Migration `0022_operational_observability.sql` owns the tables and RPCs. Anon
and authenticated roles have no table or function access. Only service-role
application code may record, resolve, begin, or finish operational state.
Database tests prove forced RLS, grants, alert deduplication/resolution,
tracked import success, rollback, and client-role denial.
