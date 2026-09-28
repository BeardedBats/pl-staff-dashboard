# PL Staff Dashboard — Complete Design Specification

**Audience:** AI agents and engineers working on this codebase.
**Generated:** 2026-07-21, from commit `a2af3ef` (branch `main`).
**Method:** Every statement in this document was verified by reading the actual source files, migrations, and configuration in this repository. Nothing is assumed or inferred from convention. Where the codebase is ambiguous, incomplete, or inconsistent, that is stated explicitly rather than papered over. Section 22 lists every known gap and discrepancy.

---

## 1. What this app is

The **PL Staff Dashboard** (`pl-staff-dashboard`) is the internal content-management and workflow hub for **Pitcher List** (pitcherlist.com, a fantasy-baseball publication) and its sibling site **QB List** (fantasy football). Its metadata description in `src/app/layout.tsx` reads: *"Pitcher List internal content management and workflow hub."*

### 1.1 The goal, start to finish

The app manages the entire life of an article from idea to published post to revenue attribution:

1. **Plan** — An entry (planned article) is created: manually, in bulk, via a recurring template generated on a schedule, or auto-picked-up from a draft someone started directly in WordPress.
2. **Claim** — A writer claims the entry. Managers approve claims (senior roles auto-approve). Approval automatically creates a WordPress draft post and links it to the entry.
3. **Write & gate** — The writer works through a per-tier required checklist. They cannot submit until every required checklist item is checked.
4. **Edit** — Submission flips the entry into the editing queue. Editors claim it, can bounce it back to the writer ("polishing") with a reason, and mark it edited — but only once every graphic request on the entry has been fulfilled (a second gate).
5. **Graphics** — Anyone on the entry can request graphics. Graphics staff claim requests on a kanban board, upload files to a **private Supabase Storage bucket**, and submit — which pushes the file into the WordPress media library and sets it as the post's featured image.
6. **Schedule & publish** — Scheduling and publishing happen **in WordPress, not in the dashboard**. A cron polls WordPress every 5 minutes; when WP reports a post as `future` or `publish`, the dashboard mirrors that as `scheduled`/`published`. These two statuses can never be set by hand.
7. **Measure** — A daily cron pulls per-page traffic from Google Analytics 4; Operations uploads Raptive ad-revenue spreadsheets. Both are matched to entries by URL, producing per-article and per-writer traffic, revenue, RPM, and revenue-per-word analytics visible only to EIC and Operations.
8. **Archive** — Entries are never deleted. Staff request archiving with a reason; managers approve. Admin-level roles archive directly. A Published Archive page also exposes ~10,000 historical WordPress posts back-imported to Oct 2022 for analytics continuity.

Supporting systems: role-tailored home dashboards, in-app notifications (with Discord/email planned but stubbed), @-mention comment threads per entry, an audit log on every entry, season modes that gate recurring-template generation, deadline and unclaimed-slot reminder crons, saved table views, a staff directory synced from WordPress profiles, and an onboarding tour for first-time users.

### 1.2 What it is not

- It is **not** a CMS. Article bodies live in WordPress. The dashboard stores workflow state, metadata, and analytics, and links out to WP for the content itself.
- It has **no public surface**. `robots` is `index:false, follow:false`; every page requires login.

---

## 2. Scaffolding, stack, and build system

### 2.1 Stack

| Layer | Technology | Notes |
|---|---|---|
| Framework | **Next.js 16.2.3** (App Router) | Bootstrapped with `create-next-app`. `AGENTS.md`/`CLAUDE.md` warn: *"This is NOT the Next.js you know"* — this version has breaking changes vs. model training data; the authoritative docs ship inside the package at `node_modules/next/dist/docs/` (present only after `npm install`) and must be read before writing code. |
| UI runtime | React 19.2.4 / react-dom 19.2.4 | |
| Language | TypeScript 5 (strict), path alias `@/*` → `./src/*` | |
| Styling | **Tailwind CSS v4** (`@tailwindcss/postcss`, `@import "tailwindcss"`, `@theme inline`) | No `tailwind.config` file; tokens are defined in `src/app/globals.css`. |
| Components | shadcn/ui-style primitives over **Radix UI**, variants via `class-variance-authority`, `clsx` + `tailwind-merge` (`cn()` in `src/lib/utils.ts`) | |
| Database | **Supabase** (Postgres) — 11 SQL migrations in `supabase/migrations/` | Accessed exclusively server-side via the **service-role** key (`@supabase/supabase-js`; `src/lib/supabase/admin.ts` imports `"server-only"`). |
| Auth | Custom JWT cookie sessions (`jsonwebtoken`); credentials validated against **WordPress application passwords** | No local passwords. See §7. |
| Validation | `zod` (35 source files) | Every API body/query and env var is zod-validated. |
| Tables | `@tanstack/react-table` (content table) | |
| Calendar | FullCalendar 6 (`daygrid`, `timegrid`, `list`, `interaction`) | |
| Drag & drop | `@dnd-kit` (graphics kanban) | |
| Charts | `recharts` 3 (analytics, home widgets) | |
| Onboarding | `react-joyride` v3 | |
| Spreadsheets | `xlsx` (SheetJS, pinned CDN tarball 0.20.3) — **read-only**, for Raptive upload parsing; exports are hand-built CSV | |
| Icons / fonts / theming | `lucide-react`; **DM Sans** (chrome) + **Work Sans** (data) via `next/font/google`; `next-themes` (class strategy, dark default) | Not Geist, despite the boilerplate README. |
| Deployment | **Vercel** — `vercel.json` defines 8 cron jobs (§18) | |

### 2.2 Declared but unused dependencies (verified: zero imports in `src/` and `scripts/`)

`sonner` (no toast system exists anywhere), `bcryptjs` + `@types/bcryptjs` (auth never hashes passwords locally), `react-hook-form`, `@hookform/resolvers`, `@supabase/ssr` (the plain supabase-js client is used instead), `discord.js`, `resend` (both are *planned* for notification delivery — currently name-checked only in stub comments in `src/lib/notifications/delivery.ts`), `@tanstack/react-virtual` (virtualization was deliberately skipped, see POLISH.md), `@radix-ui/react-toast`, `@radix-ui/react-tooltip`, `@radix-ui/react-progress`, `@radix-ui/react-radio-group`, `@radix-ui/react-scroll-area`.

### 2.3 Repository layout

```
pl-staff-dashboard/
├── AGENTS.md / CLAUDE.md        # AI instructions: read bundled Next.js docs first
├── POLISH.md                    # Living UI/UX backlog (see §21)
├── README.md                    # Untouched create-next-app boilerplate
├── package.json                 # Scripts: dev / build / start / lint (no test script)
├── next.config.ts               # images.remotePatterns only (supabase, pitcherlist, gravatar)
├── vercel.json                  # 8 cron schedules
├── eslint.config.mjs            # Flat config; eslint-config-next core-web-vitals + typescript
├── postcss.config.mjs           # @tailwindcss/postcss
├── tsconfig.json                # strict; @/* alias
├── .env.example                 # Full env contract (§5)
├── public/                      # create-next-app default SVGs (unused by the app)
├── scripts/ga4-full-backfill.ts # Standalone resumable GA4 backfill (§17.6)
├── supabase/migrations/         # 0001–0011 (§6)
└── src/
    ├── app/
    │   ├── layout.tsx, page.tsx, globals.css, favicon.ico
    │   ├── login/               # page.tsx + login-form.tsx
    │   ├── (app)/               # Authed shell: layout.tsx + 13 page areas (§19)
    │   └── api/                 # ~60 route handlers (auth, entries, claims, comments,
    │                            #   graphics, users, teams, templates, season-modes, tiers,
    │                            #   views, notifications, analytics, ga4, raptive, settings,
    │                            #   archive-requests, categories, admin, cron)
    ├── components/
    │   ├── ui/                  # 16 primitives (§20.4)
    │   ├── layout/              # header, sidebar, nav-config
    │   ├── entries/             # table, detail panel, create/bulk dialogs, status badges
    │   ├── comments/            # thread, composer, body
    │   ├── graphics/            # request card, create dialog
    │   ├── notifications/       # bell
    │   ├── users/               # staff card, role badge, user avatar
    │   ├── theme/               # provider, toggle
    │   └── onboarding/          # onboarding-tour
    ├── lib/                     # All server logic, one folder per domain:
    │   │                        #   analytics, archive-requests, auth, checklist, claims,
    │   │                        #   comments, entries, graphics, home, hooks, notifications,
    │   │                        #   recurring-templates, season-modes, supabase, teams,
    │   │                        #   users, views, wp-sync + env.ts + utils.ts
    └── types/database.ts        # Placeholder Supabase types (loose `any` shapes; §22)
```

### 2.4 Architectural conventions (consistent across the codebase)

