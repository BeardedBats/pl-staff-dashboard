# API authorization matrix

Audited: 2026-07-21  
Scope: all 118 exported HTTP handlers under `src/app/api`; no Server Actions exist under `src`.
Status vocabulary: **OK** was enforced at the audit baseline; **GAP** was a baseline defect; **P1.12** marked the then-broken Vercel cron method contract. The closure table below is authoritative for post-audit repair state, and an automated parity test now rejects undocumented handlers.

## Policy vocabulary

| Method | Route | Policy | Status |
| --- | --- | --- | --- |
| POST | `/api/connections/wordpress` | Live session with Operations role scoped to PL; invokes PL only | OK |

- **Public**: no dashboard session is required.
- **Session**: any current, server-validated dashboard session.
- **Self**: the path user ID equals the current user ID.
- **Participant**: entry creator, assigned author, or assigned editor.
- **Graphics worker**: `graphics` for the resource site, or Admin+ for that site.
- **Manager+**: `manager`, `admin`, `eic`, or `operations` for the resource site.
- **Admin+**: `admin`, `eic`, or `operations`; site-scoped when the resource has a site.
- **Analytics**: `eic` or `operations`.
- **Operations**: `operations`.
- **Cron**: exact `Authorization: Bearer $CRON_SECRET`; selected routes also permit an interactive Admin+ session.

Roles are stored with a site (`pl`, `qb`, or `both`). A role row authorizes a site only when its site equals the resource site or is `both`. Global operations without one resource site may deliberately use a flat role.

## Confirmed systemic findings

1. **AUTH-01 — High — site authority expands globally.** `CurrentUser.roles` flattens all site rows, and `hasRole`, `isAdminPlus`, `isManagerPlus`, and related helpers consult only that flat list. A PL-only privileged role therefore authorizes QB resource actions wherever the route does not separately bind a site.
2. **AUTH-02 — High — graphics resources lack role and participant walls.** Any session can list and fetch every request and signed asset; claim, upload, submit-to-WordPress, flag, unflag, and edit paths omit required role, assignment, ownership, or parent-entry participation checks.
3. **AUTH-03 — High — entry field mutation is unrestricted.** Any session can `PATCH /api/entries/[id]` and change title, tier, priority, schedule, category, or series on any entry.
4. **AUTH-04 — High — staff directory leaks private fields.** `GET /api/users` returns the unsanitized `StaffUserSummary`, including email, Discord ID, theme, publish flag, onboarding state, and auto-approval preference, to every session. The single-user sanitizer also exposes timezone despite documenting it as restricted.
5. **AUTH-05 — High — role-specific claims are not role checked.** Any session can claim a writer slot because `createClaim` validates the requested claim type but never requires a writer-capable role for the entry site.
6. **AUTH-06 — Medium — graphics-request creation contradicts its contract.** The route says “anyone on the entry,” but the data function checks only that the entry exists.
7. **AUTH-07 — Medium — comment thread integrity is incomplete.** Comment creation does not verify that `parent_id` belongs to the same entry; all comment readers are session-wide because entry visibility is currently staff-wide.
8. **AUTH-08 — High operational defect — all eight cron handlers export POST while Vercel invokes configured cron paths with GET.** Their secret/session checks are otherwise present; repair and request-shape tests belong to P1.12.
9. **AUTH-09 — High — drafted entries are not consistently request-private.** The list query hides drafts, but direct entry, audit, comment, archive, and WordPress-refresh routes accept any session with a known entry ID even though the product contract limits drafts to their author and Admin+.

## Repair closure

