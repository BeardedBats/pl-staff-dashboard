# Pitcher List Staff Content Dashboard — Production Readiness

Last updated: 2026-07-21

## Recovery state

- Current phase: Phase 1 — Security, correctness, and data integrity
- Current action: P1.5 — Reconcile navigation and server page access with backend policies
- Branch: `codex/production-readiness`
- HEAD: `c0d853036a4ecf7fc73d389fef78898b4659d480`
- Upstream baseline: `origin/main` at the same merge commit after PR #5.
- Deployment: production deployment `5540561744` completed successfully from `c0d8530` on 2026-07-21. A separate unmerged documentation PR has a preview and is excluded from this project baseline.
- Known blockers: Vercel project-management access is unavailable; Supabase management CLI access is unavailable; no safe dashboard test-user session is available for live role navigation. These do not block local security implementation and are deferred until their dependent live gates.
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
- [ ] P1.5 Reconcile navigation visibility with backend permissions so users never see inaccessible areas or gain access through hidden routes. — IN PROGRESS
- [ ] P1.6 Standardize request and response validation using shared schemas and safe, user-facing error handling.
- [ ] P1.7 Replace placeholder database types and restore generated typing or an equally reliable typed schema workflow.
- [ ] P1.8 Add verified database constraints for identity, email, categories, season state, uniqueness, foreign keys, and other discovered invariants.
- [ ] P1.9 Make bulk operations genuinely bulk and transactional instead of issuing fragile client-side request loops.
- [ ] P1.10 Consolidate duplicate URL normalization and other duplicated business rules into tested canonical modules.
- [ ] P1.11 Fix staff name/display-name synchronization so intentional overrides survive login and manual resynchronization.
- [ ] P1.12 Correct cron request methods, authentication, idempotency, overlap protection, retry behavior, and observability.
- [ ] P1.13 Verify and repair RLS policies, private-bucket rules, signed URL behavior, and server/client data boundaries.
- [ ] P1.14 Upgrade vulnerable dependencies and remove unused dependencies or dead capabilities.
- [ ] P1.15 Either implement unfinished notification/settings behavior or remove misleading UI, types, tables, and code paths.
- [ ] P1.16 Add regression tests for every repaired security or integrity defect.

Gate: no known high-severity authorization, session, secret, RLS, cron, or data-integrity defect remains.

## Phase 2 — Test system, CI, observability, and operational safety

- [ ] P2.1 Establish a practical unit, integration, database, API, and browser-test architecture.
- [ ] P2.2 Test authentication, session rotation, role permissions, membership boundaries, and negative authorization cases.
- [ ] P2.3 Test WordPress synchronization, webhooks, scheduled reconciliation, conflict handling, retries, and idempotency.
- [ ] P2.4 Test editorial claims, assignments, state transitions, bulk actions, deadlines, and concurrent operations.
- [ ] P2.5 Test graphics submission, review, versioning, authorization, and storage behavior.
- [ ] P2.6 Test cron jobs with the same method and headers used by Vercel.
- [ ] P2.7 Add representative Raptive importer tests with multi-sheet fixtures, duplicates, malformed rows, interruptions, and large files.
- [ ] P2.8 Add role-based end-to-end journeys for managers, writers, editors, graphics staff, and administrators.
- [ ] P2.9 Add GitHub Actions for install, lint, type checking, tests, build, migration checks, dependency checks, and browser tests where appropriate.
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

## Phase 0 prioritized defect and risk inventory

1. **High — session lifecycle (P1.1, P1.2, P1.16):** refresh rotation reads then unconditionally updates, so concurrent reuse can succeed; access-token resolution does not verify the sessions row or token hash; logout relies on a valid access token and can leave a refresh session alive.
2. **High — graphics authorization (P1.3, P1.4, P1.13, P1.16):** authenticated users can list/fetch all requests; upload and submit paths verify existence/state but not role, assignment, entry membership, or ownership; several mutations lack resource authorization.
3. **High — scheduled jobs do not match Vercel (P1.12, P2.6):** all eight configured cron handlers export POST while Vercel invokes configured cron paths with GET, so scheduled execution receives 405.
4. **High — dependency vulnerabilities (P1.14):** production audit reports 3 high and 6 moderate vulnerabilities across Next.js, Discord/Undici/WebSocket, PostCSS, Resend/Svix/UUID chains.
5. **High — no automated proof (P2.1–P2.9):** there are no meaningful test scripts, no test files discovered, and no GitHub Actions workflows; only lint, TypeScript, build, and Vercel deployment checks exist.
6. **High — Raptive architecture is not production-safe (P2.7, P6.1–P6.15):** the route buffers the entire workbook in a 60-second request, parses only `SheetNames[0]`, deletes a whole date range before non-transactional chunk inserts, and has no durable job/checkpoint/restart model.
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