- **Server components fetch, client components interact.** Pages under `(app)/` are mostly server components that call `src/lib/**` data functions directly, then hand data to a `*-page-client.tsx` or component. Client components mutate via `fetch()` to `/api/**`.
- **All data access is server-side through `getSupabaseAdmin()`** (service-role singleton). There is no browser Supabase client at all.
- **Authorization lives in route handlers**, not the database. Every API route starts with `getCurrentUser()` and applies role guards from `src/lib/auth/current-user.ts`. RLS exists only as a default-deny backstop (§6.3).
- **No Postgres transactions.** Multi-step mutations (e.g. role replacement, claim approval) run as sequential Supabase calls; routes document this as a known non-atomicity.
- **No PostgREST relational fan-out for large sets.** List queries batch-fetch related tables by ID and stitch in application code, after a class of bugs where `.in("entry_id", thousands-of-uuids)` exceeded URL limits and silently returned `[]` (fixed in commits `550b4c1`, `998fe88`, `1582feb`).
- **Every workflow mutation writes an `audit_log` row** via `writeAuditRow()` and most append to the entry's denormalized `recent_activity` JSONB cache (capped at 10, fire-and-forget).
- **Enums are TEXT + CHECK constraints**, never native Postgres enums.
- **API routes set `export const dynamic = "force-dynamic"`**; WP/cron/upload routes also set `runtime = "nodejs"` and, where long-running, `maxDuration` (60–300).
- **No test suite exists.** There is no test script, no test files, no CI config in the repo.

---

## 3. The sites, tiers, and season model

- **Sites:** `pl` (Pitcher List) and `qb` (QB List). Users/teams/templates can be scoped `pl`, `qb`, or `both`; entries and categories are strictly `pl` or `qb`. QB List integration is entirely optional — every QB env var is optional and each WP code path checks `WP_QB_URL` before running.
- **Tiers** (`tiers` table; seeded S=Annual, A=Daily, B=Weekly, C=Unscheduled with sort_order 0–3): cadence buckets that drive the per-tier checklist and table filters. Full CRUD in Settings (Admin+); deletion is blocked with HTTP 409 while any entry references the tier.
- **Season modes** (`season_modes`; seeded Pre-Season, In-Season *(active)*, Offseason): exactly one active at a time (enforced procedurally, not by constraint). The active season (a) selects which recurring templates generate and (b) supplies `auto_switch_start` as the anchor for the `{week}` title token. A daily cron auto-activates a mode whose `auto_switch_start`–`auto_switch_end` window contains today; modes without dates are manual-only.

---

## 4. Roles and the permission matrix

Seven roles (`user_roles.role`, per-site rows, `UNIQUE(user_id, role, site)`): **writer, editor, graphics, manager, admin, eic, operations**. A user's effective roles are the distinct flattened set. Helper predicates in `src/lib/auth/current-user.ts`:

- `hasRole(user, ...roles)` — any match.
- `isManagerPlus` — manager | admin | eic | operations.
- `isAdminPlus` — admin | eic | operations.
- `canViewAnalytics` — **eic | operations only**. Source comment: deliberately excludes `admin` *"so contractor admins handling pipeline state can't see revenue numbers."*
- `isOperations` — operations only (GA4 connect/disconnect/sync, Raptive upload, backfills, historical import).
- `canPublish` — `users.can_publish` flag OR isManagerPlus OR editor (flag exists; not otherwise consumed by the workflow routes).

### Verified capability matrix

| Action | Who |
|---|---|
| Create entry / edit entry fields | Any authenticated user (UI helper `canCreateEntry` requires ≥1 role) |
| Claim to write | Anyone, on `writer_needed` entries; **auto-approved** for manager/admin/eic/operations, else pending |
| Approve/deny writer claims; approve/deny archive requests; bulk operations | isManagerPlus |
| Submit content | The entry's **primary author only**, and only when required checklist items are complete |
| Send to polishing / claim edit / mark edited | editor, manager, admin, eic, operations (`canEditorAct`); mark-edited additionally gated on all graphics submitted |
| Toggle a checklist item | Primary author, an entry editor, or admin/eic/operations |
| Tier CRUD, checklist-template CRUD, template CRUD, season activation, WP sync status, user import, role editing, can_publish flag | isAdminPlus |
| Archive directly (skip request queue) | isAdminPlus |
| Unarchive (Archive page UI + bulk `unarchive`) | UI restricts to eic/operations; the underlying bulk API accepts isManagerPlus |
| Edit a comment | Comment author only |
| Delete a comment | admin/eic/operations |
| Graphics: claim/unclaim/upload/submit/flag | Any authenticated user per-card rules (§13.4); delete = creator or admin/eic/operations |
| Analytics pages & APIs | canViewAnalytics (eic/operations) |
| GA4 connect/sync/backfill, Raptive upload, historical import | isOperations |
| Editing Queue page | editor/manager/admin/eic/operations |
| Per-entry Analytics tab in the detail panel | admin/eic/operations (**inconsistency:** plain `admin` sees this mini view despite being excluded from `canViewAnalytics` — see §22) |
| Team edit / membership management | isAdminPlus OR that team's manager |
| Cron endpoints | `Authorization: Bearer CRON_SECRET`; most also accept a logged-in Admin+ session (exceptions: `deadline-reminders` and `season-switch` accept the secret only) |

---

## 5. Environment & configuration

`src/lib/env.ts` validates all env vars with zod at server module load and throws on failure (treeified error). `.env.example` documents every variable.

**Required:** `NEXT_PUBLIC_SUPABASE_URL` (URL), `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET` (≥32 chars), `JWT_REFRESH_SECRET` (≥32), `WP_PL_URL` (URL; default example `https://pitcherlist.com`), `WP_PL_USERNAME`, `WP_PL_APP_PASSWORD`, `NEXT_PUBLIC_APP_URL` (URL), `CRON_SECRET` (≥16).

**Optional:** `WP_QB_URL`, `WP_QB_USERNAME`, `WP_QB_APP_PASSWORD` (QB List); `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID` (planned Discord DMs); `RESEND_API_KEY`, `EMAIL_FROM` (planned email); `GA4_CLIENT_ID`, `GA4_CLIENT_SECRET`, `GA4_PROPERTY_ID` (GA4 OAuth; redirect URI is `${NEXT_PUBLIC_APP_URL}/api/ga4/callback`).

`next.config.ts` allowlists remote images from `*.supabase.co/storage/v1/object/public/**`, `pitcherlist.com`, `*.pitcherlist.com`, and gravatar hosts (user-uploaded graphics render with `unoptimized`). POLISH.md notes `NEXT_PUBLIC_SUPABASE_ANON_KEY` should be dropped from env if unused (it is not referenced anywhere in `src/`).

---

## 6. Database schema

Eleven migrations. **29 tables**, all in `public`. All enums are TEXT CHECK constraints. `pgcrypto` provides `gen_random_uuid()`. A shared trigger `set_updated_at()` maintains `updated_at` on users, teams, recurring_templates, entries, graphic_requests, comments, global_settings.

### 6.1 Tables (columns abridged to the semantically meaningful; all have `id UUID PK default gen_random_uuid()` and `created_at` unless noted)

**Identity & access**
- **users** — wp_user_id INT, wp_site (pl/qb/both), email (nullable since 0009, no unique constraint), display_name, avatar_url, bio, discord_id, twitter_handle, bluesky_handle, timezone (default `America/New_York`), theme (dark/light, default dark), auto_approve_drafts bool, can_publish bool, onboarding_completed bool, display_name_override bool (0009), last_wp_sync, updated_at.
- **user_roles** — user_id FK cascade, role (7-value CHECK), site (pl/qb/both), UNIQUE(user_id, role, site).
- **teams** — name, manager_id FK users, site, description (0003), updated_at.
- **team_members** — team_id FK cascade, user_id FK cascade, is_primary (0003; partial unique index: at most one primary team per user), UNIQUE(team_id, user_id).
- **sessions** — user_id FK cascade, token_hash, refresh_token_hash (SHA-256 hex), expires_at.