| Finding | Local repair | Verification state |
|---|---|---|
| AUTH-01 | Site-aware role/scope helpers now bind entry, graphics, claim, archive, editorial, analytics filters, team, template, user-administration, global-settings, historical-sync, and manual cron authority to the resource site. | Production verified in deployment `5540561744`. |
| AUTH-02 | Graphics list/detail signing is viewer-filtered; create, claim, unclaim, flag, unflag, edit, delete, upload, and WordPress submit use action-specific participant/role/assignment policies. Entry detail no longer signs graphics for unrelated staff. | Production list/claim boundaries verified. |
| AUTH-03 | Entry metadata mutation now requires an entry participant or site Manager+. | Production participant/outsider responses verified. |
| AUTH-04 | Staff-list and staff-detail HTTP responses share one field projection; private fields are limited to self or Admin+ for the target site. | Production self/other projections verified. |
| AUTH-05 | Writer claims require writer or Manager+ authority for the entry site. | Production non-writer denial verified. |
| AUTH-06 | Graphics creation now requires parent-entry participation or site Manager+. | Policy tests plus a data-layer negative regression prove a same-site outsider is rejected before any database access. |
| AUTH-07 | Reply creation rejects a parent comment from another entry. | A validated composite foreign key and hostile pgTAP insert prove the boundary at the database layer. |
| AUTH-08 | Every cron route exposes Vercel `GET` and interactive `POST` through the same authorization and durable execution-control wrapper. | Route contracts, 105 pgTAP probes, a two-connection overlap probe, and green Vercel/database checks pass. |
| AUTH-09 | Central entry visibility now hides drafts from everyone except creator/author and site Admin+ across direct detail and child-resource routes. | Production author/outsider detail responses verified. |

## Route matrix

