# Polish Backlog

Running list of UI/UX items revisited after Step 14. Most items have been
closed; only asset-dependent and subjective-review items remain open.

Format: `- [x] <where> — <what>` for done, `- [ ]` for open.

---

## Brand identity (asset-dependent, not code-fixable)

- [ ] Login page logo — replace the text-mark "Pitcher List" brand tile with the real PL logo (wordmark + glyph). Need an SVG/PNG asset.
- [ ] Sidebar brand — same as above for the top-left "Pitcher List · Staff" stack.
- [ ] QB List logo — needed for the conditional swap when viewing QB content.

## Tone / feel

- [x] Cards — `ring-1 ring-white/[0.03]` subtle inner ring for premium depth.
- [x] Active nav item — inset cyan ring + soft outer glow.
- [x] Login background — mesh gradient (cyan / amber / purple radials).
- [x] Header — "Staff Dashboard" label + `backdrop-blur-sm` glass.

## Typography (subjective review — defer to design unification effort)

- [ ] Review heading scale across pages once we have more content.
- [ ] Letter-spacing on the `font-mono` brand mark vs. Savant Dashboard reference.

## Micro-interactions

- [x] Theme toggle — `transition: 180ms ease` on background/border/text across all token-driven elements.
- [x] Sidebar collapse — smoothed to 300ms ease-in-out.
- [ ] Avatar dropdown entry/exit — Radix defaults; subjective review.

## Components

- [x] `Button` — cyan glow on hover + 0.98 active scale + 150ms transitions.
- [x] `Input` focus ring — light-mode ring softened from `#0891b2` to `#0ea5b7`.
- [x] `Avatar` fallback — `bg-gradient-to-br from-navy-3 to-navy-4`.
- [x] `Skeleton` primitive — added at `components/ui/skeleton.tsx`.

## Accessibility (review-style, no code change needed yet)

- [ ] Audit all colour contrasts once final design lands.
- [ ] Verify focus visibility on every interactive element.
- [ ] Ensure keyboard nav flows logically (sidebar → header → main).
- [ ] Screen-reader labels on icon-only buttons — most have `aria-label`; spot-check the rest.

## Mobile

- [x] Sidebar — hidden on `md:` breakpoint; hamburger drawer in header.
- [x] Mobile tables — content table, analytics articles/writers stack into cards; staff directory was already a responsive grid.

## Step 12 — Analytics

- [x] Author filter — preloaded list of writer/editor/admin staff in a Select.
- [x] Category filter — auto-filtered by selected site.
- [x] Publish-to-peak curve chart — averages pageviews per day-since-publish across the filtered set.
- [x] Day-of-week heatmap — custom CSS grid (week × dow) with cyan intensity ramp.
- [x] PDF export — "Print / PDF" button uses browser print; `@media print` strips chrome, forces light colours, expands scroll containers.
- [x] Raptive dialog drag-drop zone — full drop target with hover state, validates extension on drop.
- [x] Per-entry analytics — EIC/Ops see an "Analytics" tab inside entry detail panels.

## Step 14 — Onboarding & Polish

- [x] Joyride portal styling — hardcoded dark + light overrides in globals.css.
- [x] Bulk operations — archive, unarchive, set/remove priority, change tier all in the bulk action bar.
- [x] Bulk create modal — multi-row form with shared site/tier/precision + per-row title/date.
- [x] Mobile sidebar — hamburger + slide-over drawer.
- [x] Mobile tables — done (see Mobile section).
- [x] Virtual scrolling — content table uses bounded `max-h-[70vh]` + sticky `<thead>`. Full TanStack Virtualizer skipped because expandable detail panels break the uniform-row-height assumption.
- [x] Loading skeletons — `loading.tsx` files for `/staff` and `/calendar` (Next.js streams them automatically).

## Security follow-ups

- [x] Storage bucket privacy — bucket flipped to private (migration 0008). Reads now generate signed URLs (1h TTL) via `getSignedGraphicUrl` / `getSignedGraphicUrls`. The data layer in `lib/graphics/data.ts` overwrites the stored `file_url` on every read.
- [ ] Live curl test against anon key — verify direct PostgREST hits return empty/403 after deploy.
- [ ] Drop unused `NEXT_PUBLIC_SUPABASE_ANON_KEY` from env if it remains unused.

---

## How to add items

- Spot something during ongoing work? Add a line here with context.
- Architectural issues → fix immediately, not logged here.
- `[WONTFIX]` prefix marks items deliberately out of scope.