**Content pipeline**
- **tiers** — name, label, sort_order.
- **categories** — site (pl/qb), wp_category_id, name, is_active, synced_at.
- **season_modes** — name, is_active, auto_switch_start DATE, auto_switch_end DATE.
- **checklist_items** — tier_id FK cascade, label, sort_order, is_required (default true).
- **recurring_templates** — title_pattern, site (pl/qb), tier_id, category_id, default_publish_time TIME, assigned_user_id, description_template, season_mode_id (NOT NULL), schedule_rule JSONB, is_active, updated_at. Satellites: **recurring_template_roles** (role writer/editor/graphics, UNIQUE(template,role)), **recurring_template_checklist** (UNIQUE(template,item)).
- **entries** — the core table. title, description, site (pl/qb), tier_id, priority bool, publish_date TIMESTAMPTZ, publish_date_precision (exact/loose_date/loose_time/none), category_id, series_id FK recurring_templates, wp_post_id INT, wp_post_url (public permalink; admin-URL values purged by 0010), **content_status** (writer_needed/claim_requested/claimed/submitted/polishing + published for historical imports, 0010), **editor_status** (none/ready_for_edit/edited/scheduled + published, 0004/0010), is_archived, archive_reason, created_by, word_count, recent_activity JSONB (cap-10 event cache), wp_status (raw WP mirror, 0004), wp_modified_at (0004), published_at (0004), **is_drafted** (0006 — WP-discovered draft awaiting author approval), **is_historical** (0010 — back-imported post excluded from the active pipeline), updated_at.
- **entry_authors** — entry_id FK cascade, user_id, role (primary/co_author), UNIQUE(entry,user).
- **entry_editors** — entry_id FK cascade, user_id, claimed_at, UNIQUE(entry,user).
- **entry_checklist** — entry_id FK cascade, checklist_item_id, is_completed, completed_by, completed_at, UNIQUE(entry,item).
- **claims** — entry_id FK cascade, user_id, role_type (writer/editor/graphic), status (pending/approved/denied), approved_by, resolved_at.
- **archive_requests** — entry_id FK cascade, requested_by, reason, status (pending/approved/denied), resolved_by, resolved_at.
- **graphic_requests** — entry_id FK cascade, title, description, urgency_date, graphic_status (needed/claimed/submitted/flagged), claimed_by, file_url, flag_reason, updated_at; +0005: created_by, wp_media_id, file_name, file_size, mime_type, **storage_path** (key inside the private bucket), is_featured.
- **comments** — entry_id FK cascade, user_id, body, parent_id (self-ref, two-level threading), mentions JSONB, updated_at.
- **audit_log** — entry_id FK cascade, user_id, action (status_change/field_edit/claim/comment/archive/graphic_update/checklist/assignment/created/scheduled), field_name, old_value, new_value.
- **file_attachments** — entry_id FK cascade, uploaded_by, file_url, file_name, file_size, mime_type. **Schema-only: no code reads or writes this table.**

**Notifications & settings**
- **notifications** — user_id FK cascade, entry_id FK SET NULL, type (15-value CHECK, §14.1), title, body, is_read, discord_sent, email_sent. Partial index on (user_id, is_read) WHERE unread.
- **notification_preferences** — user_id FK cascade, event_type, discord_enabled/email_enabled/in_app_enabled (all default true), UNIQUE(user,event_type).
- **global_settings** — key UNIQUE, value JSONB, updated_at. Seeded: `deadline_reminder_hours=24`, `wp_poll_frequency_minutes=5`, `default_theme="dark"`, `unclaimed_alert_hours=12`. Also used as the KV store for GA4 tokens (`ga4_refresh_token`, `ga4_access_token`, `ga4_access_expires`, `ga4_property_id`, `ga4_last_synced_at`) and WP sync watermarks (`wp_last_sync_pl`, `wp_last_sync_qb`).

**Analytics**
- **article_analytics** — entry_id FK cascade, date, pageviews, sessions, avg_time_on_page REAL, new_users, returning_users (both always written 0 by the GA4 sync), synced_at, UNIQUE(entry_id, date).
- **raptive_revenue** — entry_id FK SET NULL (nullable — unmatched rows import anyway), date, page_url, earnings DECIMAL(10,4), rpm, page_rpm, sessions, pageviews, synced_at.
- **raptive_uploads** — uploaded_by, file_name, date_range_start/end, rows_imported.
- **saved_table_views** — user_id FK cascade, name, filters JSONB, sort JSONB, columns JSONB, grouping, is_default.

Performance indexes (0001): partial indexes on entries by (site,tier), publish_date, content_status, editor_status (all `WHERE is_archived=false`), series_id, plus author/graphic-status/pending-claims/comments/audit/sessions/users(wp) indexes; later migrations add wp_post_id, is_drafted, is_historical partials.

### 6.2 Migration timeline (what changed and why — from migration header comments)

| # | Purpose |
|---|---|
| 0001 | All 29 tables, indexes, `set_updated_at()` triggers. RLS intentionally NOT enabled; authorization is enforced in Next.js route handlers using the service-role key. |
| 0002 | Idempotent seeds: 4 tiers, 3 season modes, 4 global settings, per-tier default checklist items (S: Topic approved / Outline drafted / Featured image selected / SEO review complete; A: Player names verified / Stats current / Featured image loaded / Tooltips used / Twitter auto-post format correct; B: Data refreshed / Rankings consistent with prior week / Featured image loaded / Tooltips used; C: Draft review / Featured image loaded). |
| 0003 | Team model per Nick: `team_members.is_primary` + partial unique (one primary team per user), `teams.description`, membership indexes. |
| 0004 | WP-driven scheduling: editor_status gains `published`; entries gain `wp_status`, `wp_modified_at`, `published_at`. `scheduled`/`published` are set ONLY when WP reports `future`/`publish`. |
| 0005 | Graphics metadata: created_by, wp_media_id, file_name/size/mime, `storage_path`, `is_featured`. |
| 0006 | `entries.is_drafted` — WP-discovered drafts hidden from the main table until the author approves (or auto-approved via `users.auto_approve_drafts`). |
| 0007 | **Security:** enable + FORCE RLS on all 29 tables with **zero permissive policies** (default-deny), and `REVOKE ALL … FROM anon, authenticated`. Service-role bypasses RLS. Response to Supabase linter `rls_disabled_in_public` on all 29 tables. |
| 0008 | **Private graphics bucket:** `UPDATE storage.buckets SET public=false WHERE id='graphics'`. Reads switch to 1-hour signed URLs; stored `file_url` values are dead and are overwritten on every read (§13.2). |
| 0009 | `users.display_name_override` (protects admin edits from the WP profile-sync cron); email becomes nullable; clears `@example.com` placeholders. |
| 0010 | `wp_post_url` fix: purge admin-edit URLs (broke GA4/Raptive URL joins); add `is_historical`; extend content_status and editor_status CHECKs to allow `published`. |
| 0011 | `get_analytics_overview()` SQL RPC — pushes the entries × article_analytics × raptive_revenue join into Postgres to avoid PostgREST URL-length limits. |

### 6.3 Security model (three layers)

1. **Application layer (primary):** every route handler authenticates via signed JWT cookie and applies role predicates. All DB access uses the service-role key from `src/lib/supabase/admin.ts` (`server-only`, singleton, `autoRefreshToken:false, persistSession:false`).
2. **Database layer (backstop):** RLS enabled and FORCED on all 29 tables with no permissive policies, plus REVOKE from `anon`/`authenticated` — direct PostgREST access with the anon key returns empty/401/403. (POLISH.md still lists "live curl test against anon key after deploy" as an open verification item.)
3. **Storage layer:** the `graphics` bucket is private; files are only reachable through server-generated signed URLs with a 1-hour TTL (§13.2).

---

## 7. Authentication & sessions

