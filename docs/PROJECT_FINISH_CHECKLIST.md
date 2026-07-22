# Pitcher List Staff Content Dashboard — Production Readiness

Last updated: 2026-07-21

## Recovery state

- Current phase: Phase 2 — Test system, CI, observability, and operational safety
- Current action: P2.10 — Add observable, safe, actionable production-failure signals.
- Branch: `codex/production-readiness-p2-9`
- Stack base: `a6d3c42` (green draft PR #25, based on green draft PRs #24, #23, #22, #21, #20, #19, #18, #17, #16, #15, #14, #13, #12, #11, #10, and #9).
- Upstream baseline: `origin/main` at merge commit `dbab5c2` after PR #8.
- Deployment: Vercel production status completed successfully from `dbab5c2` on 2026-07-21 (`HLrWTph5hnSf2yf2yN6aNAtYR6Kq`).
- Known blockers: production application of the stacked migrations through `0021` requires either a Supabase personal/fine-grained token with database-write permission or the hosted Postgres password/connection URL. Neither is present in process/user/machine environment variables, Supabase native/file credentials, `.env.local`, or GitHub secrets/variables. Vercel project-management access and a safe dashboard test-user session are also unavailable.
- Preserved user work: modified `CLAUDE.md`; seven untracked prompt/audit files; zero-byte untracked `npx`. These are excluded from project commits.
- Sensitive local material: four plaintext credential files exist in the outer workspace. Values were not read or emitted. Rotation/removal is pending verified service access and recovery-safe replacement.

## Phase 0 — Preserve, synchronize, and establish the truth

- [x] P0.1 Confirm the actual repository root, remotes, current branch, HEAD, upstream, and nested-folder topology.
- [x] P0.2 Inspect the dirty worktree and preserve all user-created changes without overwriting, deleting, or accidentally committing secrets.
- [x] P0.3 Fetch GitHub and safely reconcile the local checkout with the authoritative remote history.
- [x] P0.4 Create an appropriate `codex/` working branch and establish checkpoint practices.
- [x] P0.5 Inventory application routes, APIs, database migrations, background jobs, cron jobs, roles, permissions, integrations, and deployments.
- [x] P0.6 Inventory required environment variables and secret locations without displaying secret values.
- [ ] P0.7 Identify plaintext or exposed credentials, rotate them when service access permits, move them into managed secret storage, and prevent recurrence. — BLOCKED: Vercel/Supabase management access is unavailable, so rotation cannot be completed without risking production outage. Plaintext files remain untouched and values have not been emitted.
- [x] P0.8 Install dependencies reproducibly and capture baseline lint, type-check, build, audit, and runtime results.
- [ ] P0.9 Inspect the live production and preview applications, including role-specific navigation and API behavior. — BLOCKED: public/login surfaces are verified, but there is no safe non-mutating dashboard test session for live role navigation; preview access is Vercel-protected.
- [x] P0.10 Inspect the live database, RLS policies, storage buckets, Vercel settings, cron configuration, and connected service state when credentials permit.
- [x] P0.11 Create the durable checklist with evidence from the verified baseline.
- [x] P0.12 Produce a prioritized defect and risk inventory mapped to later phase items, then continue directly into Phase 1.

Gate: the user's work is preserved, local and remote history are understood, secrets are not exposed, the baseline is reproducible, and every later action is grounded in actual evidence.

## Phase 1 — Security, correctness, and data integrity

- [x] P1.1 Repair refresh-token rotation, replay protection, concurrent refresh behavior, revocation, expiry, logout, and session invalidation.
- [x] P1.2 Ensure access-token requests validate the current server-side session state where required.
- [x] P1.3 Audit every API route and server action against an explicit role-and-resource authorization matrix.
- [x] P1.4 Fix graphics, editorial, analytics, administration, and synchronization authorization gaps.
- [x] P1.5 Reconcile navigation visibility with backend permissions so users never see inaccessible areas or gain access through hidden routes.
- [x] P1.6 Standardize request and response validation using shared schemas and safe, user-facing error handling.
- [x] P1.7 Replace placeholder database types and restore generated typing or an equally reliable typed schema workflow.
- [ ] P1.8 Add verified database constraints for identity, email, categories, season state, uniqueness, foreign keys, and other discovered invariants. — LOCAL GATE PASSED; PRODUCTION APPLY BLOCKED ON SUPABASE DDL ACCESS
- [ ] P1.9 Make bulk operations genuinely bulk and transactional instead of issuing fragile client-side request loops. — LOCAL GATE PASSED; STACKED PRODUCTION APPLY BLOCKED ON P1.8/SUPABASE DDL ACCESS
- [ ] P1.10 Consolidate duplicate URL normalization and other duplicated business rules into tested canonical modules. — GREEN DRAFT PR #11; STACKED RELEASE PENDING P1.8/P1.9
- [ ] P1.11 Fix staff name/display-name synchronization so intentional overrides survive login and manual resynchronization. — LOCAL GATE PASSED; STACKED RELEASE PENDING P1.8–P1.10
- [ ] P1.12 Correct cron request methods, authentication, idempotency, overlap protection, retry behavior, and observability. — GREEN DRAFT PR #13; STACKED PRODUCTION APPLY BLOCKED ON P1.8/SUPABASE DDL ACCESS
- [ ] P1.13 Verify and repair RLS policies, private-bucket rules, signed URL behavior, and server/client data boundaries. — GREEN DRAFT PR #14; STACKED PRODUCTION APPLY BLOCKED ON P1.8/SUPABASE DDL ACCESS
- [ ] P1.14 Upgrade vulnerable dependencies and remove unused dependencies or dead capabilities. — GREEN DRAFT PR #15; STACKED RELEASE PENDING P1.8–P1.13
- [ ] P1.15 Either implement unfinished notification/settings behavior or remove misleading UI, types, tables, and code paths. — GREEN DRAFT PR #16; STACKED PRODUCTION APPLY BLOCKED ON P1.8/SUPABASE DDL ACCESS
- [ ] P1.16 Add regression tests for every repaired security or integrity defect. — LOCAL GATE PASSED; STACKED RELEASE PENDING P1.8–P1.15

Gate: no known high-severity authorization, session, secret, RLS, cron, or data-integrity defect remains.

Phase 1 gate status: **LOCAL PASS; PRODUCTION RELEASE BLOCKED ONLY ON THE DOCUMENTED SUPABASE DDL ACCESS FOR THE STACKED MIGRATIONS 0013–0021.**

## Phase 2 — Test system, CI, observability, and operational safety

- [x] P2.1 Establish a practical unit, integration, database, API, and browser-test architecture.
- [x] P2.2 Test authentication, session rotation, role permissions, membership boundaries, and negative authorization cases.
- [x] P2.3 Test WordPress synchronization, webhooks, scheduled reconciliation, conflict handling, retries, and idempotency.
- [x] P2.4 Test editorial claims, assignments, state transitions, bulk actions, deadlines, and concurrent operations.
- [x] P2.5 Test graphics submission, review, versioning, authorization, and storage behavior.
- [x] P2.6 Test cron jobs with the same method and headers used by Vercel.
- [x] P2.7 Add representative Raptive importer tests with multi-sheet fixtures, duplicates, malformed rows, interruptions, and large files.
- [x] P2.8 Add role-based end-to-end journeys for managers, writers, editors, graphics staff, and administrators.
- [x] P2.9 Add GitHub Actions for install, lint, type checking, tests, build, migration checks, dependency checks, and browser tests where appropriate.
- [ ] P2.10 Add structured logs, safe error reporting, cron freshness, integration health, import-job visibility, and actionable alerts.
- [ ] P2.11 Add backup, migration, rollback, incident, secret-rotation, and deployment runbooks.
- [ ] P2.12 Establish measurable performance and accessibility baselines.

Gate: a clean checkout can prove correctness in CI, and production failures are detectable and diagnosable without reading raw infrastructure logs.

## Phase 3 — PLPD design-system foundation

- [ ] P3.1 Convert the guide's canonical colors, typography, spacing, gradients, shadows, borders, mesh, and semantic styles into centralized application tokens.
- [ ] P3.2 Implement reusable PLPD primitives for navigation, headers, tabs, buttons, fields, dropdowns, cards, chips, tables, pagination, alerts, dialogs, drawers, loading states, empty states, errors, and gated values.
- [ ] P3.3 Apply Work Sans to data and DM Sans to application chrome as defined by the guide.
- [ ] P3.4 Preserve the subtle-glass-over-mesh doctrine without opaque panels or heavy frosted glass.
- [ ] P3.5 Implement all required component states: default, hover, active, loading, error, empty, and gated.
- [ ] P3.6 Ensure gated data is withheld on the server rather than sent to the client and visually blurred.
- [ ] P3.7 Bring tables, numeric alignment, zero styling, row fills, hover behavior, pagination, and data colors into exact guide compliance.
- [ ] P3.8 Remove Never List violations.
- [ ] P3.9 Create responsive desktop, tablet, and mobile behavior without inventing new brand colors or visual language.
- [ ] P3.10 Add automated accessibility checks and keyboard/focus verification.
- [ ] P3.11 Establish screenshot or visual-regression coverage for shared primitives and representative pages.

Gate: new feature work can be built entirely from verified PLPD primitives.

## Phase 4 — Role-focused workflow and usability

- [ ] P4.1 Create a useful Today home screen.
- [ ] P4.2 Add global search and fast filtering.
- [ ] P4.3 Present plain-language status and a recommended next action.
- [ ] P4.4 Add role-based onboarding and setup checklists.
- [ ] P4.5 Cover loading, empty, partial, stale, success, and error states.
- [ ] P4.6 Build a manager control center.
- [ ] P4.7 Add useful saved views and presets.
- [ ] P4.8 Add a concise weekly operational digest.
- [ ] P4.9 Add safe bulk actions.
- [ ] P4.10 Build a focused My Work view.
- [ ] P4.11 Make availability and capacity visible without employee surveillance.
- [ ] P4.12 Present polishing requests as actionable feedback.
- [ ] P4.13 Add risk-first editor queues, SLA indicators, bulk actions, and saved queues.
- [ ] P4.14 Add polishing-reason templates and a readiness panel.
- [ ] P4.15 Preserve editorial handoff and state-transition history.
- [ ] P4.16 Capture complete graphics-request requirements.
- [ ] P4.17 Add asset versioning and Submit, Approve, and Request Changes states.
- [ ] P4.18 Add an asset library with usage and featured-image status.
- [ ] P4.19 Restrict graphics users to relevant information and actions.
- [ ] P4.20 Implement real supported notification delivery or remove unsupported choices.
- [ ] P4.21 Add digests, quiet hours, timezone delivery, retry status, and delivery health.
- [ ] P4.22 Add an understandable system-health page.

Gate: each role can complete primary work with minimal instruction, and managers can identify risks and decisions without raw tables.

## Phase 5 — WordPress and SEO

- [ ] P5.1 Verify actual WordPress authentication, REST, content types, taxonomy, author, media, status, and Yoast capabilities.
- [ ] P5.2 Combine webhooks with scheduled reconciliation.
- [ ] P5.3 Add idempotency, retries, conflict detection, staleness, and manual recovery.
- [ ] P5.4 Add preview/edit links and revision/synchronization status.
- [ ] P5.5 Add prepublication validation.
- [ ] P5.6 Add safe dashboard/WordPress conflict resolution.
- [ ] P5.7 Add evergreen-refresh identification where supported.
- [ ] P5.8 Implement the best maintainable title-generator integration.
- [ ] P5.9 Embed title generation/scoring without duplicate data entry.
- [ ] P5.10 Preserve explanations, SERP preview, suffix calculation, and copy/apply actions.
- [ ] P5.11 Test scoring, pixels, ranking, and regressions.
- [ ] P5.12 Determine supported Yoast read/write values and analysis.
- [ ] P5.13 Separate Yoast-reported results from Pitcher List analysis.
- [ ] P5.14 Analyze focus-keyphrase placement.
- [ ] P5.15 Analyze length, distribution, stuffing, structure, voice, transitions, and readability.
- [ ] P5.16 Provide prioritized, specific recommendations.
- [ ] P5.17 Allow permissioned analysis, approval, and supported WordPress write-back.
- [ ] P5.18 Require intentional before/after approval before overwrites.
- [ ] P5.19 Test SEO analysis, permissions, write-back, conflicts, and recovery.

Gate: staff can optimize articles, understand recommendations, and safely sync supported fields with WordPress.

## Phase 6 — Raptive-ready data system

- [ ] P6.1 Confirm workbook formats, sheet roles, columns, dates, timezones, aggregation, and dedupe keys.
- [ ] P6.2 Design normalized, indexed aggregate, URL-performance, job, checkpoint, hash, and live-sync tables.
- [ ] P6.3 Build rollback-capable, large-table-safe migrations.
- [ ] P6.4 Build direct-to-private-storage upload with validation, progress, cancellation, and retry.
- [ ] P6.5 Build resumable, chunked, checkpointed, restart-safe processing.
- [ ] P6.6 Process every required sheet.
- [ ] P6.7 Add reconciliation totals, rejected rows, sample inspection, and completion state.
- [ ] P6.8 Load-test realistic generated fixtures.
- [ ] P6.9 Build a typed live adapter with test, enable, disable, backfill, retry, rate limit, and health behavior.
- [ ] P6.10 Keep API credentials only in managed secret storage.
- [ ] P6.11 Share canonical normalization and deduplication across historical and live ingestion.
- [ ] P6.12 Expose role-appropriate analytics without leaking restricted financial data.
- [ ] P6.13 Provide a stable authenticated daily aggregate contract to the finance application.
- [ ] P6.14 Build a nontechnical administrator setup and health flow.
- [ ] P6.15 Test partial/repeated/overlapping/malformed imports and connector failure/replay cases.

Gate: realistic fixtures and mocked live responses pass; only Nick's real files and live authorization remain.

## Phase 7 — Full-system verification, deployment, and Raptive handoff

- [ ] P7.1 Run the full clean-checkout quality and security gate.
- [ ] P7.2 Run role browser journeys against a production-like deployment.
- [ ] P7.3 Visually inspect every route at desktop, tablet, and mobile widths.
- [ ] P7.4 Verify keyboard, focus, contrast, labels, reduced motion, and error announcements.
- [ ] P7.5 Verify WordPress synchronization and SEO on non-destructive real content.
- [ ] P7.6 Verify cron execution, retries, logs, health, and alerting.
- [ ] P7.7 Verify migrations, backups, rollback, secrets, and incident runbooks.
- [ ] P7.8 Remove obsolete code, dead dependencies, misleading UI, diagnostics, and safe-to-remove stale planning artifacts.
- [ ] P7.9 Align setup, architecture, operations, deployment, and user documentation.
- [ ] P7.10 Deploy through the normal workflow and confirm production commit/version.
- [ ] P7.11 Present Nick with only the two Raptive input actions.
- [ ] P7.12 Validate the real historical import after upload.
- [ ] P7.13 Validate live Raptive sync, dedupe, totals, health, permissions, and finance aggregates.
- [ ] P7.14 Run final regression and production smoke suites.
- [ ] P7.15 Produce the final evidence-linked checklist and residual-risk record.

Gate: the release is deployed and verified; real Raptive data is validated; every completion has concrete evidence.

## Excluded features

Do not implement internal-link suggestions, WordPress editorial-comment bridging, publication receipts, or the specified brief-template feature.

## Evidence log

### 2026-07-21 — P0 baseline

- P0.1: `git rev-parse --show-toplevel` resolved this repository; only one `.git` directory exists under the outer workspace.
- P0.2: `git status --short --branch`, `git diff -- CLAUDE.md`, and SHA-256 fingerprints recorded the preserved dirty state. Secret values were never read.
- P0.3: `git fetch --prune origin`; previous local `main` was 0 ahead / 1 behind. `origin/main` is `a2af3ef`.
- P0.4: `git switch -c codex/production-readiness origin/main`; branch starts at `a2af3ef` and user work remains present.
- P0.5: Next build enumerated 14 UI routes and 72 API routes; 8 cron schedules are declared in `vercel.json`; 11 baseline SQL migrations exist through `0011_analytics_overview_rpc.sql`; roles are writer, editor, graphics, manager, admin, EIC, and operations. Source integrations are Supabase, Pitcher List WordPress, optional QB List WordPress, GA4, Raptive workbook ingestion, Discord, Resend, GitHub, and Vercel.
- P0.6: required key names were inventoried from `.env.example`, `.env.local`, source references, and Git ignore rules without reading or emitting values. `.env.local` is ignored; only `.env.example` is tracked. Git history contains no tracked secret-like path beyond `.env.example`.
- P0.8: `npm ci`, `npm run lint`, `npx tsc --noEmit`, and `npm run build` passed. `npm audit --omit=dev` failed with 9 production vulnerabilities (3 high, 6 moderate); full install reported 12 total (5 high). This is a captured red baseline, not a clean gate.
- P0.9 partial: production `/` redirects to `/login`; the login form renders and requires WordPress application credentials. The standalone SEO title tool was exercised through generation and scoring. Its verified 100-point rubric is keyword 25, pixel/length 20, specificity 15, list framing 10, CTR phrases 15, and format/readability 15. Generated templates can duplicate phrases and must not be copied blindly.
- P0.10: server-role read-only probes confirmed all 29 expected tables are reachable and populated according to current use. Initial inspection found the live `graphics` bucket at `public: true`; a no-credential object read returned HTTP 200, proving migration drift. Pitcher List WordPress identity, types, categories, and post reads returned HTTP 200; the configured account can edit, publish, and upload. Yoast exposes rendered JSON and focus-keyword/title/meta-description keys. QB WordPress is not configured locally. Vercel project-management access is unavailable: the connected account returned no teams and the local CLI token is invalid.

### 2026-07-21 — Private graphics hotfix in progress

- Source audit found `loadFullGraphicRequests` returned a persisted, expiring signed URL while other graphics reads generated fresh signed URLs.
- `src/lib/entries/queries.ts` now batch-signs `storage_path` values for entry details.
- `supabase/migrations/0012_reassert_private_graphics_bucket.sql` idempotently sets the exact `graphics` bucket to private and includes the one-line rollback.
- Post-change `npm run lint`, `npx tsc --noEmit`, and `npm run build` all passed before the live change; preview, deployment, and final live verification are recorded below.

### 2026-07-21 — Private graphics hotfix verified

- Commit `2ba3e28` passed local lint, TypeScript, and production build; PR #3's Vercel preview build passed; PR #3 merged as `ce1572b`; production deployment `5539923582` completed successfully.
- The bucket flip initially exposed a CDN propagation edge case and rolled back automatically. A second verified flip set the live bucket private while preserving signed reads.
- The sole object was copied to a new private path, byte-hash verified, signed-read verified, and repointed in the database. The old origin object was deleted through the Storage API. Recovery briefly used the authenticated CDN copy after the deletion probe observed stale cache.
- Final live gate: bucket `public: false`; current public object request HTTP 400; signed request HTTP 200; 1 database reference; 1 origin object; all references present; 0 orphan objects.
- Supabase documents that deletion invalidates CDN entries with propagation delay. The deleted old path is no longer stored in application state, so its regional cache eviction cannot be re-probed; this remains an explicitly tracked residual until the broader P1.13 storage review.

### 2026-07-21 — P1.1 and P1.2 session lifecycle verified

- Session issuance now uses unique token identifiers, pins HS256, stores one final token pair, and validates access tokens against the current session row and token hash.
- Refresh rotation uses compare-and-swap against the prior refresh hash. Concurrent reuse yields exactly one successor; replay revokes the whole session family. Expired sessions, access invalidation, and refresh-only logout are covered by regression tests.
- Two Vitest files with five deterministic tests passed alongside lint, sequential TypeScript checking, and the production build. A live temporary-row database probe produced one compare-and-swap winner and one loser and cleaned up its records.
- PR #4 merged as `61524b1`; production deployment `5540163108` completed successfully.
- A production synthetic-session probe returned access 200 before invalidation and 401 afterward; concurrent refresh returned 200/401; replay removed the family and invalidated the winner access token; refresh-only logout returned 200 and removed its session. All temporary sessions were deleted in a `finally` cleanup.

### 2026-07-21 — P1.3 authorization matrix complete

- `docs/AUTHORIZATION_MATRIX.md` covers all 97 exported API method handlers; `rg` found no Server Actions under `src`.
- The audit distinguishes authentication, role checks, site scope, ownership, entry participation, and action-specific graphics assignment rather than treating a route-level session check as authorization.
- Confirmed gaps are tracked as AUTH-01 through AUTH-08: global expansion of site roles, graphics access, unrestricted entry metadata mutation, staff private-field leakage, roleless writer claims, graphics creation without entry participation, cross-entry comment parents, and the Vercel cron method mismatch.
- P1.4 repair began from centralized, testable policies; P1.12 remains the dedicated cron transport closure.

### 2026-07-21 — P1.4 authorization repair local gate

- Added centralized site-aware and resource-aware policy functions for concrete site scope, entry participation, draft visibility, graphics actions, Manager+, and Admin+.
- Graphics signed URLs are now created only after viewer authorization. Upload and WordPress submission require the assigned graphics worker for that site or site Admin+; all other graphics actions have explicit role/ownership/participant policies.
- Entry metadata, claims, editorial transitions, bulk updates, archive approval, checklist actions, comments, team/template/user administration, and global sync/settings actions now bind authority to the affected resource scope.
- Staff API responses now use one tested visibility projection; another staff member no longer receives email, Discord ID, timezone, theme, publish/onboarding flags, or auto-approval state.
- The audit uncovered and closed AUTH-09 during implementation: direct draft child routes now apply the author-or-site-Admin+ visibility rule.
- Analytics API and CSV queries now force a one-site EIC/Operations user to that site, reject an explicitly unauthorized site, and treat full PL+QB coverage as an intentional unfiltered query.
- Local gate: 5 Vitest files / 18 tests passed; lint passed; sequential TypeScript passed; Next.js production build passed with all expected routes.

### 2026-07-21 — P1.4 authorization repair production gate

- Commit `6e9c09f` passed the Vercel preview; PR #5 merged as `c0d8530`; production deployment `5540561744` completed successfully.
- A disposable production probe created only temporary users, site roles, sessions, entries, and graphics and removed them in `finally` cleanup.
- Verified results: PL graphics could claim PL work (200) but not QB work (400); a QB outsider could not patch a PL entry (403), while its PL participant could (200); a non-writer could not claim a writer slot (400).
- Draft detail was hidden from an outsider (404) and available to its author (200). Another staff member's private API fields were withheld while the viewer's own private fields remained present.
- A PL-only admin was denied global checklist settings (403). A PL-only EIC was denied QB analytics (403) and allowed PL analytics (200).
- The corrected graphics-list check verified that a QB writer saw exactly their own QB request and not the unrelated PL request. No cleanup errors occurred.

### 2026-07-21 — P1.5 interface authorization local gate

- Server pages now derive concrete PL/QB scopes from role rows for home widgets, editing queues, staff private fields, analytics filters, settings data, and content bulk-selection capabilities.
- Entry-detail, graphics-card, graphics-drag, archive-restoration, and bulk-entry controls now use site/resource permissions that match their API routes instead of flattened roles or state alone.
- One-site administrators and analytics viewers are only offered permitted sites. Global season, sync, checklist, and recurring-generator controls require authority over both sites.
- The user editor preserves duplicate per-site role grants instead of collapsing them when a global administrator saves an unrelated change.
- Local gate: 5 Vitest files / 19 tests passed; lint passed; sequential TypeScript passed; Next.js production build passed with all expected routes. Preview, production deployment, and disposable-session UI/API probes remain before P1.5 completion.

### 2026-07-21 — P1.5 interface authorization production gate

- Commit `aba1498` passed the Vercel preview; PR #6 merged as `97374b6`; production deployment `5540869114` completed successfully.
- A disposable production probe completed 25 assertions across PL-only Admin, EIC, and Editor sessions, then removed every temporary user, role, session, entry, author assignment, and graphic without cleanup errors.
- Settings exposed only manageable PL users/site scope and omitted global Season, Sync, and Checklist tabs. Analytics carried a PL-only selector scope.
- Editing Queue and Home included the PL test entry and excluded the QB test entry. A PL Admin could view a QB staff member's public identity but did not receive that user's private email or timezone.
- The graphics API returned exactly the participant's PL request with action capabilities matching policy. The rendered page showed the permitted Flag action, omitted denied Upload/Release actions, and excluded the QB request.

### 2026-07-21 — P1.6 API contract local gate

- Added one shared JSON/query validation boundary with stable error codes: malformed JSON is distinct from schema validation, and validation issues expose only field paths and safe messages.
- Migrated all 35 JSON-body handlers away from direct `request.json()` parsing and standardized API failures on the backward-compatible `{ error, code, issues? }` envelope.
- Added bounded client-side error parsing so UI actions never render raw HTML or proxy response bodies, and sanitized WordPress, Google, storage, workbook, and database failures that cross route boundaries.
- Added strict schemas for the entries, graphics, users, teams, categories, notifications, analytics, and mixed tier query paths; malformed filters now fail clearly instead of being silently ignored.
- Static contract tests cover all API routes and their public helper boundaries. Local gate: 8 Vitest files / 32 tests passed; lint passed; TypeScript passed; Next.js production build passed with all expected routes.

### 2026-07-21 — P1.6 API contract production gate

- Commit `c21dce1` passed the Vercel preview; PR #7 merged as `c0deda9`; the Vercel production status completed successfully.
- Live unauthenticated probes verified malformed JSON as `400 INVALID_JSON`, schema failures as `400 VALIDATION_ERROR` with field-only issues, and protected access as `401 NOT_AUTHENTICATED`.
- A disposable PL-only Admin session verified a valid authenticated query (`200`), malformed list filters as `400 VALIDATION_ERROR`, and global settings denial as `403 FORBIDDEN`.
- The disposable user, role, and session rows were removed in `finally` cleanup without errors.

### 2026-07-21 — P1.7 generated database types local gate

- Replaced the loose index-signature placeholder with official Supabase TypeScript output generated from the committed `0001`–`0012` migrations.
- Added a pinned Supabase CLI, committed local project config, cross-platform generate/check script, and GitHub workflow that cold-starts the schema, rejects generated-type drift, and runs TypeScript.
- Real query typing exposed and closed hidden update/RPC/JSON mismatches in bulk entries, WordPress state/profile sync, analytics, users, and saved views without adding `any` escapes.
- A read-only OpenAPI comparison found exact parity between the migration-built schema and production: 29 definitions, matching columns, and matching RPC surface with no local-only or remote-only objects.
- Exact cold workflow passed (`db:stop` → reduced `db:start` → `db:types:check` → `db:stop`). Local gate: 8 Vitest files / 32 tests passed; generated-type check, lint, TypeScript, and Next.js production build all passed.

### 2026-07-21 — P1.7 generated database types production gate

- Commit `b001987` passed the Vercel preview and the new cold database contract job in 3m15s; PR #8 merged as `dbab5c2`; the Vercel production status completed successfully.
- A disposable global-EIC session exercised the changed runtime boundaries: analytics overview RPC and saved-view JSON create, list, update, and delete all returned HTTP 200 with expected shapes.
- The disposable view, session, role, and user rows were removed in `finally` cleanup without errors.

### 2026-07-21 — P1.8 verified database invariants local gate

- A privacy-safe, read-only production scan paged every relevant table, including 10,456 entries and 682,811 analytics rows. It found no duplicate identity/email/category/Post/session/workflow keys and no negative metrics. Three duplicate category display names are legitimate because their WordPress IDs differ, and the active season intentionally has a start with no end; neither is constrained.
- Ten incomplete checklist rows on two entries reference checklist items from an old tier. Their target tiers have no checklist items. The migration does not delete or rewrite them and does not add the still-unsatisfied cross-tier invariant; that cleanup remains a separately recoverable product decision.
- Migration `0013_verified_database_invariants.sql` adds validated identity/email/Discord, category/post, site-scoped foreign-key, season, session-token, workflow-cardinality, resolution-state, notification-event, range, and nonnegative-metric invariants. Email write paths normalize before lookup/write and recover existing WordPress-identity placeholder rows.
- Season activation now uses a service-role-only RPC. A transaction-scoped table lock serializes manual and cron activations, while the partial unique index enforces at most one active mode. A deterministic two-connection probe ended with both calls successful and exactly one final active mode.
- Cold migration reset applied `0001`–`0013`; 41 pgTAP hostile probes passed; generated types matched; Supabase database lint reported no errors; 9 Vitest files / 35 tests, ESLint, TypeScript, and the Next.js production build passed.
- Production apply is blocked on credentials, not implementation: the Supabase CLI reports no access token, `db push` has no linked database/password, the Management API requires a bearer token with database-write permission, and the service-role data key cannot perform DDL. No unsupported endpoint or privilege bypass was attempted.

### 2026-07-21 — P1.9 transactional bulk operations local gate

- Replaced the bulk-create dialog's 1–25 parallel HTTP requests with one manager-scoped endpoint and one service-role-only database transaction. Entry rows, seeded checklists, initial authors, creation audits, and recent-activity initialization now commit or roll back together. Single-entry creation uses the same transaction instead of retaining a second partial-write path.
- Replaced bulk entry update plus asynchronous per-row audit fan-out with one locked transaction. Archive, unarchive, priority, and tier changes audit real before/after values and report only changed rows; repeated no-op actions do not create false audits.
- Tier changes delete/reseed only incomplete checklist rows. If any selected entry has completed checklist work, the full selection is rejected with `409 CONFLICT`; the UI preserves selection and displays the safe error instead of deleting completion history.
- Bulk creation is now hidden from non-manager users and only offers sites the viewer can manage. Both RPCs revoke execution from public/anon/authenticated roles and grant only `service_role`.
- Migration `0014_transactional_bulk_entries.sql` passed a cold reset. Its 39 pgTAP probes deliberately inject invalid assignees, cross-site categories, duplicate authors, missing entries, bad actors/audit foreign keys, duplicate targets, and completed checklist conflicts; every rollback assertion passed. Combined database suite: 80 probes. Application gate: 10 Vitest files / 41 tests, generated-type drift check, database lint, ESLint, TypeScript, and Next.js production build passed.

### 2026-07-21 — P1.10 canonical business rules local gate

- A privacy-safe production scan paged all 10,442 entries with WordPress URLs. The canonical matcher indexed 10,441 article paths, intentionally excluded one site-root URL, and found zero ambiguous paths. Production has no Raptive revenue rows yet, so historical-file shape validation remains one of Nick's final real-input actions.
- GA4 sync, Raptive matching, and the standalone GA4 backfill now share one hostless-path normalizer and one collision-refusing entry index. Full, protocol-relative, bare-host, absolute-path, relative-path, query, fragment, trailing-slash, encoded, malformed-percent, root, and cross-site collision inputs have regression coverage.
- Six WordPress callers now share one typed site-configuration and Basic-auth module, including optional-QB availability. Login, profile updates, and WordPress user import now share one email normalizer.
- No legacy URL, WordPress-config, Basic-auth, or duplicate email-normalization helper remains. Application gate: 13 Vitest files / 60 tests, ESLint, TypeScript, and the Next.js production build passed.
- Commit `65a211f` is packaged in green draft PR #11; its Vercel preview completed successfully. The database-type workflow correctly did not run because P1.10 changes no migration, schema, generated type, package lock, or workflow input.

### 2026-07-21 — P1.11 display-name override local gate

- A privacy-safe production scan found two WordPress-linked users and one active `display_name_override`; no names, emails, IDs, or credentials were emitted. The protected user's WordPress profile was unavailable through the configured admin read path, so the database override flag remains authoritative.
- Login, admin WP import, self/admin manual resync, and scheduled profile sync now share one existing-user profile-update builder. When the override flag is true, the update omits `display_name` entirely while still refreshing bio, avatar, and sync time. New-user creation still seeds the WordPress name.
- Manual WP import now reports a database update failure instead of returning false success. The profile UI explains that WordPress refresh preserves a locally saved display name.
- Pure behavior and caller-contract regressions cover protected/unprotected names, blank remote names, empty profile fields, non-name changes, and all four existing-user paths. Application gate: 14 Vitest files / 69 tests, ESLint, TypeScript, and the Next.js production build passed.

### 2026-07-21 — P1.12 cron method/auth sub-gate

- Vercel's current official cron contract uses production `GET` requests, sends `CRON_SECRET` as a bearer token, does not automatically retry failures, and can deliver overlapping or duplicate invocations. The previous eight POST-only routes therefore returned 405 to every configured schedule.
- Every path in `vercel.json` now exports the same handler as `GET` for Vercel and `POST` for the existing admin UI. One shared authorization boundary accepts only the exact cron bearer secret or a current admin+ session with both-site scope.
- A configuration-driven contract test reads every committed Vercel cron path and requires both methods plus the shared authorization call. Targeted test: 8/8 route contracts; ESLint and TypeScript pass.
- P1.12 remains open: serverless-safe overlap leases, persisted run outcomes, bounded retry semantics, and atomic notification delivery deduplication still require implementation and hostile/concurrent verification.

### 2026-07-21 — P1.12 cron execution-control sub-gate

- Migration `0015_cron_execution_control.sql` adds a private, RLS-enabled run ledger plus service-role-only claim/finish functions. Claims serialize by job using a transaction advisory lock, refuse active overlap, collapse successful duplicate windows, recover expired leases, and bound a failed window to three attempts.
- Every configured job now claims before running and persists its safe JSON outcome, HTTP failure class, timestamps, source, attempt, and lease state. Claim or finish failures return a safe 503 instead of silently running without control or reporting success without an audit row.
- Cold migration reset applied `0001`–`0015`. The database suite passes 102 pgTAP probes, including 22 new privilege, state, duplicate, overlap, retry, exhausted-attempt, expired-lease, and hostile-input assertions. Generated types include the ledger and both RPCs.
- A two-connection filesystem-independent probe held the first claim transaction open; the second claimant blocked and then returned `overlap`. Application regressions cover unavailable control, duplicate/overlap/exhaustion no-ops, success/failure persistence, finish failure, and exception redaction.
- Reminder jobs now use database-enforced per-recipient keys instead of check-then-insert races. A partial unclaimed-alert attempt can retry missing managers without suppressing them, and site-only managers no longer receive the other site's alerts. Unique-key behavior, null-key compatibility, hostile keys, caller wiring, and PL/QB/both recipient selection are covered.
- Final P1.12 gate: cold reset through `0015`; 105 pgTAP probes; real two-connection overlap probe; generated-type drift and database lint clean; 17 Vitest files / 88 tests; ESLint, TypeScript, and production build pass. Actual email/Discord delivery remains intentionally outside this claim because those adapters are still stubs tracked by P1.15.

### 2026-07-21 — P1.13 database and private-storage boundary gate

- Catalog inspection found two server-only privilege drifts: the new `cron_runs` table was not forced through RLS, and public functions still inherited execution from `PUBLIC`. Migration `0016_reassert_server_only_data_boundary.sql` reasserts enabled and forced RLS for every public table, removes direct anon/authenticated table and function privileges, and preserves service-role function execution.
- A clean-database reset exposed a second drift: earlier migrations only updated an already-existing `graphics` bucket. Migration `0016` now idempotently creates or updates the exact private bucket with a 10 MB limit and the image MIME allowlist. The reset through `0016`, database lint, generated-type drift check, and all 120 pgTAP probes pass.
- Runtime denial probes verified all 30 public tables and three representative server-only RPCs reject the anonymous role. The source boundary contains no browser Supabase client or public-object URL call; signing remains in server-only modules after resource authorization.
- A disposable production object probe verified upload, public denial (HTTP 400), signed read (HTTP 200), expiry denial (HTTP 400), and cleanup without emitting object paths or tokens. The one historical expiring signed URL stored in `graphic_requests.file_url` is cleared by migration; new uploads persist only the durable private path and mint bounded-lifetime URLs on authorized reads.
- Final local P1.13 gate: 18 Vitest files / 98 tests; 120 pgTAP probes; anonymous table/RPC denial; disposable production private-object lifecycle; database lint and generated-type drift clean; ESLint, TypeScript, and production build pass.

### 2026-07-21 — P1.14 dependency and dead-capability gate

- The current registry audit began at 12 findings: 5 high, 6 moderate, and 1 low. Next and its matching ESLint config moved from `16.2.3` to `16.2.11`; vulnerable transitive packages moved to patched versions, and a narrow PostCSS override replaces Next's stale nested pin with `8.5.21`.
- Removed 13 unused runtime packages plus the unused bcrypt type package. This deletes the dormant form, UI, alternate Supabase-client, virtualization, bcrypt, Discord, email, and toast dependency trees; source inspection confirmed the Discord and email SDKs were referenced only in comments around the still-stubbed P1.15 delivery behavior.
- A fresh `npm ci` succeeds and the full production/development `npm audit` reports zero vulnerabilities. The unused-dependency scan is empty for runtime packages; its only development false positives are the Tailwind/PostCSS build packages directly consumed by `postcss.config.mjs`, `globals.css`, and the security override.
- Final local P1.14 gate: clean install; zero audit findings; 18 Vitest files / 98 tests; ESLint, TypeScript, generated database-type drift, and the Next.js 16.2.11 production build pass.

### 2026-07-21 — P1.15 honest in-app notification boundary

- The only unfinished settings behavior was external notification delivery. Both adapters logged and returned success without sending, allowing `discord_sent` or `email_sent` to become true. A privacy-safe production count found zero stored Discord IDs, zero external-channel preferences, seven notification rows, and one falsely marked external delivery, so removal does not discard configured behavior.
- The supported notification system is now explicitly in-app only. Removed the external toggles, profile identifier, environment contract, SDK stubs, external delivery flags, misleading UI labels, and unused action-path plumbing; the preferences API strictly rejects legacy external-channel fields.
- Migration `0017_remove_unsupported_notification_channels.sql` removes the dormant user identifier, external preference columns, and false delivery-status columns. Generated database types match the reduced schema, and five pgTAP assertions prevent those fields from returning.
- Final local P1.15 gate: cold reset through `0017`; 124 pgTAP probes; 19 Vitest files / 100 tests; zero audit findings; database-type drift, ESLint, TypeScript, and the Next.js production build pass.

### 2026-07-21 — P1.16 Phase 1 regression-coverage gate

- Added `docs/PHASE1_REGRESSION_MATRIX.md`, mapping every Phase 1 repair to its durable application, database, generated-type, audit, or workflow check and distinguishing live probes from automated regressions.
- The authorization inventory now has executable drift protection: all 106 exported API method/path pairs must appear in `docs/AUTHORIZATION_MATRIX.md`. The matrix was brought current for Vercel GET cron handlers and transactional bulk create.
- Closed the last stated authorization test gap with a data-layer negative regression proving a same-site outsider cannot create a graphic request and is rejected before any database access. Confirmed cross-entry comment parents were already enforced more strongly by a composite foreign key and hostile pgTAP insert; corrected the stale matrix note.
- Final Phase 1 local gate: cold reset through `0017`; 124 pgTAP probes; database lint clean; 21 Vitest files / 102 tests; generated database-type drift clean; zero audit findings; ESLint, TypeScript, and the Next.js 16.2.11 production build pass.

### 2026-07-21 — P2.1 test-architecture gate

- Split Vitest into explicit unit, cross-module integration, API-handler, and jsdom component projects. Added Testing Library user-event coverage for the real login form and request/response coverage for the real current-user route; all 23 files / 106 tests pass together and each lane passes independently.
- Added V8 coverage over application libraries and API routes with text, JSON, and HTML reports. The first honest baseline is 5.69% statements, 5.96% branches, 9.45% functions, and 5.84% lines; P2.1 records the gap without inventing a percentage gate before P2.2–P2.8 add domain coverage.
- Added an ownership-aware Supabase runner for the five pgTAP files. It preserves an already-running developer stack and otherwise owns startup/cleanup; all 124 database assertions pass and the owned stack stops cleanly.
- Added Playwright Chromium architecture with synthetic environment values, an external-base-URL escape hatch, and three non-mutating anonymous navigation/API boundary checks. The committed suite passes, the server lifecycle closes port 3100, and an independent annotated-browser inspection found meaningful login content, expected interactive controls, and no Next error overlay.
- `docs/TEST_ARCHITECTURE.md` defines test placement and boundary rules. Full GitHub Actions enforcement remains deliberately scoped to P2.9.

### 2026-07-21 — P2.2 identity and authorization test gate

- The authentication audit found and repaired two authority drifts: login accepted any valid WordPress account without enforcing the documented staff-role allowlist, and a new WordPress `author` was promoted to dashboard `editor` instead of the canonical `writer` mapping used by manual import. Login now uses the same `isStaffWpUser` and `wpRoleToDashboardRole` rules as the import path.
- Added route-level API contracts for login, refresh, logout, and current-user resolution. They cover validation-before-authentication, safe failure envelopes, missing/invalid/stale credentials, every refresh outcome, successful rotation, refresh-backed logout, family deduplication, revocation failure cleanup, live access-hash checks, and role-row projection.
- Added an exhaustive seven-role hierarchy/site table plus both-site scope, checklist participation, draft visibility, graphics assignment, and cross-site negative cases. Added exact-team-manager API coverage proving cross-site admins, managers of another team, and single-site managers of a both-site team cannot mutate membership.
- Final gate: 29 Vitest files / 146 tests (114 unit, eight integration, 22 API, and two component); coverage increased from the P2.1 baseline to 8.77% statements, 8.89% branches, 13.12% functions, and 9% lines. All 124 pgTAP assertions, zero-vulnerability audit, ESLint, TypeScript, production build, and three Chromium boundary tests pass; owned database and browser servers stop cleanly.

### 2026-07-21 — P2.3 WordPress reconciliation test gate

- The only implemented inbound WordPress architecture is authenticated scheduled/manual polling; there is no webhook route or webhook claim to test. The audit found two polling data-loss hazards: posts fetched only the first 100 changed rows before advancing the watermark, and a later-page category failure retained a partial snapshot that could falsely deactivate unseen categories.
- Added one all-or-nothing WordPress pagination contract shared by post and category sync. It fetches every advertised page and discards partial rows on HTTP, network, shape, or JSON failure. Post reconciliation now withholds its watermark after any row failure, so the next bounded run retries the same window; successful rows remain idempotent through the existing `(site, wp_post_id)` identity.
- Category reconciliation now counts only successful writes and records safe per-row create/update/refresh/deactivation failures. Post, profile, and category cron tasks return 502 on incomplete reports so the existing cron execution controller records failure instead of a false success.
- Added coverage for multi-page aggregation, partial-page refusal, invalid/network outcomes, post-watermark retention, category no-mutation/write accounting, PL-to-QB profile fallback, missing users, local display-name conflict preservation, and cron success/failure translation.
- Final gate: 34 Vitest files / 158 tests; coverage increased to 11.81% statements, 10.25% branches, 15.81% functions, and 12.19% lines. All 124 pgTAP assertions, zero-vulnerability audit, ESLint, TypeScript, production build, and three Chromium boundary tests pass; owned database and browser servers stop cleanly.

### 2026-07-21 — P2.4 transactional editorial workflow gate

- The editorial audit found read-then-write races in writer claims, approvals/denials, editor claims, and content/editor state changes. Competing requests could both pass stale preconditions, write contradictory claim/assignment state, duplicate audit effects, or report success after a uniqueness error. Non-status entry edits also read their audit before-state outside the write transaction.
- Migration `0018_transactional_editorial_workflows.sql` moves writer-claim creation/resolution, assignment, editorial transitions, field edits, and their audit rows into service-role-only row-locking RPCs. Checklist and graphics gates are repeated inside the state transaction; one editor and one primary writer remain database-enforced. WordPress drafts, notifications, comments, and recent activity run only after the authoritative transaction commits.
- Closed two adjacent authority/data-contract defects: self-approval now requires manager authority for the entry's exact site rather than any global manager role, and claim endpoints distinguish invalid input (400), authority failure (403), missing resources (404), concurrent state conflict (409), and database failure (500).
- Added a publish-deadline coherence constraint plus paired Zod validation, so timestamp and precision cannot be torn. Transactional field updates serialize concurrent before-state reads and audit the committed old/new values. Single-entry tier changes now use the same completed-checklist guard and atomic checklist reseed as bulk tier changes. Existing transactional bulk-create/update pgTAP coverage remains the bulk-action proof.
- Added deterministic two-session database concurrency coverage: worker one locks and claims an entry, worker two blocks on the same row, then re-checks committed state and fails with `entry_not_claimable`; exactly one claim remains. Claims, approvals, denials, auto-approval, writer submission/resubmission, polishing, editor claiming, graphic/checklist gates, idempotent edited state, deadlines, privileges, audits, tier reseeding, and negative races are covered by 67 new pgTAP assertions.
- Final gate: 38 Vitest files / 178 tests; coverage increased to 14.68% statements, 12.69% branches, 18.16% functions, and 15.21% lines. All 191 pgTAP assertions, generated database-type drift, zero-vulnerability audit, ESLint, TypeScript, the Next.js 16.2.11 production build, and three Chromium anonymous-boundary tests pass.

### 2026-07-21 — P2.5 transactional graphics workflow gate

- The graphics audit found destructive replacement ordering, read-then-write claim/review races, duplicate concurrent WordPress uploads, no durable version history, browser-MIME-only validation, same-millisecond path collisions, and an unvalidated WordPress media response. Submit retries also re-uploaded media despite comments promising reuse.
- Migration `0019_transactional_graphic_versions.sql` adds private immutable upload versions, current/rejected-version pointers, a submission lease, retryable WordPress media checkpoints, service-role-only row-locking RPCs, and one-featured-graphic-per-entry enforcement. Upload metadata commits before any old object can be discarded; request deletion returns every immutable path for best-effort storage cleanup.
- Claims, review transitions, uploads, media checkpoints, completion, and deletion now re-check authoritative state under database locks. A rejected version cannot be cleared by its artist until a newer version exists. Same-entry completions serialize on the parent entry before locking individual requests, preventing the cross-request deadlock while retaining one final featured winner.
- Uploads validate PNG, JPEG, GIF, or WebP magic bytes, use UUID-backed immutable paths, and reject stale metadata writes while deleting only the losing new object. WordPress filenames are header-safe, media JSON and IDs are validated, and a retry reuses a checkpointed media ID rather than creating a duplicate library object. Graphics mutation routes now distinguish validation, authorization, missing-resource, concurrency, upstream, and database failures with 400/403/404/409/502/500 responses.
- Deterministic two-session database probes cover competing submission leases and two different same-entry completions. Focused application tests cover signature spoofing, path uniqueness, version cleanup, unauthorized history signing, stale upload cleanup, WordPress response hardening, media checkpoint ordering, retry reuse, lease release, audit behavior, and notification suppression after failure.
- Final gate: 43 Vitest files / 199 tests; coverage increased to 17.04% statements, 14.95% branches, 20% functions, and 17.76% lines. All 257 pgTAP assertions, generated database-type drift, authorization-matrix parity for 107 handlers, zero-vulnerability audit, ESLint, TypeScript, the Next.js 16.2.11 production build, and three Chromium anonymous-boundary tests pass.

### 2026-07-21 — P2.6 Vercel-shaped cron invocation gate

- Vercel's current official contract was rechecked on 2026-07-21: production Cron Jobs issue `GET`, automatically send `Authorization: Bearer $CRON_SECRET`, identify themselves with `User-Agent: vercel-cron/1.0`, and include the configured expression in `x-vercel-cron-schedule`. Delivery is best effort, failures are not retried by Vercel, duplicates/overlaps can occur, and redirects are not followed. Sources: [Cron Jobs](https://vercel.com/docs/cron-jobs) and [Managing Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs).
- Added request-level coverage for all eight committed `vercel.json` paths. Each real `GET` handler receives its exact committed schedule plus the Vercel user agent and bearer shape, reaches execution control as source `vercel`, and passes the expected job name/interval. Every route rejects a near-miss secret before task execution; a representative authenticated `POST` remains a separate both-site-admin manual run.
- The schedule contract test now rejects unsupported field counts, named month/day tokens, and simultaneous day-of-month/day-of-week restrictions. The existing database ledger remains the duplicate, overlap, expired-lease, bounded-retry, and outcome source of truth; its deterministic two-connection overlap proof remains green.
- The audit found one execution-control failure defect: a transport rejection while finishing a successful task fell into the task-exception handler and attempted to finish the same run again as failed. Claim and finish transports now fail closed with safe 503 responses, task failures are isolated from ledger failures, and each claimed run gets at most one finish attempt per invocation.
- Final gate: 44 Vitest files / 222 tests; coverage increased to 18.25% statements, 15.58% branches, 21.12% functions, and 19.06% lines. All 257 pgTAP assertions, generated database-type drift, zero-vulnerability audit, ESLint, TypeScript, the Next.js 16.2.11 production build, and three Chromium anonymous-boundary tests pass.

### 2026-07-21 — P2.7 transactional Raptive importer gate

- Added genuine generated XLSX fixtures covering metadata sheets, shifted headers, multiple data sheets, alternate Raptive column labels, Excel dates, US and ISO dates, currency strings, corrupt files, non-data workbooks, and 20,000 data rows. Every sheet with the required Date, Page URL, and Earnings columns is parsed; unsupported or malformed rows are counted with sheet and Excel-row diagnostics instead of silently becoming zero or disappearing.
- Date plus canonical hostless path is the import identity. Exact duplicates collapse with a visible count, while conflicting duplicates fail the workbook rather than choosing a silent winner. This synthetic contract does not assert that PL and QB can never share a path; Nick's real workbook remains required in P6.1/P7 to verify actual sheet roles, URL domains, timezone, aggregation, and deduplication semantics.
- The upload boundary now accepts XLSX only, validates the ZIP signature, rejects empty or over-10-MB files, bounds the filename, and exposes parsed-sheet, duplicate, and rejected-row summaries. Preview remains available for malformed workbooks, but commit is blocked until every rejected row is resolved.
- Migration `0020_transactional_raptive_import.sql` replaces the delete-plus-chunk sequence with one service-role-only database transaction. Range deletion, every revenue insert, and upload history either all commit or all roll back. A late-row constraint failure is proven to restore the old range, leave no partial new rows, and write no false-success history; interrupted RPC transport returns one safe failure.
- Final gate: 46 Vitest files / 232 tests; coverage increased to 21.12% statements, 18.9% branches, 23.07% functions, and 21.97% lines. All 268 pgTAP assertions, generated database-type drift, database lint, zero-vulnerability audit, ESLint, TypeScript, the Next.js 16.2.11 production build, and three Chromium anonymous-boundary tests pass.
- Residual production architecture is explicit: the request still buffers one bounded 10-MB workbook and has a 60-second execution ceiling; there is no durable import job, checkpoint, resumable upload, or restart model. P6 remains responsible for the real-file contract and a durable production ingestion architecture where its measured size/runtime requires one.

### 2026-07-21 — P2.8 database-backed role-journey gate

- Replaced the anonymous-only browser boundary with isolated, real local role sessions. The harness reuses an existing Supabase stack or owns its start/stop lifecycle, extracts only the local development service key, seeds five synthetic actors and independent workflow records, and removes every actor, session, entry, claim, notification, and graphic fixture after the run. External-base-URL runs skip all mutating role fixtures.
- Five parallel Chromium journeys now prove user-visible work at the real Next/API/database boundaries: a writer submits assigned content and is redirected away from the editing queue; a manager approves a pending writer claim; an editor claims and completes an edit; graphics staff claims an open request without upload/WordPress effects; and a both-site administrator reaches global administration while revenue Analytics remains withheld from the admin role.
- The journeys exposed a broken deep-link contract: Home, My Tasks, Editing Queue, and graphics surfaces linked to `/content?entry=...`, but Content ignored the query parameter. Next 16's promise-based `searchParams` page prop now seeds the expanded detail state, including a standalone authorized detail panel when the target is outside the current 100-row table page.
- The first cold PostgREST-backed run exposed a release-blocking privilege defect. Migration `0016` revoked client roles correctly but never granted ordinary table privileges to `service_role`; bypassing RLS does not bypass SQL grants, so the server-only client could not read even `tiers`. Migration `0021_restore_service_role_table_access.sql` grants current and future public tables/sequences only to service_role while anon/authenticated stay revoked and forced RLS stays intact. A real local PostgREST probe succeeds after cold reset.
- Final gate: 46 Vitest files / 232 tests; coverage remains 21.12% statements, 18.9% branches, 23.07% functions, and 21.97% lines. All 274 pgTAP assertions, generated database-type drift, database lint, zero-vulnerability audit, ESLint, TypeScript, the Next.js 16.2.11 production build, and eight Chromium tests pass. An independent live browser inspection confirmed meaningful login content and no framework error overlay.

### 2026-07-21 — P2.9 complete GitHub Actions gate

- Expanded the path-filtered database-type workflow into four independent `ubuntu-latest` jobs on every pull request, every `main` push, and manual dispatch. Superseded runs cancel by pull request or branch, repository permissions are read-only, every job uses Node 20 plus `npm ci`, and no production credential is required.
- The Application job enforces ESLint, TypeScript, all 46 Vitest files / 232 tests with the recorded V8 coverage report, and the Next.js 16.2.11 production build. Dependencies audits the complete production/development lockfile at the low-severity threshold. Coverage is retained for seven days.
- The Database job builds a clean local Supabase instance through migration `0021`, runs all nine files / 274 pgTAP assertions, rejects generated database-type drift, fails on database-lint warnings, and always stops its stack. The Browser job installs Chromium and Linux dependencies, starts Supabase before Playwright's web-server timeout, runs all eight anonymous/authenticated journeys, retains failure evidence, and always stops its stack.
- The first clean Browser runner proved a CI-only lifecycle defect: public-ECR throttling and first-pull time consumed Playwright's 120-second Next-server window before tests began. Moving Supabase startup into its own workflow step fixed the boundary. Corrected run [29864580610](https://github.com/BeardedBats/pl-staff-dashboard/actions/runs/29864580610) passed Application, Database, Dependencies, and all eight Browser journeys; Vercel also passed and draft PR #26 is merge-clean.
- Local verification independently passed actionlint 1.7.12, a clean locked install, zero-vulnerability audit, ESLint, TypeScript, the production build, 232 Vitest tests, 274 pgTAP assertions, generated-type drift, warning-failing database lint, and eight Chromium journeys. Browser teardown left zero synthetic users/entries, no auth-state directory, and no port-3100 listener.
- GitHub returned 403 for both branch-protection and repository-ruleset APIs because the repository is private on the current account plan. The complete checks therefore run and report on every pull request and `main` push but cannot be configured as merge-required until the repository becomes public or the plan is upgraded; this platform limitation is documented without treating the checks as hard merge prevention.

## Phase 0 prioritized defect and risk inventory

1. **High — session lifecycle (P1.1, P1.2, P1.16):** refresh rotation reads then unconditionally updates, so concurrent reuse can succeed; access-token resolution does not verify the sessions row or token hash; logout relies on a valid access token and can leave a refresh session alive.
2. **High — graphics authorization (P1.3, P1.4, P1.13, P1.16):** authenticated users can list/fetch all requests; upload and submit paths verify existence/state but not role, assignment, entry membership, or ownership; several mutations lack resource authorization.
3. **High — scheduled jobs do not match Vercel (P1.12, P2.6):** all eight configured cron handlers export POST while Vercel invokes configured cron paths with GET, so scheduled execution receives 405.
4. **High — dependency vulnerabilities (P1.14):** production audit reports 3 high and 6 moderate vulnerabilities across Next.js, Discord/Undici/WebSocket, PostCSS, Resend/Svix/UUID chains.
5. **Medium — CI checks are advisory at merge (P2.9):** complete Application, Database, Dependencies, and Browser jobs now run on every pull request and `main` push. The private repository's current account plan does not expose branch protection or rulesets, so GitHub cannot make those green checks merge-required until the repository becomes public or the plan is upgraded.
6. **High — Raptive production ingestion remains incomplete (P6.1–P6.15):** P2.7 now parses every qualifying sheet, rejects malformed/conflicting rows, bounds uploads to 10 MB, and commits range replacement atomically. The route still buffers the workbook inside a 60-second request and has no durable job/checkpoint/restart model; the real Raptive workbook contract and measured runtime remain unverified until Nick's final input.
7. **Medium — profile overrides are inconsistent (P1.11):** scheduled profile sync honors `display_name_override`, but login, manual import, and manual resync overwrite the name without honoring the flag.
8. **Medium — database typing is placeholder-only (P1.7):** every table, view, function, enum, and composite resolves through `any`, so current TypeScript success does not prove schema compatibility.
9. **Medium — bulk work is not atomic (P1.9):** bulk create fires up to 25 independent client requests; bulk update writes entries and audit rows in separate operations, allowing partial audit/data state.
10. **Medium — environment drift and access gaps (P0.7, P0.9, P1.13, P2.11):** committed migrations did not guarantee live bucket state, current RLS catalog state cannot be queried with available access, Vercel settings/env cannot be audited through the current token, and plaintext outer-workspace credential copies cannot be safely rotated yet.

Phase 0 implementation gate: **PASS WITH ACCESS-GATED DEFERMENTS.** Source, Git, deployment, environment names, database surface, WordPress capability, storage behavior, and reproducible build baseline are established. P0.7 and the role-specific part of P0.9 stay visibly blocked and must close before the final Phase 7 gate.

### 2026-07-21 — P1.1 session lifecycle implementation

- Added unique JWT IDs and pinned HS256 verification so repeated issuance for one user/session in the same second still creates distinct credentials.
- Added a session repository with an atomic refresh-hash compare-and-swap, token-family revocation on simultaneous or later replay, live access-hash/session validation, and scoped revocation.
- Login now inserts one final token family under a pre-generated session ID; no placeholder session/hash window remains.
- Logout checks both signed cookies, so an expired/missing access token cannot leave a valid refresh session behind.
- Added Vitest 4.1.10 and 5 tests covering unique issuance, deterministic concurrent reuse, later replay, expiry, and access revocation.
- A temporary-row live Supabase probe produced exactly 1 compare-and-swap winner and 1 loser, with no errors; the row was deleted in `finally`.
- Current local gate: 2 test files / 5 tests pass; lint passes; production build passes; TypeScript passes when run after the build. A parallel build/type-check attempt caused a transient `.next/types/routes.js` generation collision and is not treated as a product failure.
- Remaining before P1.1/P1.2 completion: preview, production deployment, and synthetic-session live HTTP probes for access invalidation, concurrent refresh, and refresh-backed logout.
