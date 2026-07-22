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

## Live Creator API contract

The implemented connector follows Raptive's published Creator API v1 contract:

- OAuth 2.0 client credentials use HTTP Basic authentication at
  `POST https://publisher-api.raptive.com/oauth/token`. The short-lived bearer
  token expires after 300 seconds and has no refresh token.
- Data requests use `https://publisher-api.raptive.com/creator-api/v1`.
  Operations discovers authorized sites from `GET /sites`; site IDs are never
  guessed. A site must be active and its normalized host must exactly match the
  selected PL or QB WordPress host before it can be saved.
- `GET /sites/{siteId}/date-bounds` supplies separate analytics and earnings
  ranges. Automatic sync chooses the newest calendar day present in both; a
  manual retry must also fall inside both ranges.
- `GET /sites/{siteId}/pages/performance` is requested for one inclusive
  calendar day. Every numbered page is read and reconciled to `recordCount`,
  with a 100,000-row safety limit.
- The response provides page URL, earnings, pageviews, and RPM, but not sessions.
  Live rows therefore store `sessions = 0` and map API RPM to both legacy `rpm`
  fields. This limitation is explicit rather than inferred.
- HTTP 429 honors `Retry-After`; transient 5xx/network failures use bounded
  exponential backoff. One 401 clears and replaces the cached bearer token.
  Provider bodies, client credentials, bearer tokens, and site IDs never enter
  user-facing errors or structured logs.

Credentials are server-only `RAPTIVE_CLIENT_ID` and
`RAPTIVE_CLIENT_SECRET` values. Connection state is service-role-only with
forced RLS. Configuration is disabled by default, enabling rechecks that the
stored site remains visible, and synchronization rechecks active status and
host identity.

Each sync performs a single-day, site-scoped replacement inside one database
transaction. The transaction locks the connection, refuses disabled or changed
site IDs, validates row shape/date/count/duplicates, replaces only that PL/QB
day, and records row/earnings reconciliation. A failed transaction preserves
the prior day. The daily cron retries the newest complete day idempotently;
Operations can retry a specific valid date for provider corrections.

Historical rows matched to an entry inherit that entry's PL/QB site. A live
sync refuses a day containing any still-unattributed historical row instead of
guessing its site, deleting another site's revenue, or double-counting it. The
real-workbook gate must resolve that ambiguity before an overlapping live day
can be enabled or retried.

Contract sources: [Raptive Creator API documentation](https://api-docs.raptive.com/)
and its published [OpenAPI definition](https://api-docs.raptive.com/openapi/creator-api-v1.openapi.json).

## Finance contract

No external finance consumer or authenticated daily-aggregate API exists in
the repository. None is created speculatively. Financial values remain behind
the existing EIC/Operations server authorization and RLS/service boundaries.