There are no local passwords. **WordPress is the identity provider** via [application passwords](https://make.wordpress.org/core/2020/11/05/application-passwords-integration-guide/) and REST Basic auth.

### 7.1 Login flow (`POST /api/auth/login` → `performLogin` in `src/lib/auth/login.ts`)

1. `validateWpAnywhere(username, password)` (`src/lib/auth/wordpress.ts`) — tries **PL first**, and on `invalid_credentials` falls through to **QB**. Validation = `GET {site}/wp-json/wp/v2/users/me?context=edit` with `Basic base64(user:pass)` (whitespace stripped from the app password). Errors map to HTTP: invalid_credentials→401, network→502, not_configured/unexpected→500.
2. `upsertUserFromWp` — matches the existing `users` row **by email** (the stable cross-site identifier). Existing: updates wp_site (bumps to `both` when logging in from the other site), display_name, avatar_url, bio, last_wp_sync. New: inserts the user and seeds one role via `wpRoleToDashboardRole` (WP administrator→admin, editor/author→editor, else writer — deliberately conservative; escalation is manual in Settings).
3. Creates a `sessions` row, then a token pair bound to the real session id (the first pair uses a placeholder sid and is immediately replaced), stores SHA-256 hashes of both tokens on the row, and sets cookies.

### 7.2 Tokens & cookies (`src/lib/auth/session.ts`)

- Access token: JWT `{sub: user_id, sid: session_id, kind:"access"}`, signed with `JWT_SECRET`, **15 minutes**, cookie `pl_at`.
- Refresh token: `kind:"refresh"`, signed with `JWT_REFRESH_SECRET`, **7 days**, cookie `pl_rt`.
- Both cookies HttpOnly, SameSite=Lax, path=/, `secure` in production. Issuer `pl-staff-dashboard`.
- `POST /api/auth/refresh` rotates: verifies the refresh JWT, requires a `sessions` row matching both `sid` and the refresh-token hash (making a stolen refresh token single-use), checks expiry, mints a new pair, updates hashes in place, resets cookies.
- `POST /api/auth/logout` best-effort deletes the session row and clears cookies. `GET /api/auth/me` returns the current user or 401.
- `getCurrentUser()` (`src/lib/auth/current-user.ts`) is the canonical server-side identity: verifies the access cookie's signature and loads the user + roles. Note: it does **not** consult the `sessions` table — revocation only bites at refresh time (≤15 min window).

---

## 8. Users, staff directory, and teams

### 8.1 User management

- `listUsers` (`src/lib/users/queries.ts`) powers `/staff` and Settings: paginated (default 50, max 200), search on display_name/email, site filter, with roles and team memberships stitched from batched queries; role/team filters applied in memory after pagination.
- Admin+ can: **import** a WP user by ID or username (`POST /api/users/import`; staff-only — WP roles administrator/editor/author), **edit** any user (display name, wp_site, can_publish, full role set with per-site rows, primary team) via `EditUserDialog` → `PATCH /api/users/[id]`, toggle `can_publish` inline, and **re-sync** a user from WP.
- Users self-edit their profile in Settings (`profile-form.tsx` → same PATCH): bio, twitter/bluesky handles (validated), discord_id (numeric), timezone, theme, auto_approve_drafts. Admin-only fields (`wp_site, can_publish, roles, team_id`) are rejected with 403 for non-admins.
- Setting `display_name` through the update path flips **`display_name_override=true`**, which the profile-sync cron honors (it then syncs only bio/avatar). **Known gap:** the manual `resyncUserFromWp` helper does *not* honor the flag and overwrites display_name (§22).
- `GET /api/users/[id]` sanitizes: email, discord_id, theme, can_publish, onboarding_completed, auto_approve_drafts are visible only to self or Admin+.

### 8.2 Staff directory (`/staff`, `/staff/[id]`)

Grid of `StaffCard`s (avatar, name, site badge, primary team + manager, bio clamp, role badges) with URL-driven filters (debounced search, role, site, team) and a skeleton `loading.tsx`. The profile page shows identity, socials, timezone, and all team memberships; private fields gated to self/Admin+.

### 8.3 Teams

Teams have one **manager** (`teams.manager_id`) and members with an **is_primary** flag (at most one primary team per user, DB-enforced). Model comment (0003): writers have a single main manager plus secondary category memberships under different managers. CRUD: Admin+ creates/deletes teams; Admin+ **or the team's own manager** edits details and manages members (non-admin managers cannot reassign `manager_id`). The Settings panel is a master/detail with add/remove/make-primary member actions; eligible managers are filtered client-side to editor/manager/admin/eic/operations.

---

## 9. The entry workflow (core state machine)

Defined in `src/lib/entries/status-transitions.ts`. Three parallel tracks per entry:

```
CONTENT (staff-driven):
  writer_needed → claim_requested → claimed → submitted ⇄ polishing
       ↑ (deny claim)                  (auto-approve skips claim_requested)

EDITOR (staff-driven to "edited", WordPress-driven after):
  none → ready_for_edit → edited → scheduled → published
         (auto on submit)  (gated)   (WP `future`) (WP `publish`)

GRAPHICS (per graphic request, §13):
  needed → claimed → submitted ; flagged ⇄ (claimed|needed)
```

**Transitions, exactly as enforced:**

- **`submitContent`** — from `claimed` or `polishing`; caller must be the primary author; **gate 1:** `findMissingRequiredItems` must return empty (every required checklist item checked) else `gate_blocked` listing missing labels. Side effects: editor_status `none→ready_for_edit`, audit rows, recent-activity, `triggerContentSubmitted` (notifies editor+).
- **`sendToPolishing`** — from `submitted` only, `canEditorAct` roles, requires a non-empty reason. The route also posts a system comment (bold **"Polishing request"** header) and notifies the authors.
- **`claimEdit`** — `canEditorAct`, only when `ready_for_edit`; inserts into `entry_editors` (idempotent by unique constraint); does not change editor_status.
- **`markEdited`** — `canEditorAct`; requires content_status `submitted` (gate) AND **gate 2:** every `graphic_request` on the entry has `graphic_status="submitted"` (or there are none) else `gate_blocked` with flagged/pending counts. Idempotent when already `edited`.
- **`applyWpStateToEntry`** — the only path to `scheduled`/`published`. Called from WP sync/refresh; maps WP `future`→scheduled (unless already published), `publish`→published (forward-only), records wp_status/wp_modified_at/published_at, audits as "(via WP sync)", fires `triggerEntryScheduled`/`triggerEntryPublished` to the authors.

Error taxonomy → HTTP: `not_found`→404, `forbidden`→403, `invalid_transition`/`gate_blocked`→409, `db_error`→500.

### 9.1 Entry creation paths

1. **Manual** (`CreateEntryDialog` → `POST /api/entries`): title, brief, site, tier, category (auto-filtered by site), publish date + precision, priority. Seeds the tier's checklist into `entry_checklist`. Optional assignees: first becomes primary author and content_status starts at `claimed`.
2. **Bulk** (`BulkCreateEntryDialog`): shared site/tier/precision/default-category + up to 25 per-row title/date/category rows; fires N parallel `POST /api/entries` via `Promise.allSettled` (no dedicated bulk-create endpoint, by design — reuses validation and audit) and reports per-row failures.
3. **Recurring templates** (§15): daily cron materializes the next 14 days.
4. **WordPress draft pickup** (§16.2): the 5-minute sync creates `is_drafted` entries for drafts started directly in WP.
5. **Historical import** (§17.7): back-imports published WP posts as `is_historical` entries.

### 9.2 Claims (writer track)

`createClaim` (`src/lib/claims/data.ts`): writer-type only (editors use claimEdit; graphics use graphic requests), entry must be `writer_needed`. Senior roles (manager/admin/eic/operations) are **auto-approved** and the entry jumps straight to `claimed`; everyone else creates a pending claim, the entry shows `claim_requested`, and managers are notified. **Approval** inserts the primary `entry_authors` row, flips to `claimed`, and — critically — calls `createWpDraftForEntry` to create the linked WordPress draft (best-effort; failures audited as `wp_draft_create_error`). **Denial** reverts to `writer_needed`. Managers see all pending claims (`listPendingClaims`; team-based routing is documented as deferred) in the home-page Manager Inbox.

### 9.3 Checklists

`checklist_items` are per-tier templates (label, sort_order, is_required) with Admin+ CRUD in Settings (tier is locked on edit — move = delete + recreate). Entries snapshot the tier's items at creation into `entry_checklist`. Toggling (`PATCH /api/entries/[id]/checklist/[itemId]`) is allowed for the primary author, entry editors, or admin/eic/operations, records who/when, and audits. Required items gate submission (§9, gate 1).

### 9.4 Comments & mentions

Two-level threaded comments per entry. `@mention` parsing: regex `@([A-Z][A-Za-z0-9'.-]*(?:\s[A-Z][A-Za-z0-9'.-]*){0,2})` (capitalized, up to 3 tokens), resolved against up to 500 users in 3 passes (exact → startsWith → first-name); unresolved mentions are silently dropped; resolved ones are stored on the comment and trigger `mention` notifications. The composer has full keyboard-driven autocomplete (lazy staff load, Cmd/Ctrl+Enter submit). Edit = author only; delete = admin/eic/operations, hard-delete with confirm. System comments (polishing) store `**Label**\n\n` and render an amber header. All comment activity audits and appends to `recent_activity`.

### 9.5 Archive & archive requests

Entries are never hard-deleted (no DELETE route exists). `POST /api/entries/[id]/archive` with a reason: Admin+ archives directly; everyone else creates an `archive_requests` row (managers notified, approve/deny in Manager Inbox; approval sets `is_archived` + reason). Bulk archive/unarchive exists for isManagerPlus. The `/archive` page (§19) lists archived entries (unarchive button shown only to eic/operations) and, on a second tab, historical imports.

### 9.6 Bulk operations (`POST /api/entries/bulk`, isManagerPlus)

Actions on 1–200 entry ids: `archive` (reason defaults "Bulk archived"), `unarchive`, `set_priority`, `change_tier`. One bulk UPDATE + per-entry audit rows. Status-changing bulk actions are deliberately unsupported (per source comment: they'd need per-entry validation, notifications, and WP side effects).

### 9.7 Audit & recent activity

`audit_log` accumulates every mutation (10 action kinds); `GET /api/entries/[id]/audit` returns the latest 200 with actor names for the detail panel's timeline. `entries.recent_activity` is a denormalized newest-first JSONB cache (max 10) written fire-and-forget for cheap display in lists/widgets.

---

## 10. Saved views

`saved_table_views` stores per-user named filter/sort/column/grouping presets for the content table, with a single `is_default` (cleared on set). CRUD via `/api/views` (owner-scoped). The content table's toolbar popover applies/saves (via `window.prompt`)/sets-default/deletes views, and the default view auto-applies on mount.

---

## 11. Pages & navigation

Nav (`src/components/layout/nav-config.ts`, in order): Home `/home`, Content Table `/content`, Calendar `/calendar`, My Tasks `/my-tasks`, Editing Queue `/editing-queue` (editor+), Graphic Requests `/graphics`, Published Archive `/archive`, Analytics `/analytics` (eic/operations), Staff Directory `/staff`, Notifications `/notifications`, Settings `/settings`. Root `/` redirects to `/home` or `/login`; the `(app)/layout.tsx` shell enforces auth, renders sidebar (desktop) + header + onboarding tour.

| Page | What it shows (verified) |
|---|---|
| `/home` | Role-tailored widget dashboard (§12). |
| `/content` | The pipeline table (§11.1) + create/bulk-create dialogs. Header: *"The pipeline. Every article, every tier, every status in one table."* |
| `/calendar` | FullCalendar month/week/agenda of entries with publish dates (server preload −30/+90 days, limit 500; client refetch on site/tier filter). Tier colors: S=amber, A=cyan, B=violet, C=gray. All-day unless precision exact/loose_time. Click → `/content?entry=ID`. Separate "Unscheduled" list (top 10). |
| `/my-tasks` | Two parallel lists: my writing (`authorId=me`, status claimed/polishing) and my editing (`editorId=me`, ready_for_edit/edited), plus an 8-item upcoming-deadlines rail with overdue/due-soon coloring and checklist progress. |
| `/editing-queue` | Editor+ only (redirects home otherwise). Entries with editor_status ready_for_edit/edited, publish-date ascending, with author/tier/status columns, overdue red / due-in-24h amber, and editor avatars or "Unclaimed". |
| `/graphics` | Card grid + kanban of graphic requests (§13.4) with status tallies, search, status/site filters. |
| `/archive` | Client page, two server-paginated tabs (page size 50): **Archived** (with reason; unarchive for eic/ops) and **Historical imports** (with WP permalink links). Site filter + debounced search per tab. |
| `/analytics` | EIC/Ops only, 4 tabs (§17.5). |
| `/staff`, `/staff/[id]` | Directory + profile (§8.2). |
| `/notifications` | Full notification list: type filter (15 types), unread-only toggle, mark all/one read, Discord/email sent markers. |
| `/settings` | Tabbed hub: Profile + Notification prefs (everyone); Users, Teams, Templates, Season, Tiers+Checklists, Sync panels (Admin+); Analytics panel (EIC/Ops, with Operations-only connect/upload controls). |
| `/login` | WordPress-credential form over the mesh-gradient brand background. |

### 11.1 The content table (`EntriesTable`)

TanStack-table client component. 12 columns (8 visible by default: title, authors, content/editor/graphic status, tier, site, publish date; hidden: category, checklist progress, word count, updated). URL-less local filter state (search, site, tier, content/editor status, priority, include-archived, sort) debounced 200ms against `GET /api/entries?limit=100`. Rows expand inline into the **entry detail panel**; `writer_needed` rows get an amber highlight; selection checkboxes drive the bulk-action bar; mobile renders cards instead (bounded `max-h-[70vh]` scroll with sticky header on desktop — full virtualization was skipped because expandable rows break uniform row height, per POLISH.md).

### 11.2 The entry detail panel (`EntryDetailPanel`)

Fetches the entry, its graphic requests, and `/api/auth/me`; computes `isAuthor`/`isEditorLike`/`isAdminLike` capabilities. Context-sensitive action buttons (Claim to write / Submit — disabled with a tooltip listing missing checklist items / Send to polishing (reason dialog) / Claim edit / Mark edited / Archive (reason dialog)), "Edit in WordPress" permalink link and a per-entry "Refresh WP" button. Four tabs: **Pipeline** (three-track status summary, brief, interactive checklist, graphics cards), **Comments** (thread), **Audit** (timeline), **Analytics** (admin/eic/ops: 30-day pageviews/sessions/revenue/RPM pulled from the articles API).

---

## 12. Home dashboards (role-tailored)

`/home` runs up to 15 read-only fetchers in one `Promise.all`, gated by role fit (`src/lib/home/widgets.ts`, server-only):

- **Manager+**: **Manager Inbox** — pending writer claims and archive requests with inline Approve/Deny.
- **EIC/Ops row**: Pipeline Health (6 count tiles: writer needed / claimed / ready for edit / polishing / scheduled / published-7d, each linking to a filtered view, plus amber warnings for gate-blocked and drafted counts); Analytics Mini (7-day pageviews + revenue with a recharts sparkline; gated by `canViewAnalytics`); WP Sync Health (PL/QB last-sync freshness badges).
- **Writer row** (writers and above): My Active Claims (overdue-flagged), My Upcoming Deadlines, My Submitted (in editing), My Drafts To Approve (WP pickups), and Open Writer Slots (pure writers see it here; multi-role writers see it in a bottom row).
- **Editor row**: Editing Queue preview + My Active Edits.
- **Graphics row**: Open Graphic Requests + My Graphics In Progress.
- **Stale Entries** for EIC/Ops.

All widgets share `WidgetShell` (icon, title, count badge, "View all" link) and the compact `EntryList` row (priority star, site badge, tier, date with overdue warning).

---

## 13. Graphics subsystem — including the file "vault"

### 13.1 A note on the word "vault"

**The term "vault" does not appear anywhere in this codebase** — not in code, comments, migrations, docs, or commit messages (verified by repository-wide search). What the project *does* have is a locked-down private file store for graphics that functions like a vault, described below, plus the default-deny RLS posture (§6.3) and the Published Archive (§9.5). This spec documents the storage system factually; if "vault" refers to something else planned or discussed outside this repository, it is not represented in the code today.

### 13.2 The private storage bucket & signed-URL system (`src/lib/graphics/storage.ts`)

- **Bucket:** Supabase Storage bucket `graphics`, made **private** in migration 0008 (`public=false`). Rationale from the migration: table RLS (0007) is a separate trust boundary from Storage — a public bucket let anyone who guessed a path hotlink files.
- **Writes:** server-side only, via the service-role client. Path convention `{entryId}/{Date.now()}-{sanitizedFilename}`; filename sanitization strips directories, NFKD-normalizes, removes non `[a-zA-Z0-9._-]`, truncates to 120 chars. Constraints: max **10 MB**, MIME allowlist png/jpeg/jpg/webp/gif, `cacheControl` 1 year, no upsert.
- **Reads:** every read regenerates a **signed URL with a 1-hour TTL** (`SIGNED_URL_TTL_SECONDS = 3600`). `getSignedGraphicUrl` (single) and `getSignedGraphicUrls` (batch, one round-trip for lists). The persisted `graphic_requests.file_url` column is explicitly documented in code as *"useless on its own"* — `lib/graphics/data.ts` overwrites `file_url` with a fresh signed URL on **every** read (list and detail). Old public CDN URLs 403/400 by design.
- Also provided: `deleteStoredGraphic` (idempotent; called best-effort after request deletion and on re-upload), `downloadGraphicBytes` (feeds the WP media push).

### 13.3 Request lifecycle

Statuses: `needed → claimed → submitted`, with `flagged` as a repair loop. Data layer (`src/lib/graphics/data.ts`): create (anyone on the entry; notifies graphics staff), claim (from `needed` only), unclaim (claimer or admin/eic/ops), flag (requires a reason; notifies the claimer or the graphics team), unflag (back to `claimed` if still claimed else `needed`), edit, delete (creator or admin/eic/ops; returns the storage path so the route can clean up the file). Every action writes an audit row on the parent entry.

**Submit** (`src/lib/graphics/submit-flow.ts`, `POST /api/graphic-requests/[id]/submit`): requires an uploaded file and that the parent entry already has a `wp_post_id` (i.e. a writer claim was approved — the error message says exactly that). Steps: download bytes from Storage → `uploadMediaToWp` (raw-bytes POST to `/wp-json/wp/v2/media` with Content-Disposition) → `setFeaturedMedia` on the WP post → unfeature any other graphics on the entry → mark this request `submitted` + `is_featured` + `wp_media_id` → audit → notify the entry's creator and authors. WP failures audit as `wp_media_upload_error`/`wp_featured_set_error` and return 502.

**Upload** (`POST /api/graphic-requests/[id]/upload`): multipart, blocked once `submitted`, replaces the previous file (best-effort delete), stores path/name/size/mime plus a most-recent signed URL as a hint.

### 13.4 Graphics UI

`/graphics` offers a card grid and a **@dnd-kit kanban** with columns Needed / In Progress (claimed) / Submitted / Flagged. Drag rules are whitelisted: needed→claimed (claim), claimed→needed (unclaim), flagged→needed|claimed (unflag); everything else is blocked — the Submitted column is locked to the real submit flow, and flagging by drag is disabled because it requires a reason. Card capabilities: claim when needed; unclaim by the claimer; upload unless submitted; "Submit to WP" when claimed with a file; flag when claimed/submitted (reason dialog); unflag when flagged; delete by creator (unless submitted). Featured graphics show a star; thumbnails render the signed URL via `next/image` `unoptimized`.

---

## 14. Notifications

### 14.1 Event types (15, matching the DB CHECK)

`new_claimable`, `claim_requested`, `claim_resolved`, `content_submitted`, `sent_to_polishing`, `graphic_requested`, `graphic_submitted`, `graphic_flagged`, `deadline_approaching`, `entry_scheduled`, `entry_published`, `mention`, `archive_requested`, `unclaimed_slot`, `priority_flagged`.

**Note:** no code path ever emits `new_claimable` or `priority_flagged` — the types exist in the schema, defaults, and UI filter, but no trigger fires them (§22).

### 14.2 Channels & delivery

Three channels per event: **in-app** (a `notifications` row — fully implemented), **Discord DM** and **email (Resend)** — both **stubs** in `src/lib/notifications/delivery.ts`: without tokens configured they log `[discord stub]`/`[email stub]` and report success; with tokens they log "unimplemented" warnings. The planned implementations (discord.js DM, Resend SDK) are named in comments and the packages are already in `package.json`. `dispatchNotification` resolves the recipient's per-event channel preferences (explicit row wins, else role defaults), inserts the in-app row, invokes the channel stubs, and flips `discord_sent`/`email_sent` flags. It never throws.

### 14.3 Preferences & defaults (`src/lib/notifications/defaults.ts`)

Role-based default matrices (writer ⊂ editor ⊂ manager ⊂ admin; graphics has its own; eic/operations reuse admin's) are OR-merged across a user's roles, then a floor forces **in-app ON** for directly-targeted events (`mention`, `claim_resolved`, `sent_to_polishing`, `graphic_flagged`) regardless of roles. The Settings panel renders the full 15×3 switch matrix grouped as "Your work / Pipeline / Scheduling / Admin" and saves the complete matrix (delete-and-reinsert).

### 14.4 Surfaces

Header **bell** polls `/api/users/[id]/notifications?limit=10` every 30 s, badge caps at 99+, popover with mark-read and a link to `/notifications` (full page: filters, unread toggle, mark-all). Notification rows deep-link to `/content?entry={id}` (or a custom `actionPath` such as `/graphics`).

### 14.5 Trigger inventory (`src/lib/notifications/trigger.ts` — all best-effort, actor always excluded)

mention → mentioned users; claim_requested → manager+; claim_resolved → the claimer; content_submitted → editor+; sent_to_polishing → entry authors; graphic_requested → graphics staff + admin/eic/ops; graphic_submitted → entry creator + authors; graphic_flagged → the claimer (else graphics team); archive_requested → manager+; entry_scheduled / entry_published → entry authors (fired from WP sync). `deadline_approaching` and `unclaimed_slot` are dispatched directly by their crons (§18).

---

## 15. Recurring templates & generation

Templates define: `title_pattern` with tokens `{date}`, `{month}`, `{week}` (week-of-season, anchored to the active season's `auto_switch_start`), `{day_of_week}`; site, tier, optional category, optional default publish time (combined with the date in `America/New_York` by default, converted to a correct UTC instant), optional assigned writer, description template, owning **season mode**, and a JSONB `schedule_rule` — a discriminated union: `daily{days[]}` / `weekly{day}` / `monthly{day_of_month 1–28}` / `yearly{month, day_of_month 1–28}` (capped at 28 to avoid end-of-month gaps). `describeSchedule` renders human strings ("Every weekday", "3rd of each month", …).

**The generator** (`runGenerator`, daily cron at 05:17 UTC + a "Run generator" button in Settings): resolves a system user (first admin/eic/operations) for attribution, loads the active season, and for each active template *belonging to that season* computes occurrences in a **14-day window**, deduplicates against existing entries with the same `series_id` on the same UTC calendar day (safe against repeated runs), renders the title, and inserts the entry — `claimed` with a primary author if the template has an assignee, else `writer_needed`; precision `exact` with a default time else `loose_time`; tier checklist seeded; audit `created`. Admin+ CRUD via `/api/templates` and the Settings panel with a schedule-builder dialog (day chips default Mon–Fri, etc.).

---

## 16. WordPress integration (four sync surfaces)

All WP calls use REST with application-password Basic auth from env; QB paths run only when `WP_QB_URL` is configured.

1. **Draft creation on claim approval** (`createWpDraftForEntry`): idempotent POST `/wp/v2/posts` `{title, status:"draft", author: wp_user_id}`; stores `wp_post_id` and `wp_post_url = link` (the public permalink — required for analytics URL joins).
2. **Post reconciliation** (`syncWpPostsForBothSites`, cron every 5 min): fetches posts `modified_after` a per-site watermark (kept in `global_settings`, default lookback 7 days), statuses draft/pending/future/publish, ordered by modified. Existing entries (matched by `wp_post_id`+site): refresh permalink, then `applyWpStateToEntry` (→ scheduled/published mirroring, notifications). Unknown posts: only draft/pending become new entries — created as `claimed`, `is_drafted = !author.auto_approve_drafts`, requiring a WP-author→dashboard-user match (else skipped and counted); published/future strangers are skipped to avoid backdating history. Drafted entries are hidden from the main table until the author approves via `POST /api/entries/[id]/approve-draft` (creator/author/Admin+). Per-entry "Refresh WP" (`refreshWpStatusForEntry`) does the same reconciliation on demand, handles WP 404 as `wp_status="trash"`, and tracks permalink changes (draft `?p=N` → clean slug).
3. **Profile sync** (`syncWpProfiles`, cron every 6 h): refreshes display_name/bio/avatar_url for every user with a `wp_user_id`, skipping display_name when `display_name_override` is set; only writes when something changed.
4. **Category sync** (`syncWpCategoriesForBothSites`, weekly): paginates `/wp/v2/categories`, creates/renames, and soft-deactivates categories that disappeared from WP.

The Settings **Sync panel** (Admin+) shows last-sync watermarks (`GET /api/settings/wp-sync-status`) and manual "Sync now" buttons that POST the cron endpoints using the admin-session fallback; it also hosts the Operations-only historical import UI (§17.7).

---

## 17. Analytics subsystem

**Access:** viewing = EIC + Operations (`canViewAnalytics`); connecting/uploading/backfilling = Operations only. Plain admins are deliberately excluded from revenue (§4).

### 17.1 GA4 integration (`src/lib/analytics/ga4.ts`)

Direct `fetch` against Google OAuth 2 and the GA4 Data API (no googleapis SDK). Credentials live in `global_settings`: `ga4_refresh_token`, cached `ga4_access_token` + `ga4_access_expires` (refreshed with a 60 s margin), `ga4_property_id` (setting overrides env). OAuth: `buildAuthorizeUrl` (offline access, consent prompt) → `/api/ga4/callback` exchanges the code and stores the refresh token → redirect to `/settings?tab=analytics&ga4=connected`. `syncGa4(dateFrom?, dateTo?)` — defaults to **yesterday** (UTC) — runs one report (`pagePath` × `date`; `screenPageViews`, `sessions`, `averageSessionDuration`; limit 100 000), maps pagePaths to entries via `normaliseUrl(wp_post_url)`, aggregates with pageview-weighted average time, and upserts `article_analytics` on `(entry_id, date)`. Unmatched paths are skipped. `new_users`/`returning_users` are always written as 0.

### 17.2 URL normalization — the join key

`normaliseUrl` (in `raptive.ts`, shared by the GA4 sync): lowercase; strip scheme, `www.`, host, leading slash, query, hash, trailing slashes. This is what lets GA4 `pagePath` and Raptive `page_url` match `entries.wp_post_url` — and why migration 0010 purged admin-URL values (commit `f2bc7fa` fixed the zero-match bug). The standalone backfill script uses a different pathname-based normalization (`new URL().pathname`, lowercased, trailing slash stripped).

### 17.3 Raptive revenue (`src/lib/analytics/raptive.ts`)

Operations uploads Raptive XLSX/XLS exports through a drag-drop dialog. Parsing: SheetJS, first sheet, loose header matching (date/day, page url/url/path/permalink, earnings/revenue, rpm, page rpm, sessions, pageviews), tolerant coercion (Excel serial dates, `$`/`,` stripping). Flow is two-phase: **preview** (row count, date range, matched/unmatched counts with up to 10 sample unmatched URLs, total earnings) then **commit** — which **deletes all `raptive_revenue` rows inside the file's date range** and inserts the new set in 500-row chunks (re-upload = replace period), recording a `raptive_uploads` history row (last 50 shown in Settings). Unmatched rows import with `entry_id = null` (site-total revenue is preserved; the dialog says so).

### 17.4 Query layer (`src/lib/analytics/queries.ts`)

Filters (zod): dateFrom/dateTo (default last 30 days), site, tier, category, author. **Overview** uses the Postgres RPC `get_analytics_overview` (0011) joining analytics × entries × summed Raptive earnings server-side; the app dedupes the per-entry earnings (the RPC repeats them on every date row) and distributes them across days proportional to pageviews for the daily chart; RPMs = earnings/sessions·1000 and earnings/pageviews·1000. **Articles**: per-entry totals (Raptive pageviews/sessions only backfill when GA4 has none, avoiding double counts), sorted by earnings. **Writers**: primary authors only; aggregates articles/pageviews/earnings/word counts → **revenue per word**. **Trends**: publish-to-peak curve (average pageviews by day-since-publish, 0–30) and a day-of-week × week heatmap (GA4 is daily, so no hour granularity). Entry filtering deliberately ignores publish_date (old articles accrue views in-window); date filtering hits the analytics tables and the rest joins in memory (PostgREST URL-length lesson, §2.4).

### 17.5 Analytics UI (4 tabs + toolbar)

Filter bar (dates + 7/30/90-day presets, site, tier, site-aware category, author) drives all tabs. **Overview**: six metric cards (Articles, Pageviews, Sessions, Revenue, Page RPM, Session RPM) + dual-axis area chart (pageviews cyan / earnings amber). **Articles** and **Writers**: sortable tables with CSV export endpoints and mobile card layouts. **Trends**: dual-axis line chart, revenue-by-tier and pageviews-by-tier bars, publish-to-peak line, pure-CSS heatmap (cyan opacity ramp). "Print / PDF" = `window.print()` with `@media print` rules (forced light palette, chrome hidden, scroll containers expanded). Raptive upload button appears only for Operations.

### 17.6 Backfills

- **In-app** (`POST /api/admin/ga4-backfill`, Operations, maxDuration 120): monthly-chunked `syncGa4` loop over an arbitrary range (monthly because GA4's 100k-row cap otherwise fills with peak days — commit `ce1f85f` "traffic cliff artifact").
- **Standalone script** (`scripts/ga4-full-backfill.ts`, run locally with `npx tsx`): **day-by-day** from `2022-10-01` to yesterday — a single-day report returns every page with traffic that day, defeating the row cap for the long tail. Reads `.env.local` itself, paginates entries past the 1000-row PostgREST cap, is **resumable** (resumes from `MAX(date)` in `article_analytics`; interactive resume/overwrite/quit prompt with a 10 s default), throttles 200 ms/day.

### 17.7 Historical import (`POST /api/admin/historical-import`, Operations, maxDuration 300)

Back-imports all **published** WP posts since `2022-09-30T23:59:59` (≈10 441 posts per the UI's page estimate) as entries with `is_historical=true`, `content_status/editor_status = "published"`, real permalinks, category and author matches where possible (system-user fallback for the FK; `entry_authors` only for real matches). Idempotent on `(wp_post_id, site)`; paginated (`start_page`/`max_pages`, default 20 pages of 100) with a `nextPage` cursor the Settings UI loops over; `dry_run` supported. Historical entries are excluded from the pipeline, queues, calendar, and alert crons but power analytics and the archive tab.

---

## 18. Cron jobs (vercel.json, UTC)

| Path | Schedule | Auth | What it does |
|---|---|---|---|
| `/api/cron/wp-sync` | `2-59/5 * * * *` (every 5 min) | secret or Admin+ | WordPress post reconciliation + draft pickup (§16.2). |
| `/api/cron/recurring-generate` | `17 5 * * *` | secret or Admin+ | Template generator, 14-day window (§15). |
| `/api/cron/season-switch` | `0 6 * * *` | **secret only** | Auto-activates the season whose date window contains today; manual (dateless) modes untouched. |
| `/api/cron/ga4-sync` | `47 7 * * *` | secret or Admin+ | Pulls yesterday's GA4 report; soft-skips when not configured/connected. |
| `/api/cron/deadline-reminders` | `0 * * * *` (hourly) | **secret only** | Notifies primary authors + editors of entries publishing within `deadline_reminder_hours` (setting, default 24); 24 h per-user-per-entry dedupe; times formatted in each recipient's timezone. |
| `/api/cron/unclaimed-alerts` | `13 */3 * * *` | secret or Admin+ | Alerts manager+ about `writer_needed` entries publishing within 72 h (hardcoded; the seeded `unclaimed_alert_hours=12` setting is not read — §22); 24 h dedupe. |
| `/api/cron/profile-sync` | `23 */6 * * *` | secret or Admin+ | WP profile refresh (§16.3). |
| `/api/cron/category-sync` | `37 3 * * 0` (weekly Sun) | secret or Admin+ | WP category reconciliation (§16.4). |

All cron routes are `runtime="nodejs"`, `force-dynamic`, and export **POST only**. **Discrepancy to verify:** Vercel Cron invokes scheduled paths with GET; with only POST exported these fire 405s unless something rewrites the method — flagged in §22.

---

## 19. Design system — "PLPD, Subtle Glass Over Mesh" (`src/app/globals.css`)

Adopted repo-wide in commit `a2af3ef` (PR #1). The stylesheet's header states dark mode is **byte-exact PLPD**, with tokens *"copied verbatim from `PLPD_Style_Guide_6-21-26.html` — invent nothing, round nothing."* (That style-guide file is not in this repository.) Dark is the default (`class="dark"`, next-themes class strategy, system detection off); light mode is an explicitly-labeled derived extension, not canonical.

### 19.1 Tokens (dark canonical values)

- **Surfaces** (5-step navy): `#13152A → #181A2C → #21243A → #262940 → #2E3150`.
- **Brand:** cyan `#55e8ff` (+header `#73efff`), amber `#ffc277` (+muted 82%). Derived tints `--cyan-dim #55e8ff18`, `--amber-dim #ffc27718` (marked non-canonical).
- **Text ramp:** nav `#cbd7fd`, cell `#f0f1f5`, player `rgba(246,248,255,.96)`, team `rgba(180,187,215,.82)`, zero `rgba(164,170,202,.7)`, plus bench-note variants.
- **Borders:** sidebar `rgba(85,232,255,.12)`, tab `rgba(255,255,255,.13)`, table `rgba(118,138,190,.22)`, row `rgba(140,165,210,.11)`, thead `rgba(157,244,255,.22)`.
- **Row fills** (translucent so "the mesh breathes through"): `rgba(48,58,97,.46)` / `rgba(42,51,85,.38)` / `rgba(34,40,63,.3)`.
- **Semantic:** green `#34d399`, red `#f4707c`, blue `#3da9f5`, violet `#a78bfa`, gold `#f5b950`; value deltas `#7fc8a9`/`#d98f97`.
- **shadcn remap:** background=surface-1, card=surface-2, popover=surface-3, primary=cyan, accent=amber, destructive=red, ring=cyan; radius 10px panels / 8px controls / 12px cards, chips 6px.
- All tokens are exposed as Tailwind utilities via `@theme inline` (`bg-surface-2`, `text-text-cell`, `border-border-tab`, …).

### 19.2 The mesh

`body` carries a **verbatim inline SVG data-URI** background (comment: "Do not regenerate or approximate"): a base navy linear gradient plus four faint radial blooms and two rotated diagonal sheens, `cover`/`fixed`. Light mode drops the mesh for a flat `#f6f7fb → #eef0f7` gradient. Cards sit on top as translucent glass with `ring-1 ring-white/[0.03]`.

### 19.3 Signature chrome

- `.plpd-nav-active` — amber gradient pill (`#975100 → #cd8532`) with outer glow, used for the active nav item.
- `.plpd-tab-active` — amber bold text with an overhanging 6px rounded underline and glow; comments insist tabs are **"never cyan."**
- `.plpd-btn-import` (blue `#245297 → #0a2e63`) and `.plpd-btn-cta` (amber) — 4-layer buttons: gradient, shadow-ring (never a border), white-fade overlay, inset top highlight; hover brightens, active scales 0.98. `Button` `default` variant = import style; `amber` variant = CTA.
- Select triggers/menus reuse the blue gradient family; dropdown item focus uses a lighter blue gradient with white text.
- Typography: DM Sans for chrome (≤700 except 900 section titles), Work Sans for data (hero numerals 800); headings tracked -0.01em; base 15px/1.55.
- Focus = 2px cyan outline; scrollbars are 10px translucent-cyan; theme transitions 180 ms.
- **Print** styles force light values, hide nav/header/bell/`.no-print`, expand scroll containers, and avoid page breaks inside cards/rows.
- **Joyride** portal colors are hardcoded per theme (the portal renders outside the `.dark` scope).

### 19.4 Component primitives (`src/components/ui/`)

16 files: avatar, badge (CVA; 10px uppercase 6px-radius chips in 15 variants incl. cyan/amber/violet/green/gold/blue/red/zero), button (7 variants × 4 sizes), card, checkbox, dialog, dropdown-menu, empty-state, input (inset-highlight PLPD field), label, popover, select (PLPD blue), separator, skeleton, switch (cyan when on), tabs (amber active), textarea. Status → badge mapping (`status-badges.tsx`): content writer_needed=zero, claim_requested=gold, claimed=blue, submitted=green, polishing=violet; editor none="—", ready_for_edit=gold, edited=blue, scheduled=valpos, published=green; graphics needed=zero, claimed=blue, submitted=green "Done", flagged=red; role badges are decorative identity colors (writer=zero, editor=cyan, graphics=violet, manager=amber-filled, admin=cyan-header, eic=amber-outline, operations=blue).

### 19.5 Responsive & a11y state

Sidebar hidden below `md` with a hamburger slide-over drawer (closes on route change); collapse state persists in `localStorage`. Tables (content, analytics) collapse to card lists via `useIsMobile` (768px matchMedia). Accessibility items in POLISH.md (contrast audit, focus visibility sweep, keyboard-nav order, icon-button label spot-check) remain open review items.

---

## 20. Onboarding

First login (`users.onboarding_completed=false`) triggers a 6-step react-joyride tour after a 600 ms mount delay: Welcome → sidebar → Content Table → My Tasks → notification bell → Settings (mentions linking Discord). Targets use `data-tour` attributes. Finishing or skipping POSTs `/api/users/me/onboarding` which sets the flag.

---

## 21. Build history & current status

Built in 14 explicitly-labeled steps (commit messages, 2026-04-15 → 04-16), then hardening waves:

1. Scaffold, auth, shell → 2. Users/teams/staff/settings → 3. Content table CRUD + saved views → 4. Status tracks, claims, WP-driven scheduling → 5. Graphic requests + Storage + WP media → 6. Comments/@mentions/activity cache → 7. Notifications → 8. Calendar, Editing Queue, My Tasks → 9. Recurring templates, season mode, unclaimed alerts → 10. WP bi-directional sync + draft pickup → 11. Per-tier checklists + submit gate → 12. Analytics (GA4 OAuth, Raptive, 4 tabs) → 13. Role-tailored home → 14. Onboarding tour, bulk ops, polish backlog.

Then: mobile/polish passes (04-16); **RLS on all 29 tables** (04-22); storage privacy + analytics depth + bulk create + skeletons (05-15); user-management overrides + the historical-import/backfill/URL-normalization campaign (05-16→17, nine fix commits); deadline-reminders + season-switch crons, archive page, tier CRUD (05-17); **PLPD design-system restyle** (06-21, PR #1, latest commit).

**Working today** (implemented and wired end-to-end): everything described in §§7–20 except the items below.

### 21.1 Explicitly incomplete / open items

**From POLISH.md (the project's own backlog):**
- Brand assets: real Pitcher List logo for login + sidebar, QB List logo for conditional swap (asset-dependent, "not code-fixable").
- Typography review pass; avatar-dropdown animation review (subjective, deferred).
- Accessibility audit items (contrast, focus, keyboard order, icon labels).
- Security follow-ups: live curl test of the anon key against PostgREST after deploy; drop unused `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

**Stubbed features (code present, delivery not implemented):**
- **Discord DM delivery** and **email delivery** for notifications — preference matrix, flags, and dispatch flow all exist; the actual sends are logging stubs (§14.2).

**Schema/features with no consuming code:**
- `file_attachments` table (no reads or writes anywhere).
- Notification types `new_claimable` and `priority_flagged` (never emitted).
- `recurring_template_roles` and `recurring_template_checklist` tables (schema exists; templates seed checklists from tier defaults instead, and no code reads either table).
- `saved_table_views.columns/grouping` are stored but the table applies only filters/sort from a view.
- `users.can_publish` / `canPublish()` (flag + helper + admin toggle exist; no workflow route consumes them).
- `global_settings.wp_poll_frequency_minutes` and `default_theme` (seeded, never read); `unclaimed_alert_hours` seeded but the cron hardcodes 72 h.

---

## 22. Known discrepancies, quirks, and risks (verified in code — vetting checklist)

1. **Cron method mismatch:** all 8 cron routes export **POST only**, but Vercel Cron calls scheduled paths with **GET**. Unless a platform-level rewrite exists outside this repo, scheduled invocations would 405. Needs verification against production logs.
2. **Per-entry analytics leak vs. policy:** `canViewAnalytics` deliberately excludes `admin`, but the entry-detail Analytics tab gates on admin|eic|operations — so plain admins can see per-entry revenue there (the API it calls, however, would 403 them; the tab renders for admins but its data fetch fails for a pure admin — behavior worth reconciling).
3. **`resyncUserFromWp` ignores `display_name_override`** — the manual per-user resync overwrites admin-edited names; the cron respects the flag.
4. **`getUserById` shortcut quirk:** first calls `listUsers({limit:1})` and matches only when the target happens to be the alphabetically first user; otherwise falls through to the direct query. Harmless but pointless first query.
5. **Access-token revocation window:** `getCurrentUser` never checks the `sessions` table, so a deleted session stays valid until the ≤15-minute access token expires.
6. **`setUserRoles` / `PATCH users/[id]` are non-atomic** (documented in code): a failure mid-sequence can strip roles without reinserting.
7. **No unique constraint on `users.email`** even though login matches users by email; duplicate emails would break identity assumptions. Likewise `categories` (site, wp_category_id) uniqueness is app-enforced only.
8. **`{week}` token renders literally** when no active season has `auto_switch_start` set (code comment calls it a visible bug).
9. **Unclaimed-alerts window hardcoded** at 72 h; the seeded `unclaimed_alert_hours=12` setting is dead.
10. **Two different URL normalizers** (app `normaliseUrl` vs. backfill script `normalisePath`) — currently agree on typical permalinks but are separate implementations.
11. **`src/types/database.ts` is a placeholder** — every table types to `any`; the real types were never generated (`npx supabase gen types`). Type safety against the DB is nominal.
12. **12 unused dependencies** in package.json (§2.2) — including the entire planned Discord/email/toast surface.
13. **No tests, no CI** anywhere in the repo.
14. **README.md is untouched boilerplate** — this spec and POLISH.md are the only real documentation.
15. **Bulk create is N parallel POSTs** from the client (≤25) — no server-side batching or partial-failure rollback (per-row error reporting only).
16. **`login/performLogin` placeholder-sid dance:** the first token pair is created with a zero-UUID sid before the session row exists, then replaced — correct but subtle; worth knowing before touching login.
17. **"Vault":** no vault-named system exists in the repo (§13.1). The private `graphics` bucket + signed-URL layer is the closest real system.

---

## 23. API route index (method — guard — purpose)

**Auth:** `POST /api/auth/login` (public) · `POST /api/auth/logout` (any) · `GET /api/auth/me` (any) · `POST /api/auth/refresh` (refresh cookie).
**Entries:** `GET|POST /api/entries` (any authed) · `GET|PATCH /api/entries/[id]` (any authed; no DELETE) · `POST …/claim` (any) · `PATCH …/content-status` (submit=primary author; polishing=editor+) · `PATCH …/editor-status` (editor+) · `PATCH …/checklist/[itemId]` (author/editor/admin+) · `GET|POST …/comments` (any) · `GET …/audit` (any) · `POST …/archive` (any; direct for admin+) · `POST …/approve-draft` (creator/author/admin+) · `POST …/wp-refresh` (any) · `POST /api/entries/bulk` (manager+).
**Claims:** `GET /api/claims` (any; non-managers get `[]`) · `PATCH /api/claims/[id]` (manager+).
**Archive requests:** `GET /api/archive-requests` (any; managers see pending) · `PATCH /api/archive-requests/[id]` (manager+).
**Comments:** `PATCH /api/comments/[id]` (author) · `DELETE` (admin/eic/ops).
**Graphics:** `GET|POST /api/graphic-requests` (any authed) · `GET|PATCH|DELETE /api/graphic-requests/[id]` (per-action rules §13) · `POST …/upload` (any; blocked when submitted) · `POST …/submit` (any authed; 502 on WP failure).
**Users:** `GET /api/users` (any) · `GET|PATCH /api/users/[id]` (self/admin+ for private fields & edits) · `PATCH …/roles`, `PATCH …/publish`, `POST /api/users/import` (admin+) · `POST …/resync-wp` (self/admin+) · `GET|PATCH …/notification-prefs`, `GET|PATCH …/notifications` (self/admin+) · `POST /api/users/me/onboarding` (self).
**Teams:** `GET /api/teams` (any) · `POST` (admin+) · `GET /api/teams/[id]` (any) · `PATCH` (admin+ or own manager) · `DELETE` (admin+) · `POST …/members`, `PATCH|DELETE …/members/[userId]` (admin+ or own manager).
**Templates:** `GET /api/templates`, `GET /api/templates/[id]` (any) · `POST|PATCH|DELETE` (admin+).
**Season modes:** `GET /api/season-modes` (any) · `PATCH /api/season-modes/[id]`, `PATCH …/activate` (admin+).
**Tiers:** `GET /api/tiers` (any) · `POST|PATCH|DELETE` (admin+; DELETE 409s when referenced).
**Checklist items:** `GET|POST /api/settings/checklist-items`, `PATCH|DELETE …/[id]` (all admin+).
**Views:** `GET|POST /api/views` (any, own) · `PATCH|DELETE /api/views/[id]` (owner).
**Categories:** `GET /api/categories` (any).
**Settings:** `GET /api/settings/wp-sync-status` (admin+).
**Analytics:** `GET /api/analytics/{overview,articles,writers,publish-to-peak}` + `…/export` (eic/ops) · `POST /api/ga4/{connect,disconnect,sync}` (operations) · `GET /api/ga4/callback` (operations, OAuth redirect) · `GET /api/ga4/status` (eic/ops) · `POST /api/raptive/upload` (operations) · `GET /api/raptive/uploads` (eic/ops).
**Admin:** `POST /api/admin/ga4-backfill`, `POST /api/admin/historical-import` (operations).
**Cron:** 8 routes (§18), POST, `Bearer CRON_SECRET` (most also accept Admin+ session).

---

*End of specification. Companion human-readable version: `docs/DESIGN_SPEC.html`.*
