# Pitcher List Staff Content Dashboard — Production Readiness

Last updated: 2026-07-22

## Recovery state

- Current phase: Phase 7 — release candidate, production deployment, and Raptive handoff
- Current action: publish the release-candidate exact head for one GitHub CI run and one Vercel preview.
- Branch: `codex/production-readiness-p7`
- Stack base: `9115bd6` (combined Phase 4 exact head on green draft PR #40, based on the completed Phase 3 stack).
- Upstream baseline: `origin/main` at merge commit `dbab5c2` after PR #8.
- Deployment: Vercel production status completed successfully from `dbab5c2` on 2026-07-21 (`HLrWTph5hnSf2yf2yN6aNAtYR6Kq`).
- Known blocker: production application of the ordered migrations through `0026` requires either a Supabase personal/fine-grained token with database-write permission or the hosted Postgres password/connection URL. Neither is available. This is a deployment blocker, not unfinished local development; Nick does not need to apply it now. QB WordPress remains unconfigured.
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

Phase 1 gate status: **LOCAL PASS; PRODUCTION RELEASE BLOCKED ONLY ON THE DOCUMENTED SUPABASE DDL ACCESS FOR THE STACKED MIGRATIONS 0013–0022.**

## Phase 2 — Test system, CI, observability, and operational safety

- [x] P2.1 Establish a practical unit, integration, database, API, and browser-test architecture.
- [x] P2.2 Test authentication, session rotation, role permissions, membership boundaries, and negative authorization cases.
- [x] P2.3 Test WordPress scheduled/manual reconciliation, missed-update recovery, retries, idempotency, stale/error states, and resource boundaries.
- [x] P2.4 Test editorial claims, assignments, state transitions, bulk actions, deadlines, and concurrent operations.
- [x] P2.5 Test graphics submission, review, versioning, authorization, and storage behavior.
- [x] P2.6 Test cron jobs with the same method and headers used by Vercel.
- [x] P2.7 Add representative Raptive importer tests with multi-sheet fixtures, duplicates, malformed rows, interruptions, and large files.
- [x] P2.8 Add role-based end-to-end journeys for managers, writers, editors, graphics staff, and administrators.
- [x] P2.9 Add GitHub Actions for install, lint, type checking, tests, build, migration checks, dependency checks, and browser tests where appropriate.
- [x] P2.10 Add structured logs, safe error reporting, cron freshness, integration health, import-job visibility, and actionable alerts.
- [x] P2.11 Add backup, migration, rollback, incident, secret-rotation, and deployment runbooks.
- [x] P2.12 Establish measurable performance and accessibility baselines.

Gate: a clean checkout can prove correctness in CI, and production failures are detectable and diagnosable without reading raw infrastructure logs.

## Phase 3 — PLPD design-system foundation

- [x] P3.1 Convert the guide's canonical colors, typography, spacing, gradients, shadows, borders, mesh, and semantic styles into centralized application tokens.
- [x] P3.2 Implement reusable PLPD primitives for navigation, headers, tabs, buttons, fields, dropdowns, cards, chips, tables, pagination, alerts, dialogs, drawers, loading states, empty states, errors, and gated values.
- [x] P3.3 Apply Work Sans to data and DM Sans to application chrome as defined by the guide.
- [x] P3.4 Preserve the subtle-glass-over-mesh doctrine without opaque panels or heavy frosted glass.
- [x] P3.5 Implement all required component states: default, hover, active, loading, error, empty, and gated.
- [x] P3.6 Ensure gated data is withheld on the server rather than sent to the client and visually blurred.
- [x] P3.7 Bring tables, numeric alignment, zero styling, row fills, hover behavior, pagination, and data colors into exact guide compliance.
- [x] P3.8 Remove Never List violations.
- [x] P3.9 Create responsive desktop, tablet, and mobile behavior without inventing new brand colors or visual language.
- [x] P3.10 Add automated accessibility checks and keyboard/focus verification.
- [x] P3.11 Establish screenshot or visual-regression coverage for shared primitives and representative pages.

Gate: new feature work can be built entirely from verified PLPD primitives.

## Phase 4 — Role-focused workflow and usability

- [x] P4.1 Create a useful Today home screen.
- [x] P4.2 Add global search and fast filtering.
- [x] P4.3 Present plain-language status and a recommended next action.
- [x] P4.4 Add role-based onboarding and setup checklists.
- [x] P4.5 Cover loading, empty, partial, stale, success, and error states.
- [x] P4.6 Build a manager control center.
- [x] P4.7 Add useful saved views and presets.
- [x] P4.8 Add a concise weekly operational digest.
- [x] P4.9 Add safe bulk actions.
- [x] P4.10 Build a focused My Work view.
- [x] P4.11 Make availability and capacity visible without employee surveillance.
- [x] P4.12 Present polishing requests as actionable feedback.
- [x] P4.13 Add risk-first editor queues, SLA indicators, bulk actions, and saved queues.
- [x] P4.14 Add polishing-reason templates and a readiness panel.
- [x] P4.15 Preserve editorial handoff and state-transition history.
- [x] P4.16 Capture complete graphics-request requirements.
- [x] P4.17 Add asset versioning and Submit, Approve, and Request Changes states.
- [x] P4.18 Add an asset library with usage and featured-image status.
- [x] P4.19 Restrict graphics users to relevant information and actions.
- [x] P4.20 Implement real supported notification delivery or remove unsupported choices.
- [x] P4.21 Add digests, quiet hours, timezone delivery, retry status, and delivery health.
- [x] P4.22 Add an understandable system-health page.

Gate: each role can complete primary work with minimal instruction, and managers can identify risks and decisions without raw tables.

## Phase 5 — WordPress and SEO

- [x] P5-A Complete five-minute authenticated reconciliation, watermark/idempotency/retry recovery, visible last-sync/modified/stale/error state, authorized manual refresh, correct public/admin links, and concise read-only publication readiness.
- [x] P5-B Port the existing deterministic PL title generator into a typed local module, preserving article inputs, exact scoring/keyword/pixel rules, explanations, SERP preview, ranking, copy, and apply-to-dashboard-title behavior.
- [x] P5-C Provide authorized on-demand read-only WordPress/Yoast analysis for keyphrase placement, title/meta/slug, introduction, headings, distribution/stuffing, image alt, sentence/paragraph length, voice, transitions, structure, and readability with short prioritized improvements.
- [x] P5-D Prove participant/manager access, negative resource boundaries, WordPress read failures, stale/recovery behavior, scoring/analysis regressions, and the absence of unsupported WordPress/Yoast write-back.

Gate: one complete local Phase 5 suite, one exact-head GitHub CI run, and one Vercel preview prove the corrected read-only product boundary.

## Phase 6 — Raptive-ready data system

- [ ] P6.1 Validate Nick's real workbook format, size, rows, timezone, aggregation, and deduplication semantics when supplied. — FINAL REAL-WORKBOOK INPUT REQUIRED; NO ACTION NEEDED YET
- [x] P6.2 Use the existing atomic importer for measured inputs up to 10 MB / 100,000 rows; add private storage, jobs, chunks, or resume only if real measurement requires them.
- [ ] P6.3 Add a live connector only from an actual Raptive API contract, sharing canonical normalization/deduplication with historical imports. — FINAL API CONTRACT/AUTHORIZATION INPUT REQUIRED; SPECULATIVE CONNECTOR CORRECTLY NOT BUILT
- [ ] P6.4 Keep necessary credentials server-only and provide enable/disable, health, retry, reconciliation, and a nontechnical administrator flow. — HISTORICAL FLOW COMPLETE; LIVE CONTROLS DEPEND ON P6.3
- [x] P6.5 Preserve financial-data authorization and test malformed, duplicate, overlap, replay, partial, and secret-boundary cases.
- [x] P6.6 Remove the finance-application contract unless a real consumer is identified.

Gate: bounded historical fixtures, authorization, recovery, reconciliation, and the explicit no-speculation live boundary pass; only Nick's real workbook and actual live API contract/authorization remain.

Phase 6 gate status: **PASS.** Exact head `a37698f02f110dda625811f05d499dfe6f7d8426` passed GitHub Actions run `29894535937` and the single Vercel preview (`9UQncWjjFX8GGW73sAT4yTNsoF8u`). Final real-workbook and live-contract validation remains input-gated for P7.4.

## Phase 7 — Full-system verification, deployment, and Raptive handoff

- [ ] P7.1 Run one release-candidate clean-checkout quality, security, database, browser, accessibility, and complete route/role/viewport visual gate. — LOCAL CLEAN-CHECKOUT PASS; EXACT-HEAD CI/PREVIEW PENDING
- [ ] P7.2 Execute one production migration/deployment procedure with verified backup and rollback readiness.
- [ ] P7.3 Run one production smoke covering roles, WordPress/SEO, cron, integrations, and health.
- [ ] P7.4 Present Nick with only the two real Raptive actions, then validate historical and live inputs, deduplication, totals, reconciliation, permissions, and health.
- [ ] P7.5 Finish aligned documentation, evidence-linked checklist, residual-risk record, and one final release smoke after affected-gate repairs.

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

### 2026-07-21 — P2.10 safe operational-observability gate

- Added one structured JSON logging boundary with stable component/event/error-code fields, correlation IDs for failures, bounded attributes, dangerous-key removal, and value redaction. Application, analytics, entry, cron, import, and notification failure paths no longer emit raw exception objects or messages; invalid environment startup logs only failed field names.
- Migration `0022_operational_observability.sql` adds forced-RLS, service-only `operational_alerts` and `import_runs` tables plus narrow RPCs. Alerts deduplicate by stable fingerprint, preserve first/last occurrence and count, carry only safe summaries/remediation, and resolve after recovery. All client roles remain revoked.
- Every configured cron now shares one canonical registry for path, Vercel schedule, durable execution name, freshness window, and remediation. Failed, stuck, missing, and stale runs are differentiated; task/control failures create durable alerts and successful recovery resolves them.
- Raptive commit attempts now begin before matching, finish atomically with the range replacement and upload row, and recover a success whose HTTP response was lost by checking the durable run. Settings > Analytics exposes running, failed, and successful attempts with safe codes instead of showing only successful uploads.
- Settings > Sync now gives both-site Admin+ viewers a refreshable system-health surface for all eight jobs, PL/QB WordPress freshness, GA4 configuration/sync health, Raptive import health, and active alerts with concrete remediation. The endpoint rejects anonymous and one-site viewers; its failure response exposes only a correlation ID.
- Final local gate: 61 Vitest files / 282 tests, 10 database files / 306 pgTAP assertions, generated database-type drift, warning-failing database lint, zero-vulnerability audit, ESLint, TypeScript, actionlint 1.7.12, Next.js 16.2.11 production build, all 10 Chromium journeys, and all 17 production-quality checks pass.
- Clean GitHub run [29866594243](https://github.com/BeardedBats/pl-staff-dashboard/actions/runs/29866594243) independently passed Application, Database, Dependencies, and all eight Browser journeys; Vercel passed and draft PR #27 is merge-clean.

### 2026-07-21 — P2.11 recovery and operating-runbook gate

- Added executable backup/restore, migration/rollback, deployment, incident-response, and secret-rotation runbooks plus one index that defines ownership, release ordering, stop conditions, verification, and retained evidence. The root README now points operators to the project-specific gate instead of generic create-next-app deployment advice.
- Added a read-only operations preflight that reports Git state, the contiguous `0001`–`0022` migration chain, required runbooks, CLI versions, managed backup availability, release credentials, Vercel linkage/authentication, and production-login reachability without printing secrets. `--require-release-access` fails closed unless the tracked worktree is clean and database/Vercel release authority is present.
- Live management-plane inventory found eight completed physical backups, latest `2026-07-21T04:06:20.088Z`, with PITR disabled. Production login returned HTTP 200. Database migration credentials and Vercel management authority remain absent, so the release preflight correctly blocks instead of implying deploy readiness.
- Rehearsed Supabase's split logical backup and atomic restore against disposable local database `pl_restore_drill_p211`. The data dump excludes platform-managed vector tables, and the restore uses one stop-on-error transaction plus `SET session_replication_role = replica`, resolving the circular graphics/comment foreign-key warning. The restored database matched all 33 public tables and 23 public functions, retained a private `graphics` bucket, and passed all 306 pgTAP assertions. Only Supabase-managed `auth.schema_migrations` and `storage.migrations` histories were intentionally not copied. The disposable database was removed after verification; ignored SHA-256-addressed dump artifacts remain local.
- Added a contract test and CI runbook verifier covering all six documents, all 15 `.env.example` keys, the migration chain, and required backup/migration/storage/Vercel/test commands. GitHub artifact uploads now use `actions/upload-artifact@v7`, closing the Node 20 runner warning from P2.10.
- Final local gate: runbook contract; ESLint; TypeScript; actionlint 1.7.12; zero-vulnerability audit; Next.js 16.2.11 production build; 53 Vitest files / 250 tests with V8 coverage; 10 database files / 306 pgTAP assertions; generated database-type drift; warning-failing database lint; and all eight Chromium journeys pass. Browser teardown left no reported failures.
- Exact-head GitHub run [29871264905](https://github.com/BeardedBats/pl-staff-dashboard/actions/runs/29871264905) independently passed Application (including the runbook contract), Database, Dependencies, and all eight Browser journeys; Vercel passed and draft PR #28 is merge-clean.

### 2026-07-21 — P2.12 measurable quality-baseline gate

- Added a versioned production-build quality lane with three representative performance profiles, eight axe accessibility scans across anonymous and role-specific pages in both dark and light themes, and a keyboard-order/visible-focus journey. The lane runs locally and in GitHub Actions, retains its machine-readable evidence for 14 days, and does not require production credentials.
- The enforced lab budgets distinguish measured synthetic checks from field data: `fieldDataClaimed` is false, FCP is capped at 1,800 ms, LCP at 2,500 ms, CLS at 0.1, and long-task-derived TBT at 300 ms. Route-specific encoded-byte, JavaScript-byte, request-count, and DOM-size ceilings detect application growth without claiming real-user Core Web Vitals.
- Latest production-build measurements: mobile login FCP/LCP 52 ms, CLS 0, TBT 0, 267,371 encoded bytes, 159,319 JavaScript bytes, 14 requests, and 62 DOM nodes; writer content FCP/LCP 144 ms, CLS 0.0596, TBT 0, 405,321 encoded bytes, 277,065 JavaScript bytes, 45 requests, and 440 DOM nodes; admin settings FCP/LCP 184 ms, CLS 0, TBT 0, 388,854 encoded bytes, 261,476 JavaScript bytes, 42 requests, and 310 DOM nodes.
- The initial scans found real unnamed filter controls, invalid description-list children, dark-theme muted-text contrast failures, and light-theme brand/muted semantic contrast failures. The UI now supplies accessible names, valid `dt`/`dd` structure, and contrast-safe semantic foregrounds while preserving the canonical decorative tokens. All 12 quality checks pass with no rule exclusions, snapshots, or suppressions.
- An independent Chromium inspection verified the login page has meaningful content, labeled inputs, a visible primary action, no framework error overlay, and the expected anonymous `/home` redirect. Automated axe checks are explicitly treated as a regression floor; keyboard, screen-reader, zoom/reflow, and assistive-technology review remain part of later design-system and final acceptance work.
- Final local gate: runbook contract; ESLint; TypeScript; actionlint 1.7.12; zero-vulnerability audit; Next.js 16.2.11 production build; 54 Vitest files / 251 tests with V8 coverage; 10 database files / 306 pgTAP assertions; generated database-type drift; warning-failing database lint; all eight role/anonymous Chromium journeys; and all 12 production-quality checks pass.
- Clean GitHub run [29872890551](https://github.com/BeardedBats/pl-staff-dashboard/actions/runs/29872890551) independently passed Application, Database, Dependencies, all eight Browser journeys, all 12 quality checks, and the retained quality-evidence upload; Vercel passed and draft PR #29 is merge-clean.

### 2026-07-21 — P3.1 verified PLPD token foundation

- Read the complete 985-line visual authority at `C:\Users\Nick\Downloads\PLPD Style Guide 6-21-26.html`, including CSS, examples, states, Never List, and validation checklist. The reviewed file's SHA-256 is `DB7CDC395BD380FECA6DBFA0D687D7AB577BF9B9D80D79CF96388A64E804C98B`; the durable token documentation records its version and precedence.
- Centralized exact dark-mode colors, text ramps, borders, row states, semantic/value colors, the complete mesh data URI, gradient angles/stops, shadow stacks, shell/control/table spacing, radius scale, typography sizes/weights/tracking, and transition timings in the leading registry of `src/app/globals.css`. Tailwind exposes the same color, type, spacing, radius, and shadow roles.
- The boundary is explicit: contrast-safe text, light mode, print, onboarding overlay, selection, and priority roles are derived dashboard extensions, not source claims. The guide's stand-in pitch palette and loading-bars example were deliberately not promoted to canonical tokens.
- Removed visual color, RGBA, gradient, and shadow literals from TSX consumers. Existing navigation, buttons, fields, selects, menus, tabs, table interactions, onboarding, calendar tiers, and analytics heatmaps now consume variables or token-backed helpers. A four-test contract pins canonical source values, mesh and gradient/shadow construction, typography weights, source hash/documentation, and the no-literals consumer rule.
- During the final gate, npm newly reported the high-severity `GHSA-f88m-g3jw-g9cj` advisory against Next.js's optional `sharp@0.34.5`. The lockfile now overrides only Next.js's Sharp edge to patched `0.35.3` while preserving Next.js `16.2.11`; a dependency contract prevents either value from regressing. A clean lockfile install, zero-vulnerability audit, real resize/PNG smoke test, production build, and Linux CI are required evidence for the override.
- Production-build quality remains green after tokenization: all eight dark/light axe scenarios, keyboard focus order, and three performance profiles pass. Latest lab measurements are login FCP/LCP 100 ms and 268,044 encoded bytes; writer content FCP/LCP 144 ms, CLS 0.0596, and 405,543 encoded bytes; admin settings FCP/LCP 252 ms and 389,137 encoded bytes; all TBT values are zero and all budgets pass.
- Independent dark/light Chromium captures confirmed the exact dark mesh resolves through its token, light mode removes it for the derived flat canvas, source/derived computed variables resolve correctly, both layouts have no horizontal overflow, and the login surface remains visually intact.
- Final local gate after the Sharp override: clean `npm ci`; zero-vulnerability audit; native Sharp 0.35.3/libvips 8.18.3 resize-and-PNG smoke test; runbook contract; ESLint; TypeScript; actionlint 1.7.12; Next.js 16.2.11 production build; 56 Vitest files / 256 tests with V8 coverage; 10 database files / 306 pgTAP assertions; generated database-type drift; warning-failing database lint; all eight role/anonymous Chromium journeys; and all 12 production-quality checks pass.
- Clean GitHub run [29874791049](https://github.com/BeardedBats/pl-staff-dashboard/actions/runs/29874791049) independently passed Application, Database, Dependencies, all eight Browser journeys, all 12 quality checks, and the retained quality-evidence upload on Linux. The Vercel preview passed, and draft PR #30 was merge-clean and mergeable at the tested head `afdd169`.

### 2026-07-21 — P3.2 reusable PLPD primitive layer

- Added a documented, reusable component vocabulary for navigation, compact page headers, tabs, buttons, fields, primary/secondary dropdowns, pointed-shadow cards, chips, tables, pagination, alerts, dialogs, drawers, loading/skeleton states, empty/error states, and gated values. Every primitive composes the central registry rather than restating visual literals in TSX.
- Canonical guide constructions remain explicit: amber active tabs with a 6px underline, four-layer action buttons, gradient and subordinate-flat dropdowns, pointed card shadow, exact chips, panel-framed 34.5px/62px zebra tables, `< current >` pagination, spinner loading, and framed empty states. Responsive drawers, skeletons, info/warning callouts, and modal composition are documented as dashboard extensions rather than PLPD source claims; the stand-in loading bars remain excluded.
- `GatedValue` structurally has no real-value prop and renders only a named placeholder/lock. `ErrorState` accepts safe caller-authored copy rather than an exception object. A four-test source contract pins those boundaries and the complete primitive family, while three rendered component tests cover semantics, active navigation, pagination interaction, table structure, alerts/states, and placeholder-only gated rendering.
- Replaced the header's page-local mobile overlay with the shared accessible drawer and reused the same navigation primitive in desktop and mobile shells. The existing route-close behavior remains controlled by the header; the component review found no new effects, request waterfalls, or unstable render boundaries.
- The quality harness now permits a collision-free local `QUALITY_TEST_PORT` override while CI keeps port 3101. This was exercised on port 3111 without stopping the unrelated local application already using 3101.
- Production-mode verification passes all eight role/anonymous browser journeys and all 12 accessibility/performance checks. Latest lab measurements are login FCP/LCP 72 ms and 268,836 encoded bytes; writer content FCP/LCP 124 ms, CLS 0.0536, and 407,684 encoded bytes; admin settings FCP/LCP 212 ms and 391,341 encoded bytes; all TBT values are zero and all budgets pass.
- Independent Chromium inspection confirmed the Users tab resolves to exact amber with a 6px underline, cards resolve to the translucent state surface, the 256px mobile drawer exposes the current Home link and one overlay, close restores the page, desktop/mobile have no horizontal overflow, and neither surface emitted a console or page error.
- Final local gate: diff hygiene; runbook contract; ESLint; TypeScript; actionlint 1.7.12; zero-vulnerability audit; Next.js 16.2.11 production build; 58 Vitest files / 263 tests with V8 coverage; 10 database files / 306 pgTAP assertions; generated database-type drift; warning-failing database lint; all eight role/anonymous Chromium journeys; and all 12 production-quality checks pass.
- Clean exact-head GitHub run [29876712365](https://github.com/BeardedBats/pl-staff-dashboard/actions/runs/29876712365) independently passed Application, Database, Dependencies, all eight Browser journeys, all 12 quality checks, and the retained quality-evidence upload on Linux. The Vercel preview passed, and draft PR #31 was merge-clean and mergeable at the tested head `77dfdbf`.

### 2026-07-21 — P3.3 verified typography boundary

- Reverified the complete visual authority at its recorded SHA-256. The runtime boundary now follows its ruling directly: DM Sans is the default application-chrome family; Work Sans owns tables, stat values, charts, wordmarks, form and dropdown data, pagination, and data-bearing site/tier/team/category pills; monospace is limited to literal `code` elements.
- Removed the legacy use of monospace as a small-label or metadata style across navigation, home, tasks, entry detail, calendar, analytics, graphics, notifications, staff, and settings. Every literal table now establishes Work Sans at its root, and standalone tabular numerals and chart containers explicitly inherit the data family.
- Corrected shared primitive boundaries: buttons, badges, page headers, dialogs, and drawers use DM Sans chrome; cards, input/select/dropdown values, tables, and pagination use Work Sans where the guide specifies data constructions. Named `plpd-section-title` and `plpd-hero-numeral` helpers are the only paths above the normal 700 weight cap.
- Added a seven-test recursive typography contract that rejects non-code monospace, DM Sans literal tables, unclassified standalone numerals/charts, and data-bearing pills without Work Sans. It also pins both loaded font variables, representative primitive assignments, the source hash documentation, and the 900/800 exception roles.
- Added two production-Chromium checks that wait for the font loader and assert computed families on anonymous chrome, the wordmark, the sign-in action, authenticated page chrome, form values, the users table, and a data pill. Their retained screenshots were visually inspected: desktop settings and mobile login have intact hierarchy, no clipping, and no horizontal overflow.
- Production-mode quality remains green across eight dark/light WCAG A/AA scenarios, keyboard focus order, three performance profiles, and the two typography checks. Latest lab measurements are login FCP/LCP 96 ms and 268,878 encoded bytes; writer content FCP/LCP 128 ms, CLS 0.0536, and 407,728 encoded bytes; admin settings FCP/LCP 184 ms and 391,424 encoded bytes; all TBT values are zero and all budgets pass.
- Final local gate: diff hygiene; runbook contract; ESLint; TypeScript; actionlint 1.7.12; zero-vulnerability audit; Next.js 16.2.11 production build; 59 Vitest files / 270 tests; 10 database files / 306 pgTAP assertions; generated database-type drift; warning-failing database lint; all eight role/anonymous Chromium journeys; and all 14 production-quality checks pass.
- Clean exact-head GitHub run [29878225892](https://github.com/BeardedBats/pl-staff-dashboard/actions/runs/29878225892) independently passed Application, Database, Dependencies, all eight Browser journeys, all 14 quality checks, and the retained quality-evidence upload on Linux. The Vercel preview passed, and draft PR #32 was merge-clean and mergeable at the tested head `e3cccad`.

### 2026-07-21 — P3.4 subtle-glass-over-mesh gate

- Reverified the guide doctrine and its source hash. Dark mode retains all three load-bearing atmosphere layers: the exact mesh canvas, a transparent sidebar with its canonical cyan-tinted wash and edge shadow, and translucent panels/table rows that let the mesh remain visible.
- Remapped the semantic `card` surface from opaque `--surface-2` to the guide's exact `rgba(33, 36, 58, 0.35)` panel fill in dark mode. This corrects all 56 existing `bg-card` consumers centrally without scattered opacity approximations; the documented derived light mode continues to use its readable 88% panel fill.
- Completed the exact panel depth stack by pairing the source outer panel shadow with its 1 px inset highlights. Removed the login wordmark's generic heavy shadow/ring and sole backdrop blur, and migrated the last raw mention popup from an opaque popover/generic shadow to the canonical translucent dropdown gradient.
- A four-test recursive source contract pins panel/state/row fills, the semantic card mapping, mesh/sidebar construction, exact panel depth, the migrated popup, source documentation, and zero `backdrop-filter` or `backdrop-blur-*` use. Ordinary blur remains only where the guide specifies the pointed card's behind-surface shadow.
- Two production-Chromium checks prove the mesh resolves on anonymous and authenticated pages, the sidebar computes transparent with a non-empty wash, the legacy Calendar panel computes to exact alpha 0.35, the header remains translucent, backdrop filtering is absent, and neither representative page overflows horizontally.
- Visual inspection of the retained mobile login and desktop Calendar captures found intact hierarchy, readable controls/data, subtle depth, and no opaque-panel or frosted-glass regression. The component review found no new effects, requests, state, or render-boundary changes.
- Production-mode quality remains green across the two glass/mesh checks, eight dark/light WCAG A/AA scenarios, keyboard focus order, three performance profiles, and both typography checks. Latest lab measurements are login FCP/LCP 56 ms and 268,854 encoded bytes; writer content FCP/LCP 128 ms, CLS 0.0231, and 407,750 encoded bytes; admin settings FCP/LCP 200 ms and 391,429 encoded bytes; all TBT values are zero and all budgets pass.
- Final local gate: diff hygiene; runbook contract; ESLint; TypeScript; actionlint 1.7.12; zero-vulnerability audit; Next.js 16.2.11 production build; 60 Vitest files / 274 tests; 10 database files / 306 pgTAP assertions; generated database-type drift; warning-failing database lint; all eight role/anonymous Chromium journeys; and all 16 production-quality checks pass.
- Clean exact-head GitHub run [29879316031](https://github.com/BeardedBats/pl-staff-dashboard/actions/runs/29879316031) independently passed Application, Database, Dependencies, all eight Browser journeys, all 16 quality checks, and the retained quality-evidence upload on Linux. The Vercel preview passed, and draft PR #33 was merge-clean and mergeable at the tested head `92e162d`.

### 2026-07-21 — P3.5 complete seven-state component gate

- Added one typed `default`, `hover`, `active`, `loading`, `error`, `empty`, and `gated` vocabulary shared by cards and home widgets. Each rendered primitive exposes its state through `data-plpd-state`, making the current presentation inspectable without client-side state or hydration work.
- Default widgets retain the translucent pointed-card construction. Hover uses the exact 4% guide wash, a 1px lift, `.88` contained-badge opacity, and the canonical 150ms timing. Active alone applies the guide's warm-amber glow. Loading/error/empty/gated surfaces do not inherit the interactive lift.
- Loading presents an announced busy region using the canonical spinner or documented skeleton extension; the guide's stand-in bars remain excluded. Empty content keeps its frame. Error-state props accept only caller-authored product copy, not an exception object. Gated values remain lock-and-placeholder only with no real-value prop.
- A six-test source contract pins the complete state union, safe error and gated APIs, state attributes, exact hover/active tokens, timing, badge opacity, and persistent empty frame. Four rendered component tests exercise all seven states and their semantics.
- A production-Chromium check opens the database-backed home page, observes a real default widget and empty frame, executes the actual hover transition, verifies `.88` badge opacity, switches the same built surface to active, and confirms the computed warm-amber shadow. The retained capture was visually inspected; hierarchy, mesh visibility, empty frames, and active depth remain intact. The inspection also found and fixed a wrapped `View all` action at narrow card widths.
- React review: no new hooks, effects, requests, state synchronization, or client boundary were introduced; props remain colocated and typed, links remain semantic, and the state contract composes the existing Card/Badge/state primitives.
- Final local gate: diff hygiene; runbook contract; ESLint with zero warnings; TypeScript; actionlint 1.7.12; zero-vulnerability audit; Next.js 16.2.11 production build; 60 Vitest files / 277 tests; 10 database files / 306 pgTAP assertions; generated database-type drift; warning-failing database lint; all eight role/anonymous Chromium journeys; and all 17 production-quality checks pass.
- Clean exact-head GitHub run [29880332245](https://github.com/BeardedBats/pl-staff-dashboard/actions/runs/29880332245) independently passed Application, Database, Dependencies, all eight Browser journeys, all 17 quality checks, and the retained quality-evidence upload on Linux. The Vercel preview passed, and draft PR #34 was merge-clean and mergeable at the tested head `568bd29`.

### 2026-07-21 — P3.6 server-withheld gated-data gate

- Documented and pinned the actual financial-data policy: Raptive earnings, RPM, and joined revenue analytics are limited to EIC and Operations for their authorized site scope. Admin remains deliberately excluded; administrative system-health summaries may report Raptive freshness/failure but contain no financial values.
- Added a unique live-database revenue sentinel plus an EIC browser actor. The EIC receives the exact sentinel through the real article-analytics API and sees its rounded value on the server-rendered home widget, proving the positive path is populated rather than vacuously empty.
- The same executed browser gate proves writer, manager, editor, graphics, and admin sessions receive 403 before article analytics are queried. It separately probes every analytics JSON/CSV route and Raptive history as admin, confirms the admin home HTML and content UI never contain the sentinel, and verifies no Analytics tab is rendered for the admin entry panel.
- The five-test source contract pins the EIC/Operations-only role definition, authorization-before-loader ordering across seven financial read routes, page/home server-loader gates, direct database privilege revocations, placeholder-only/no-blur `GatedValue`, and non-negative initial dimensions on every responsive financial chart.
- The new EIC runtime probe surfaced Recharts' `-1px` first-measure warning. All six responsive charts now share a stable `1x1` initial measurement before ResizeObserver supplies the real size; the browser test asserts the warning does not recur. React review found no hook, effect, fetch, state, semantic, or client-boundary change beyond that static sizing prop.
- Retained EIC/admin captures were visually inspected. The EIC home clearly renders `$731.29` with an intact one-point chart; the admin content page shows the same sentinel entry but no analytics surface or financial value, with no clipping, overflow, framework overlay, or visual masking.
- Final local gate: diff hygiene; runbook contract; ESLint with zero warnings; TypeScript; actionlint 1.7.12; zero-vulnerability audit; Next.js 16.2.11 production build; 61 Vitest files / 282 tests; 10 database files / 306 pgTAP assertions including direct-client privilege denial; generated database-type drift; warning-failing database lint; all 10 role/anonymous/gated-data Chromium journeys; and all 17 production-quality checks pass.
- Clean GitHub run [29881193576](https://github.com/BeardedBats/pl-staff-dashboard/actions/runs/29881193576) independently passed Application, Database, Dependencies, all 10 Browser journeys, all 17 production-quality checks, and retained quality evidence at implementation head `55eac4c`. The Vercel preview passed, and draft PR #35 was merge-clean and mergeable at that tested head.
- Exact evidence-head run [29881483493](https://github.com/BeardedBats/pl-staff-dashboard/actions/runs/29881483493) independently passed all four jobs on retry after the first GitHub-hosted Database runner encountered an already-occupied local port before project code ran. Attempt two passed Application, Database, Dependencies, all 10 Browser journeys, and all 17 quality checks at `e6695be`; Vercel passed and draft PR #35 remained merge-clean and mergeable.

### 2026-07-21 — P3.7 exact table-system gate

- Reverified the complete visual authority at SHA-256 `DB7CDC395BD380FECA6DBFA0D687D7AB577BF9B9D80D79CF96388A64E804C98B` and documented one shared table/data-value construction. All 12 literal tables across 10 application files now use `plpd-table-shell`, `plpd-table`, and explicit Work Sans ownership.
- Corrected the table-header token from the nearby `#2E3150` surface color to the guide's exact `#2E3658`. Shared CSS now owns the 34.5px header, 16px/600 cyan labels, 62px rows, 14px data, tabular numerals, right-aligned numeric columns, zebra fills, and the actual 120ms cell-background hover transition.
- Row states use dedicated fills and text ramps without opacity. Selected and expanded Content rows, priority editor work, inactive templates, and the guide's bench/injured/best vocabulary compose through inspectable attributes; expanded detail rows have an explicit escape from fixed row geometry.
- Added `TableValue` for literal-zero and optional signed-delta presentation. Zeros use the documented AA-safe muted override; positive/negative deltas use the guide's softer value colors. Revenue totals remain neutral data and no longer borrow the amber active-state accent.
- Replaced Archive's bespoke text pager with the shared 32px chevron construction and exact 25-row page size. A database-backed production-Chromium fixture creates 26 archived records and proves first/second-page membership, both disabled endpoints, 14px spacing, 40% disabled opacity, and 1.2 hover brightness.
- Two new production-Chromium checks prove exact computed header/row geometry, Work Sans, numeric alignment, literal-zero color, 120ms hover, cyan hover fill, and pagination endpoint behavior. Retained Analytics and Archive captures were visually inspected; hierarchy, table depth, row density, zero subordination, and the one-row second page are intact with no clipping or overflow.
- React review found no new effects, requests, state synchronization, client boundary, or unstable render allocation. The shared primitive props remain colocated and typed; the database fixture is deterministic and cleanup-safe.
- Final local gate: diff hygiene; runbook contract; ESLint with zero warnings; TypeScript; actionlint 1.7.12; zero-vulnerability audit; Next.js 16.2.11 production build; 62 Vitest files / 289 tests; 10 database files / 306 pgTAP assertions; generated database-type drift; warning-failing database lint; all 10 role/anonymous/gated-data Chromium journeys; and all 19 production-quality checks pass.
- Clean GitHub run [29882782436](https://github.com/BeardedBats/pl-staff-dashboard/actions/runs/29882782436) independently passed Application, Database, Dependencies, all 10 Browser journeys, all 19 production-quality checks, and retained quality evidence at implementation head `89cba65`. The Vercel preview passed, and draft PR #36 was clean and mergeable at that tested head.
- Exact evidence-head run [29883077485](https://github.com/BeardedBats/pl-staff-dashboard/actions/runs/29883077485) independently passed Application, Database, Dependencies, all 10 Browser journeys, all 19 quality checks, and retained evidence at `e077dbc`; Vercel passed and draft PR #36 remained clean and mergeable.

### 2026-07-21 — P3.8 Never List gate

- Reverified the guide at SHA-256 `DB7CDC395BD380FECA6DBFA0D687D7AB577BF9B9D80D79CF96388A64E804C98B` and mapped all 16 named prohibitions to application-specific enforcement in `docs/PLPD_NEVER_LIST.md`. The mapping distinguishes executable product rules from P3.9's separate viewport/layout validation instead of claiming responsive work early.
- The audit found and removed 30 italic metadata, null-marker, edited-marker, empty-state, and helper-copy treatments across 13 production files. All application presentation metadata is now upright, and a recursive source gate prohibits reintroducing the italic utility.
- Replaced the graphics drag overlay's generic `shadow-xl` with the exact canonical PLPD card shadow. Production TSX now rejects generic large/extra-large shadows, raw color/gradient literals, frosted backdrop filters, opaque neutral utility panels, free-form 800/900 weights, and Work Sans headings.
- Replaced the Pipeline Health link's `hover:opacity-80` fade with a brightness hover. The contract prohibits hover opacity reductions while preserving the guide's exact contained-badge `.88` component-state exception and legitimate hidden-to-visible `opacity-100` action reveals.
- Pinned the remaining domain rules: no `LEAGUE:` prefix, `Pre` table label, opponent/matchup player copy, centered numeric cells, full-bright zeros, or opacity row states; active tabs remain amber; Import/CTA buttons retain all four borderless shadow-ring layers; `polishing` and `flagged` conflict-equivalent states remain visible, with `flagged` winning aggregate precedence.
- Two production-Chromium checks prove the real sign-in action computes to the exact borderless gradient/ring/white-fade/inset stack, real Archive metadata is upright, the active tab computes amber 700, and the real Pipeline Health link brightens to 1.1 without losing opacity. Retained Login and Archive captures were visually inspected with intact hierarchy, mesh, table depth, and no clipping or overflow.
- React review found no new hooks, effects, requests, state, or client boundary. Changes are presentation-only class corrections plus source/browser regression ownership.
- Final local gate: diff hygiene; runbook contract; ESLint with zero warnings; TypeScript; actionlint 1.7.12; zero-vulnerability audit; Next.js 16.2.11 production build; 63 Vitest files / 295 tests; 10 database files / 306 pgTAP assertions; generated database-type drift; warning-failing database lint; all 10 role/anonymous/gated-data Chromium journeys; and all 21 production-quality checks pass.
- Clean GitHub run [29883807210](https://github.com/BeardedBats/pl-staff-dashboard/actions/runs/29883807210) independently passed Application, Database, Dependencies, all 10 Browser journeys, all 21 production-quality checks, and retained quality evidence at implementation head `b7d65e5`. The Vercel preview passed, and draft PR #37 was clean and mergeable at that tested head.
- Exact evidence-head run [29884091890](https://github.com/BeardedBats/pl-staff-dashboard/actions/runs/29884091890) independently passed Application, Database, Dependencies, all 10 Browser journeys, and all 21 quality checks at `b6d4765`; Vercel passed and draft PR #37 remained clean and mergeable.

### 2026-07-21 — P3.9 responsive and readable-layout gate

- Reserved the persistent 320px sidebar for desktop widths and moved tablet to the full-width drawer shell. Shared content padding now resolves to 16px on mobile, 20px on tablet, and 24px on desktop without changing the PLPD palette or visual language.
- Reworked Content actions, manager approvals, selected-entry actions, Settings template/checklist headers, and tier selectors to stack or wrap at narrow widths. The staff profile now has a semantic page heading. Visual inspection of retained 390px, 768px, and 1440px captures found intact hierarchy and a natural mobile manager-request reading order.
- Removed every production `truncate` and `line-clamp` utility so readable copy wraps instead of disappearing. The 14px minimum is enforced at computed-style time for legacy 9–13px utilities and third-party FullCalendar/Recharts labels; only the guide's explicit canonical compact-chip construction is marked as exempt.
- A four-test recursive source contract pins the no-ellipsis rule, the readable-text enforcement and explicit chip exception, the desktop-only sidebar, responsive padding, and the production viewport matrix.
- Two production-Chromium checks cover all 54 authenticated actor/route/viewport combinations across 18 routes at 390x844, 768x1024, and 1440x900. Every route has a visible page heading, remains inside the document and main-content width, renders no text below 14px outside canonical compact chips, and computes no ellipsis or line clamp.
- React review found no new effects, requests, state synchronization, or client boundaries. Changes are responsive presentation, semantic heading, chart/calendar typography props, and regression ownership; existing handlers and data flow remain unchanged.
- Final local gate: diff hygiene; runbook contract; ESLint with zero warnings; TypeScript; actionlint 1.7.12; zero-vulnerability audit; Next.js 16.2.11 production build; 64 Vitest files / 299 tests with V8 coverage; 10 database files / 306 pgTAP assertions; generated database-type drift; warning-failing database lint; all 10 role/anonymous/gated-data Chromium journeys; and all 23 production-quality checks pass.
- Clean GitHub run [29885510199](https://github.com/BeardedBats/pl-staff-dashboard/actions/runs/29885510199) independently passed Application, Database, Dependencies, all 10 Browser journeys, all 23 production-quality checks, and retained quality evidence at implementation head `a4f0a16`. The Vercel preview passed, and draft PR #38 was clean and mergeable at the tested head.
- Exact evidence-head run [29885830768](https://github.com/BeardedBats/pl-staff-dashboard/actions/runs/29885830768) independently passed Application, Database, Dependencies, all 10 Browser journeys, and all 23 quality checks at `f349747`; Vercel passed and draft PR #38 remained clean and mergeable.

### 2026-07-21 — P3.10/P3.11 accessibility and visual-regression batch

- Expanded the automated WCAG A/AA floor from representative scenarios to all 18 authenticated routes with no exclusions. The route sweep found and repaired unnamed date, site, tier, category, author, role, team, notification, season, checklist, calendar, archive, and template controls.
- Added production-Chromium keyboard journeys for the mobile drawer focus trap and trigger restoration, Settings arrow-key tab navigation, template-dialog focus containment and launcher restoration, and user-menu entry, arrow navigation, Escape close, and trigger restoration. Open drawer, dialog, and menu states are also axe-scanned.
- Shared dropdown menus now default to non-modal behavior so opening a menu cannot leave focus inside an `aria-hidden` application shell. Template creation/edit launchers explicitly recover focus after close, while callers can still override the shared dropdown mode when a genuinely modal menu is required.
- Added five committed visual-regression baselines: anonymous mobile login, administrator desktop home, responsive mobile Archive, the shared template-dialog control surface, and EIC desktop Analytics. Animations, caret, reduced motion, color scheme, time, viewport, data actors, and snapshot paths are deterministic. The global cross-platform pixel allowance is 3%; the text-dense mobile login capture uses 5% after the first exact-head Linux run proved a stable 4% glyph-edge-only Windows/Linux rasterization difference while all other baselines passed at 3%.
- The committed captures were visually inspected before acceptance. They show intact PLPD hierarchy and surfaces, readable controls, representative desktop/mobile layouts, and no framework error overlay. A source contract pins the route-wide axe gate, keyboard/focus behaviors, dialog/menu focus contracts, screenshot configuration, test scenarios, and all five baseline files.
- Targeted batch verification: ESLint and TypeScript pass; all four new accessibility/interaction journeys pass; all five visual baselines pass in comparison mode after generation; and all three accessibility/visual source-contract tests pass. React review found no new effects, requests, mirrored state, or unstable list keys; the one new ref is launcher-local focus recovery, and existing Radix semantics remain authoritative.
- Combined Phase 3 full local gate: diff hygiene; six-runbook contract through migration `0022`; ESLint with zero warnings; TypeScript; actionlint 1.7.12; zero-vulnerability low-threshold audit; Next.js 16.2.11 production build; 65 Vitest files / 302 tests with V8 coverage; 10 database files / 306 pgTAP assertions; generated database-type drift; warning-failing database lint; all 10 role/anonymous/gated-data Chromium journeys; and all 32 production-quality checks pass.
- Exact fixed-head GitHub run [29887618696](https://github.com/BeardedBats/pl-staff-dashboard/actions/runs/29887618696) passed Application, Database, Dependencies, all 10 Browser journeys, and all 32 quality checks at `feb4f12`; Vercel passed and draft PR #39 was clean and mergeable. The first implementation head correctly exposed a stable 4% Windows/Linux glyph-edge rasterization difference on the text-dense mobile login capture; only that baseline now permits 5%, while the other four remain at the stricter 3% threshold.

### 2026-07-21 — P4.1–P4.5 daily-workflow foundation batch

- Replaced the generic welcome lead with a role-aware Today brief that presents exactly one highest-impact next action. A pure ordered decision model prioritizes team-blocking approvals, draft decisions, overdue assignments, editing, graphics, upcoming owned work, pipeline blocks, stale work, and optional capacity in that order; plain-language copy explains why the action matters.
- Added a keyboard-accessible global search command palette to every authenticated page (`Ctrl/Cmd K` or `/`). Its server route searches staff, active content, writer/editor assignments, authorized graphic requests, and scheduled entries independently; entry/draft and graphic results reuse the production resource-authorization helpers, staff results never expose email or other private fields, and one failed source produces a clear partial result instead of discarding safe results.
- Replaced “tour skipped equals onboarding complete” with explicit role-based setup ownership. First-time users receive a persistent checklist chosen from their responsibilities, visit each relevant workflow, and deliberately finish setup; the introductory tour is separately dismissible and cannot call the completion endpoint. Completion success and safe retry failure states are visible.
- Added inherited authenticated-route loading and safe error/retry boundaries. Global search exercises idle, loading, empty, partial, success, and error states; the Today view surfaces stale work; manager decisions now check every response and show explicit success or non-destructive failure feedback.
- Targeted verification: five Today/setup unit tests, three authenticated search-route API tests, two global-search partial/error component tests, four recursive workflow-foundation contract tests, and two production-Chromium journeys pass. The browser proof uses real seeded database records to exercise all five search groups, the prioritized Today action, role-specific setup persistence/completion, keyboard opening/focus, and an open-dialog WCAG A/AA scan with no exclusions.
- React review: state remains local to the command palette, setup checklist, and existing manager inbox; fetch effects are abortable and clean up their debounce timer; the tour timer retains cleanup; no mirrored server state, unstable list keys, request waterfall, or new broad client boundary was introduced.

### 2026-07-21 — P4.6–P4.9 manager-operations batch

- Managers and administrators now receive a site-scoped control center above their role queues. It surfaces pending decisions, overdue deadlines, writer coverage gaps, and stale work as direct actions; the existing EIC/Operations revenue boundary is unchanged.
- Added a live weekly operations digest with published-seven-day output, upcoming-seven-day commitments, pending decisions, risk signals, and one ordered recommended action. Its pure decision model prioritizes approvals, overdue work, writer gaps, schedule blocks, and then the forward calendar.
- Kept personal saved views and added four immediately useful, non-destructive presets: Needs a writer, Ready to edit, Priority work, and Recently changed. Presets reset unrelated filters before applying their documented purpose.
- Every bulk archive, restore, priority, and tier operation now confirms the exact selected count, uses only currently visible selected resource IDs, reports the server's atomic updated count, and retains explicit safe failure feedback. The API still rejects the whole operation unless every entry exists, is visible, and is within the manager's site authority; status transitions remain deliberately excluded.
- Targeted verification: ten manager-digest and transactional-bulk unit tests, four bulk-route API authorization/atomicity tests, ESLint, and TypeScript pass. Three production-Chromium workflow journeys pass against seeded data, including manager operations, a real preset, cancelled bulk confirmation, semantic widget headings, and a selected-action WCAG A/AA scan with no exclusions. The scan found and repaired the previously hidden bulk-tier control's missing accessible name.
- React review: the new manager widgets remain server-rendered; digest derivation is pure; no request waterfall, broad client boundary, mirrored server state, or unstable key was introduced. Existing table-local state owns confirmations and feedback, and selection is derived from TanStack's current row model so stale filtered IDs cannot be submitted.

### 2026-07-21 — P4.10–P4.15 editorial-workflow batch

- Renamed and sharpened My Tasks into My Work while preserving its route. Writers see owned writing and editing work, deadlines, and the newest polishing request directly on the affected card; editor identity and actionable revision text come from the bounded recent-activity cache for already-authorized entries.
- Added self-declared Available, Limited capacity, and Unavailable signals with an optional public note/date. Staff own their signal in Profile, directory cards expose it, and managers see only aggregate site-scoped counts with explicit “no productivity or activity score” copy. No availability is inferred from output, speed, presence, or tracking.
- Rebuilt Editing Queue around risk-first ordering and built-in saved views for past-deadline, due-within-24-hours, unclaimed, and personally claimed work. SLA badges distinguish past deadline, due soon, waiting over 24 hours, and on track.
- Added confirmed multi-select editor claiming backed by one database transaction. The route authorizes every resource and site before mutation; the database repeats the site-role boundary, locks all selected entries, rejects missing/duplicate/already-claimed/non-ready batches, and creates assignments plus matching handoff audits atomically. Direct anon/authenticated RPC execution remains revoked.
- Added four polishing feedback starters and a publication-readiness panel covering writer assignment, required checklist, editorial review, graphics, publish date, and WordPress draft. The full authorized audit feed now reports load failures safely and translates polishing/state handoffs into readable history while preserving exact actors and timestamps.
- Migration `0023_humane_capacity_and_editor_bulk_claims.sql` applied cleanly to a cold local stack. An over-broad readiness-trigger attempt was rejected by the immediate database gate and removed before commit; the final migration enforces submitted-state readiness only inside the new bulk transaction. The runbook provides the exact ordered apply gate plus a pre-deployment-only transactional reversal. Generated types match and database lint has no warnings.
- Targeted verification: 12 unit tests, 8 bulk API authorization/atomicity tests, all 11 database files / 322 pgTAP assertions, generated-type drift, database lint, ESLint, and TypeScript pass. Four production-Chromium workflow journeys pass, including real writer polishing feedback, readable audit handoff, readiness, editor saved queue selection, cancelled bulk confirmation, feedback templates, and open-dialog WCAG A/AA scanning with no exclusions.
- React review: the editing client owns only view, selection, request, and feedback state; risk derivation is memoized from server props and a stable server timestamp; no effect-based state synchronization or per-row request loop exists. Static template keys and queue identifiers are stable, and the new database reads remain server-only.

### 2026-07-21 — P4.16–P4.19 graphics-workflow batch

- Graphic requests now require a structured asset type, placement, dimensions, delivery format, and alt text, with an optional reference URL. The same contract is enforced by request validation and a database check; legacy rows receive explicit safe defaults.
- Preserved immutable private asset versions and exposed authorized version history. A new version atomically clears prior review state, while the asset view shows entry usage and whether the approved version is featured in WordPress.
- Split the workflow into assigned-worker **Submit for review**, entry-participant/manager **Approve**, and **Request changes**. Approval cannot acquire the durable WordPress submission lease until the current version was submitted for review; direct browser RPC execution remains revoked.
- Graphics responses stay limited to the work record, entry usage, authorized assignee display data, and signed asset URLs. The role receives no financial, payment, revenue, or staff-email fields; the existing server-side analytics denial remains unchanged.
- Migration `0024_graphics_review_requirements.sql` was rebuilt from a clean local reset after a pre-commit trigger-column defect was caught. The final stack through `0024` cold-applies, generated types match, database lint has no warnings, and all 12 database files / 341 pgTAP assertions pass.
- Targeted verification: 9 graphics unit tests, 3 upload API tests, ESLint, TypeScript, and two production-Chromium quality journeys pass. The browser gate covers complete brief display, required form fields, the focused asset view, least-information response fields, and WCAG A/AA scanning with no exclusions.
- React review: workflow state remains local to each card/dialog, remote refresh remains parent-owned, version history loads only on explicit demand, stable database IDs key every list, and no new effect-based request waterfall or broad client boundary was introduced.

### 2026-07-22 — P4.20–P4.22 notification and health batch

- Kept the previously verified delivery boundary: the dashboard offers durable in-app notifications only, and exposes no email or Discord settings or success flags. Event-level role defaults and personal opt-outs remain intact.
- Added immediate or daily-batch delivery, a staff-local batch time, and optional local quiet hours. Visibility is calculated from the staff member's saved IANA timezone; held notifications remain private and unread until their scheduled time, and “mark all read” cannot consume future items.
- Delivery writes use one stable notification ID across a bounded three-attempt retry. Dedupe keys remain authoritative, the successful attempt count is stored, and exhausted failures continue into sanitized active operational alerts.
- Preference rows and delivery settings now replace atomically through a server-only transaction. Database constraints reject unsupported modes, incomplete quiet-hour pairs, invalid events, and retry counts outside the supported bound; authenticated clients cannot execute the RPC directly.
- Expanded System health with a plain-language overall summary and in-app delivery health showing scheduled items, active failure alerts, and one concrete recovery action. Existing cron, WordPress, GA4, Raptive, and alert detail remains available.
- Migration `0025_notification_delivery_controls.sql` cold-applies through the full ordered stack. All 13 database files / 358 pgTAP assertions pass, generated types match, and database lint reports no warnings.
- Targeted verification: 9 notification scheduling/delivery contract tests, the operational-health component test, ESLint, TypeScript, and two production-Chromium journeys pass. The browser gate saves and reloads real daily/quiet-hour settings, proves fake external choices remain absent, renders delivery health, and completes WCAG A/AA scanning with no exclusions.
- React review: delivery form state is local and persisted in one request; no effect derives server state, the existing preference load remains cancellation-safe, and no notification polling or per-event save loop was added.

### 2026-07-22 — Phase 4 local boundary gate

- Locked install, full ESLint, TypeScript, runbook verification, production build, and dependency audit pass; the audit reports zero vulnerabilities. The complete Vitest coverage run passes 77 files / 339 tests.
- A clean Supabase reset applies the ordered stack through `0025`; all 13 database files / 358 pgTAP assertions pass, generated types match, and database lint reports no warnings.
- All 10 anonymous and role-based browser journeys pass. The complete route/role/viewport quality matrix passes all 40 checks, including WCAG A/AA, keyboard/focus, responsive containment, component states, PLPD screenshots, and performance budgets.
- The first boundary run correctly rejected two stale contracts (missing authorization-matrix rows and a site pill without the Work Sans marker) plus stale Today readiness selectors. Those exact contracts were repaired and rerun before the clean matrix.
- The writer content-detail performance gate exposed a real layout shift when the asynchronously loaded expanded panel displaced later table rows. Reserving the panel's loading footprint reduced measured CLS from `0.1574` to `0.0041`; the quality artifact now records contributing layout-shift sources for future diagnosis.
- Local Phase 4 gate: **PASS**. Remaining phase-boundary work is the one exact-head GitHub CI run and one Vercel preview required by the release protocol.

### 2026-07-22 — Phase 4 exact-head boundary gate

- Exact head `9115bd6` passed GitHub Actions run `29891371506`: Application, Database, Dependencies, Browser, all 10 role journeys, and all 40 quality checks are green.
- The single Vercel preview for draft PR #40 completed successfully against the same head. No evidence-only follow-up commit or duplicate CI run was created.

### 2026-07-22 — Corrected Phase 5 WordPress and SEO batch

- A read-only live Pitcher List probe verified application-password authentication, core REST edit-context access, supported content/taxonomy/author/media/status fields, and rendered Yoast values. QB remains explicitly unconfigured.
- The product boundary was corrected before deployment: WordPress remains authoritative for article content and publication metadata. The speculative webhook/event ledger, generalized title-conflict merge, and WordPress/Yoast SEO write-back were removed. Five-minute authenticated polling plus authorized manual refresh is the complete recovery design.
- Entry detail retains public preview, authenticated admin edit, last-successful/modified/stale/error state, and manual recovery. Migration `0026_wordpress_entry_sync_state.sql` contains only the sync status/time/error columns and attention index.
- The existing standalone title generator was inspected from its live source and ported locally with its deterministic glyph widths, 100-point rubric, article types, player/week/date/list inputs, ranked candidates, explanations, Pitcher List suffix, SERP preview, copy, and apply-to-dashboard-title behavior.
- On-demand analysis is participant/manager scoped, reads current WordPress/Yoast data without write-back, covers keyphrase/title/meta/slug/opening/headings/distribution/stuffing/image-alt/sentence/paragraph/voice/transition/structure checks, and shows a short prioritized improvement list plus read-only publication readiness.
- The complete local Phase 5 gate passes: runbook contract, ESLint, TypeScript, 82 Vitest files / 352 tests with coverage, dependency audit (zero vulnerabilities), clean production build, 14 database files / 363 pgTAP assertions, generated-type drift, database lint, 11 browser journeys, and all 40 route/role/viewport quality checks. The combined gate's build worker had one transient exit; the affected production build was rerun alone and passed cleanly, followed by targeted type/component/browser checks after the final ownership copy adjustment.
- Exact head `429b395a6d00df5fea0870f607e173e3293134fb` passed GitHub Actions run `29893718221`: Application, Database, Dependencies, Browser, all 11 browser journeys, and all 40 quality checks are green. The single Vercel preview (`9DuNedCGEZeN79b3LA5p8X8wKJQm`) also passed on PR #41. Phase 5 boundary gate: **PASS**. Earlier webhook/conflict/write-back evidence is superseded and must not be treated as release proof.

### 2026-07-22 — Consolidated Phase 6 Raptive preparation

- Confirmed the current Operations-only importer already processes every qualifying sheet, previews reconciliation, collapses exact duplicates, rejects conflicting/malformed rows, matches canonical URLs, commits one date-range replacement atomically, records durable running/success/failure state, and reconciles an interrupted response before retrying.
- Centralized and enforced the measured synchronous envelope at 10 MB and 100,000 valid rows in both browser and server boundaries. Storage/jobs/chunk/resume infrastructure remains conditional on Nick's real workbook exceeding that envelope or measured request duration.
- Added the real-workbook validation procedure and the exact live-connector prerequisites. The application now plainly reports that live sync is disabled pending an actual account API contract and accepts/stores no speculative Raptive credential.
- Confirmed there is no external finance consumer or daily-aggregate API in source. No speculative finance contract was added; financial reads/imports retain EIC/Operations authorization plus server/RLS boundaries.
- Targeted parser, limit, route-authorization, failure/replay, uploads, and financial-data boundary tests pass.
- The complete local Phase 6 gate passes: runbook contract, ESLint, TypeScript, 83 Vitest files / 355 tests with coverage, zero-vulnerability dependency audit, production build, 14 database files / 363 pgTAP assertions, generated-type drift, database lint, 11 browser journeys, and all 40 route/role/viewport quality checks.
- Exact head `a37698f02f110dda625811f05d499dfe6f7d8426` passed GitHub Actions run `29894535937`: Application, Database, Dependencies, Browser, all 11 browser journeys, and all 40 quality checks are green. The single Vercel preview (`9UQncWjjFX8GGW73sAT4yTNsoF8u`) also passed on PR #42. Phase 6 boundary gate: **PASS**.

### 2026-07-22 — Phase 7 release-candidate local gate

- Added one ordered release procedure covering immutable-head verification, the exact migration suffix through `0026`, backup/Storage export, forward-repair/restore rollback decisions, stacked deployment, production smoke, and Nick's two final Raptive inputs. The runbook verifier now rejects the removed WordPress webhook/conflict design and requires the corrected read-only boundary.
- A detached clean checkout of commit `9ac544232ff82afd131194289e0775a88f6fcb57` passed locked install, runbook contract, ESLint, TypeScript, 83 Vitest files / 355 tests with coverage, zero-vulnerability dependency audit, production build, 14 database files / 363 pgTAP assertions, generated-type drift, database lint, and all 11 browser journeys.
- The original sequential tool stream closed after producing the complete quality artifacts but before returning its final exit code. Only that affected matrix was rerun. Its first retry was infrastructure-blocked because Docker Desktop had stopped; after restoring Docker, all 40 accessibility, performance, responsive, and visual checks passed in 2.4 minutes. No product fix or broader suite rerun was needed.
- Production remains unchanged. Supabase DDL authority, current backup/Storage export, Vercel production authority, and a dedicated live role-test session remain required before P7.2/P7.3. Known-unavailable Supabase DDL access was not rechecked.

## Phase 0 prioritized defect and risk inventory

1. **High — session lifecycle (P1.1, P1.2, P1.16):** refresh rotation reads then unconditionally updates, so concurrent reuse can succeed; access-token resolution does not verify the sessions row or token hash; logout relies on a valid access token and can leave a refresh session alive.
2. **High — graphics authorization (P1.3, P1.4, P1.13, P1.16):** authenticated users can list/fetch all requests; upload and submit paths verify existence/state but not role, assignment, entry membership, or ownership; several mutations lack resource authorization.
3. **High — scheduled jobs do not match Vercel (P1.12, P2.6):** all eight configured cron handlers export POST while Vercel invokes configured cron paths with GET, so scheduled execution receives 405.
4. **High — dependency vulnerabilities (P1.14):** production audit reports 3 high and 6 moderate vulnerabilities across Next.js, Discord/Undici/WebSocket, PostCSS, Resend/Svix/UUID chains.
5. **Medium — CI checks are advisory at merge (P2.9):** complete Application, Database, Dependencies, and Browser jobs now run on every pull request and `main` push. The private repository's current account plan does not expose branch protection or rulesets, so GitHub cannot make those green checks merge-required until the repository becomes public or the plan is upgraded.
6. **Input-gated — Raptive production validation (P6.1–P6.4/P7.4):** the bounded synchronous importer is complete for files up to 10 MB / 100,000 rows. Nick's real workbook must validate its actual format, timezone, aggregation, dedupe semantics, size, and runtime. A live connector must wait for the actual Raptive account API contract and authorization; storage/jobs/chunk/resume infrastructure is required only if those measured inputs demand it.
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