| Method | Route | Required policy | Enforcement | Result |
|---|---|---|---|---|
| POST | `/api/admin/ga4-backfill` | Operations | `isOperations` | OK |
| POST | `/api/admin/historical-import` | Operations | `isOperations` | OK |
| GET | `/api/analytics/articles` | Analytics | `canViewAnalytics` | OK |
| GET | `/api/analytics/articles/export` | Analytics | `canViewAnalytics` | OK |
| GET | `/api/analytics/overview` | Analytics | `canViewAnalytics` | OK |
| GET | `/api/analytics/publish-to-peak` | Analytics | `canViewAnalytics` | OK |
| GET | `/api/analytics/writers` | Analytics | `canViewAnalytics` | OK |
| GET | `/api/analytics/writers/export` | Analytics | `canViewAnalytics` | OK |
| GET | `/api/archive-requests` | Manager+ | Data function rejects non-manager | OK |
| PATCH | `/api/archive-requests/[id]` | Manager+ | Approve/deny functions reject non-manager | OK |
| POST | `/api/auth/login` | Public plus valid WordPress staff credentials | WordPress authentication and staff-role check | OK |
| POST | `/api/auth/logout` | Presented signed session cookies | Revokes access- or refresh-presented session | OK |
| GET | `/api/auth/me` | Session | `getCurrentUser` | OK |
| POST | `/api/auth/refresh` | Valid current refresh session | Compare-and-swap rotation and replay revocation | OK |
| GET | `/api/categories` | Session | `getCurrentUser` | OK |
| GET | `/api/claims` | Manager+ | Data function rejects non-manager | OK |
| PATCH | `/api/claims/[id]` | Manager+ | Approve/deny functions reject non-manager | OK |
| PATCH | `/api/comments/[id]` | Comment author | `existing.user_id === viewer.id` | OK |
| DELETE | `/api/comments/[id]` | Admin+ | Data function checks Admin+ | OK |
| GET | `/api/cron/category-sync` | Cron or global Admin+ | Shared cron authorization and execution control | OK |
| POST | `/api/cron/category-sync` | Cron or global Admin+ | Shared cron authorization and execution control | OK |
| GET | `/api/cron/deadline-reminders` | Cron or global Admin+ | Shared cron authorization and execution control | OK |
| POST | `/api/cron/deadline-reminders` | Cron or global Admin+ | Shared cron authorization and execution control | OK |
| GET | `/api/cron/ga4-sync` | Cron or global Admin+ | Shared cron authorization and execution control | OK |
| POST | `/api/cron/ga4-sync` | Cron or global Admin+ | Shared cron authorization and execution control | OK |
| GET | `/api/cron/profile-sync` | Cron or global Admin+ | Shared cron authorization and execution control | OK |
| POST | `/api/cron/profile-sync` | Cron or global Admin+ | Shared cron authorization and execution control | OK |
| GET | `/api/cron/raptive-sync` | Cron or global Admin+ | Shared cron authorization and execution control | OK |
| POST | `/api/cron/raptive-sync` | Cron or global Admin+ | Shared cron authorization and execution control | OK |
| GET | `/api/cron/recurring-generate` | Cron or global Admin+ | Shared cron authorization and execution control | OK |
| POST | `/api/cron/recurring-generate` | Cron or global Admin+ | Shared cron authorization and execution control | OK |
| GET | `/api/cron/season-switch` | Cron or global Admin+ | Shared cron authorization and execution control | OK |
| POST | `/api/cron/season-switch` | Cron or global Admin+ | Shared cron authorization and execution control | OK |
| GET | `/api/cron/unclaimed-alerts` | Cron or global Admin+ | Shared cron authorization and execution control | OK |
| POST | `/api/cron/unclaimed-alerts` | Cron or global Admin+ | Shared cron authorization and execution control | OK |
| GET | `/api/cron/wp-sync` | Cron or global Admin+ | Shared cron authorization and execution control | OK |
| POST | `/api/cron/wp-sync` | Cron or global Admin+ | Shared cron authorization and execution control | OK |
| GET | `/api/entries` | Session; staff-wide pipeline visibility | `getCurrentUser` | OK |
| POST | `/api/entries` | Session; product matrix permits all staff | `getCurrentUser` | OK |
| GET | `/api/entries/[id]` | Session except drafts; drafts require author or site Admin+ | Session only | **GAP AUTH-09** |
| PATCH | `/api/entries/[id]` | Participant or Manager+ for entry site | Session only | **GAP AUTH-01/03** |
| POST | `/api/entries/[id]/approve-draft` | Author or Admin+ | Creator/author lookup or Admin+ | OK |
| POST | `/api/entries/[id]/archive` | Admin+ direct; otherwise session files request; draft visibility applies | Direct flat Admin+ else request creation | **GAP AUTH-01/09** |
| GET | `/api/entries/[id]/audit` | Session except drafts; draft visibility applies | Session only | **GAP AUTH-09** |
| PATCH | `/api/entries/[id]/checklist/[itemId]` | Author, assigned editor, or Admin+; draft visibility applies | Flat role/assignment check | **GAP AUTH-01/09** |
| POST | `/api/entries/[id]/claim` | Writer-capable role for entry site | Session plus state only | **GAP AUTH-01/05** |
| GET | `/api/entries/[id]/comments` | Session except drafts; draft visibility applies | Session only | **GAP AUTH-09** |
| POST | `/api/entries/[id]/comments` | Session except drafts; parent must belong to entry | Session; no draft or parent-entry check | **GAP AUTH-07/09** |
| PATCH | `/api/entries/[id]/content-status` | Assigned author for submit; editor/Manager+ for polishing | Submit checks author; polishing checks flat role | GAP AUTH-01 on polishing |
| PATCH | `/api/entries/[id]/editor-status` | Editor/Manager+ for entry site | Flat editor/Manager+ role | **GAP AUTH-01** |
| POST | `/api/entries/[id]/wp-refresh` | Session except drafts; draft visibility applies | Session only | **GAP AUTH-09** |
| GET | `/api/entries/[id]/seo` | Entry participant or Manager+ for the entry site | Draft/resource visibility plus participant/site-scoped Manager+ | OK |
| POST | `/api/entries/bulk` | Manager+ for affected entry sites | Flat Manager+ only | **GAP AUTH-01** |
| POST | `/api/entries/bulk-claim-edits` | Editor or Manager+ for every selected entry site | Route authorizes every visible resource; transactional RPC repeats site-role, state, and conflict checks | OK |
| POST | `/api/entries/bulk-create` | Manager+ for every affected entry site | Site-aware Manager+ check plus transactional RPC | OK |
| GET | `/api/ga4/callback` | Operations | `isOperations` | OK |
| POST | `/api/ga4/connect` | Operations | `isOperations` | OK |
| POST | `/api/ga4/disconnect` | Operations | `isOperations` | OK |
| GET | `/api/ga4/status` | Analytics | `canViewAnalytics` | OK |
| POST | `/api/ga4/sync` | Operations | `isOperations` | OK |
| GET | `/api/graphic-requests` | Graphics worker, or participant for returned entries | Session only; signs every returned asset | **GAP AUTH-01/02** |
| POST | `/api/graphic-requests` | Participant or Manager+ for entry site | Session plus entry existence only | **GAP AUTH-01/06** |
| GET | `/api/graphic-requests/[id]` | Graphics worker or participant | Session only; signs asset | **GAP AUTH-01/02** |
| GET | `/api/graphic-requests/[id]/versions` | Graphics worker or participant | Resource authorization before signing immutable private versions | OK |
| PATCH claim | `/api/graphic-requests/[id]` | Graphics worker | Session plus state only | **GAP AUTH-01/02** |
| PATCH unclaim | `/api/graphic-requests/[id]` | Claimer or Admin+ for site | Claimer or flat Admin+ | GAP AUTH-01 |
| PATCH flag | `/api/graphic-requests/[id]` | Participant or Manager+ for site | Session only | **GAP AUTH-01/02** |
| PATCH unflag | `/api/graphic-requests/[id]` | Graphics worker or Manager+ for site | Session only | **GAP AUTH-01/02** |
| PATCH edit | `/api/graphic-requests/[id]` | Creator, participant, claimer, or Manager+ for site | Session only | **GAP AUTH-01/02** |
| DELETE | `/api/graphic-requests/[id]` | Creator or Admin+ for site | Creator or flat Admin+ | GAP AUTH-01 |
| POST | `/api/graphic-requests/[id]/submit` | Claimed graphics worker or Admin+ for site | Session only before WordPress mutation | **GAP AUTH-01/02** |
| POST | `/api/graphic-requests/[id]/upload` | Claimed graphics worker or Admin+ for site | Session plus state only | **GAP AUTH-01/02** |
| POST | `/api/raptive/live/connection` | Operations | `isOperations`; configure binds provider host to selected PL/QB host; enable rechecks provider visibility | OK |
| GET | `/api/raptive/live/sites` | Operations | `isOperations` before provider discovery | OK |
| GET | `/api/raptive/live/status` | Analytics | `canViewAnalytics`; returns service-projected connection state without credentials | OK |
| POST | `/api/raptive/live/sync` | Operations | `isOperations`; requested PL/QB must have an exact configured connection | OK |
| POST | `/api/raptive/upload` | Operations | `isOperations` | OK |
| GET | `/api/raptive/uploads` | Analytics | `canViewAnalytics` | OK |
| GET | `/api/search` | Session; results use each resource's existing visibility boundary | Server queries only projected staff, visible entries, authorized graphics, and schedules | OK |
| GET | `/api/season-modes` | Session | `getCurrentUser` | OK |
| PATCH | `/api/season-modes/[id]` | Admin+ | `isAdminPlus` | OK |
| PATCH | `/api/season-modes/[id]/activate` | Admin+ | `isAdminPlus` | OK |
| GET | `/api/settings/checklist-items` | Admin+ | `isAdminPlus` | OK |
| POST | `/api/settings/checklist-items` | Admin+ | `isAdminPlus` | OK |
| PATCH | `/api/settings/checklist-items/[id]` | Admin+ | `isAdminPlus` | OK |
| DELETE | `/api/settings/checklist-items/[id]` | Admin+ | `isAdminPlus` | OK |
| GET | `/api/settings/operational-health` | Admin+ with both-site authority | `isAdminPlusForScope(viewer, "both")` | OK |
| GET | `/api/settings/wp-sync-status` | Admin+ | `isAdminPlus` | OK |
| GET | `/api/teams` | Session; staff directory data | `getCurrentUser` | OK |
| POST | `/api/teams` | Admin+ | `isAdminPlus` | OK |
| GET | `/api/teams/[id]` | Session; staff directory data | `getCurrentUser` | OK |
| PATCH | `/api/teams/[id]` | Admin+ or the exact team manager | Admin+ or `manager_id === viewer.id` | OK |
| DELETE | `/api/teams/[id]` | Admin+ | `isAdminPlus` | OK |
| POST | `/api/teams/[id]/members` | Admin+ or exact team manager | Admin+ or `manager_id === viewer.id` | OK |
| DELETE | `/api/teams/[id]/members/[userId]` | Admin+ or exact team manager | Admin+ or `manager_id === viewer.id` | OK |
| PATCH | `/api/teams/[id]/members/[userId]` | Admin+ or exact team manager | Admin+ or `manager_id === viewer.id` | OK |
| GET | `/api/templates` | Session | `getCurrentUser` | OK |
| POST | `/api/templates` | Admin+ for template site | Flat Admin+ | GAP AUTH-01 |
| GET | `/api/templates/[id]` | Session | `getCurrentUser` | OK |
| PATCH | `/api/templates/[id]` | Admin+ for template site | Flat Admin+ | **GAP AUTH-01** |
| DELETE | `/api/templates/[id]` | Admin+ for template site | Flat Admin+ | **GAP AUTH-01** |
| GET | `/api/tiers` | Session | `getCurrentUser` | OK |
| POST | `/api/tiers` | Admin+ | `isAdminPlus` | OK |
| PATCH | `/api/tiers` | Admin+ | `isAdminPlus` | OK |
| DELETE | `/api/tiers` | Admin+ | `isAdminPlus` | OK |
| GET | `/api/users` | Session; private fields only for self/Admin+ | Returns unsanitized records | **GAP AUTH-04** |
| GET | `/api/users/[id]` | Session; private fields only for self/Admin+ | Sanitizer, but timezone remains public | GAP AUTH-04 |
| PATCH | `/api/users/[id]` | Self for profile; Admin+ for privileged fields/other users | Self/Admin+ plus field allowlist | OK |
| GET | `/api/users/[id]/notification-prefs` | Self or Admin+ | Self/Admin+ | OK |
| PATCH | `/api/users/[id]/notification-prefs` | Self or Admin+ | Self/Admin+ | OK |
| GET | `/api/users/[id]/notifications` | Self or Admin+ | Self/Admin+ | OK |
| PATCH | `/api/users/[id]/notifications` | Self or Admin+ | Self/Admin+ | OK |
| PATCH | `/api/users/[id]/publish` | Admin+ | `isAdminPlus` | OK |
| POST | `/api/users/[id]/resync-wp` | Self or Admin+ | Self/Admin+ | OK |
| PATCH | `/api/users/[id]/roles` | Admin+ | `isAdminPlus` | OK |
| POST | `/api/users/import` | Admin+ | `isAdminPlus` | OK |
| POST | `/api/users/me/onboarding` | Self | Updates `viewer.id` only | OK |
| GET | `/api/views` | Self-owned collection | Query binds `viewer.id` | OK |
| POST | `/api/views` | Self-owned collection | Insert binds `viewer.id` | OK |
| PATCH | `/api/views/[id]` | Owner | Read and update bind `viewer.id` | OK |
| DELETE | `/api/views/[id]` | Owner | Read and delete bind `viewer.id` | OK |

## Repair order

1. Introduce site-aware role helpers and reusable entry/graphics resource policies.
2. Close graphics, entry mutation, writer-claim, and comment-parent gaps with negative tests.
3. Sanitize staff-list output through one canonical projection.
4. Reconcile server page/navigation checks with the same policy functions in P1.5.
5. Repair cron transport and prove Vercel-shaped requests in P1.12.
