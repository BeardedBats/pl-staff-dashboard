# Polish Backlog

Running list of UI/UX items to revisit in one focused pass **after Step 14**.
Don't fix these mid-build — they'll compound with later work or get redone
during the PL Pro Design Unification effort.

Format: `- [ ] <where> — <what> — <why it matters, if non-obvious>`

Flag anything *architectural* (layout grid, breakpoints, a11y) separately —
those get fixed immediately when spotted, not deferred here.

---

## Brand identity

- [ ] Login page — replace the text-mark "Pitcher List" brand tile with the actual PL logo (wordmark + glyph). Need the SVG/PNG asset.
- [ ] Sidebar brand — same as above, the top-left "Pitcher List · Staff" stack needs the real mark.
- [ ] QB List views — need QB List logo asset to swap in when viewing QB content (per spec: "QB List logo displayed when viewing QB List content").

## Tone / feel (from CLAUDE.md: "Savant base + neon/glass/mesh accents")

- [x] Cards feel flat — added `ring-1 ring-white/[0.03]` subtle inner ring for premium surface depth.
- [x] Active nav item — added inset cyan border ring + soft outer glow shadow.
- [x] Login background — added mesh gradient (cyan, amber, purple radial blurs).
- [x] Header — added "Staff Dashboard" label on left; header now has `backdrop-blur-sm` glass effect.

## Typography

- [ ] Review heading scale across pages once we have more content to judge against.
- [ ] Check letter-spacing on the `font-mono` brand mark vs. Savant Dashboard reference.

## Micro-interactions

- [ ] Theme toggle transition — currently instant. Consider a short cross-fade on theme change.
- [x] Sidebar collapse animation — smoothed to 300ms ease-in-out (was 200ms linear).
- [ ] Avatar dropdown entry/exit — uses Radix defaults; verify it feels right.

## Components

- [x] `Button` — primary variant now has cyan glow shadow on hover + 0.98 active scale. `transition-all duration-150` for smoothness.
- [ ] `Input` — focus ring is the cyan brand color. Works, but worth verifying it doesn't look harsh in light mode.
- [x] `Avatar` — fallback now uses `bg-gradient-to-br from-navy-3 to-navy-4` for subtle depth.

## Accessibility

- [ ] Audit all color contrasts once design is final.
- [ ] Verify focus visibility on every interactive element.
- [ ] Ensure keyboard nav flows logically through the sidebar → header → main content.
- [ ] Screen-reader labels on icon-only buttons (already present via `aria-label`, but verify).

## Mobile

- [x] Sidebar hidden on `md:` breakpoint — hamburger toggle in header opens a slide-over nav drawer with backdrop blur.
- [ ] Mobile tables — content table, analytics tables, and staff directory could use a card/list fallback on < 768px.

## Step 12 — Analytics

- [ ] Analytics Trends tab — add day-of-week + time-of-day heatmap (spec §"Analytics Page"). Deferred: Recharts has no first-class heatmap, would need a custom grid.
- [ ] PDF export on Articles/Writers tabs — CSV ships, PDF deferred. Likely `@react-pdf/renderer` or a print stylesheet + browser print.
- [ ] Author filter — the filters bar has no author picker yet. Needs a debounced user search combobox (same pattern as graphics assignees).
- [ ] Category filter — same deal; tier filter only for now.
- [ ] Raptive upload dialog — no drag-drop zone, just a click-to-pick label. Works fine; nicer DnD later.
- [ ] Publish-to-peak analysis chart — spec calls this out, needs cumulative pageviews curve per article since publish. Can re-use article_analytics + entries.publish_date.
- [x] Per-entry analytics in the entry detail panel — EIC/Ops now see an "Analytics" tab with 30-day pageviews, sessions, revenue, and Page RPM.

## Step 14 — Onboarding & Polish

- [ ] Joyride tour styling — colours use CSS vars that may not resolve in the Joyride portal. Verify at first login that the cards look right in both dark and light modes.
- [x] Bulk operations — "change tier" and "unarchive" buttons added to the bulk action bar. Tier uses inline Select dropdown.
- [ ] Bulk create modal — spec calls for creating multiple entries at once. Low priority; single-create dialog is fast enough.
- [x] Mobile sidebar — hamburger + slide-over drawer, auto-closes on route change.
- [ ] Mobile tables — content table, analytics tables, and staff directory all need a card/list fallback on < 768px.
- [ ] Virtual scrolling — TanStack Virtualizer for the content table when row counts exceed ~200. Not needed yet.
- [ ] Loading skeletons — most pages have loading spinners, a few could use proper Skeleton placeholder components (staff directory, calendar).

---

## How to add items

- Spot something during a step handoff? Jot a line here with the step context (e.g., "Step 5 — graphic requests kanban column widths feel cramped on 1440px").
- Architectural issues → fix immediately, not logged here.
- Items with `[WONTFIX]` prefix stay listed for posterity but won't be addressed.
