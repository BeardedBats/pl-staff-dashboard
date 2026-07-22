# Raptive ingestion contract

## Current supported path

The production-ready path is the existing Operations-only XLSX importer. It
accepts a workbook up to 10 MB and 100,000 valid rows, reads every sheet that
contains Date, Page URL, and Earnings columns, and treats each date plus
canonical URL path as one record identity.

- Dates are interpreted as calendar dates and stored as `YYYY-MM-DD`; no time
  or timezone conversion is inferred from a date-only cell.
- Exact duplicate rows collapse and are counted. Conflicting duplicates fail
  the workbook instead of choosing a winner.
- Malformed rows appear in preview and block commit until corrected.
- Preview reports sheets, date range, rows, duplicates, rejected rows,
  matched/unmatched URLs, samples, file size, and earnings reconciliation.
- Commit replaces the exact date range inside one service-role-only database
  transaction. A late failure rolls back deletion, inserts, upload history, and
  success state together.
- A durable run is created before commit. Interrupted responses reconcile the
  recorded outcome before reporting failure, so a successful replay is not
  blindly repeated.

Private storage, background jobs, chunking, and checkpoints are deliberately
not added unless Nick's real workbook exceeds the measured 10 MB / 100,000-row
envelope or cannot complete within the current request window.

## Real-workbook verification procedure

When the final workbook is supplied, Operations will:

1. Record its size and hash without logging financial contents.
2. Preview it without database writes and verify sheet roles, resolved headers,
   row count, calendar-date semantics, date range, duplicate/rejected totals,
   URL domains, match rate, and earnings total against the source export.
3. Stop if the file exceeds the supported envelope or the real format changes
   any parsing/deduplication assumption. Measure before designing an alternate
   storage/job path.
4. Commit once, verify atomic replacement and upload/run history, then preview
   and reconcile the same workbook again to prove repeat behavior.

## Live connector boundary

There is no verified Raptive API contract or credential in the application.
The dashboard must not guess an endpoint, accept a speculative secret, scrape a
portal, or expose a misleading enable button.

A connector may be built only after the actual account contract identifies:

- base URL, authentication and rotation method;
- financial-data scope and least-privilege permissions;
- response schema, timezone, aggregation level, pagination and maximum range;
- rate limits, retry guidance, stable record/replay identity, and correction
  behavior;
- test/sandbox method and production reconciliation totals.

Only then may Operations receive enable, disable, test, backfill, retry,
freshness/health, and reconciliation controls. Credentials remain server-only
managed secrets. Historical and live ingestion must share the canonical URL
normalization and date-plus-path identity.

## Finance contract

No external finance consumer or authenticated daily-aggregate API exists in
the repository. None is created speculatively. Financial values remain behind
the existing EIC/Operations server authorization and RLS/service boundaries.
