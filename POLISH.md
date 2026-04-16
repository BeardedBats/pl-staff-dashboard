# Polish Backlog

Running list of UI/UX items to revisit in one focused pass **after Step 14**.
Don't fix these mid-build — they'll compound with later work or get redone
during the PL Pro Design Unification effort.

Format: `- [ ] <where> — <what> — <why it matters, if non-obvious>`

Flag anything *architectural* (layout grid, breakpoints, a11y) separately —
those get fixed immediately when spotted, not deferred here.

---

## Brand identity

- [ ] Login page — replace the text-mark "Pitcher List" brand tile with the actual PL logo (wordmark + glyph). Currently a placeholder cyan `font-mono` block.
- [ ] Sidebar brand — same as above, the top-left "Pitcher List · Staff" stack needs the real mark.
- [ ] QB List views — need QB List logo asset to swap in when viewing QB content (per spec: "QB List logo displayed when viewing QB List content").

## Tone / feel (from CLAUDE.md: "Savant base + neon/glass/mesh accents")

- [ ] Cards feel flat — the `shadow-sm` on cards is barely visible in dark mode. Consider subtle inner glow or a more premium surface treatment.
- [ ] Active nav item — the cyan-tinted bg is functional but not "neon." Could use a soft cyan glow/halo once the rest of the design system lands.
- [ ] Login background — currently solid navy. Could use a subtle mesh gradient or low-opacity radial to feel more premium.
- [ ] Header — pretty sparse. Might benefit from a brand/pagetitle slot on the left.

## Typography

- [ ] Review heading scale across pages once we have more content to judge against.
- [ ] Check letter-spacing on the `font-mono` brand mark vs. Savant Dashboard reference.

## Micro-interactions

- [ ] Theme toggle transition — currently instant. Consider a short cross-fade on theme change.
- [ ] Sidebar collapse animation — functional but snappy. Could feel smoother.
- [ ] Avatar dropdown entry/exit — uses Radix defaults; verify it feels right.

## Components

- [ ] `Button` — hover state is a simple opacity tweak. Primary button could feel punchier (slight scale? subtle shadow?).
- [ ] `Input` — focus ring is the cyan brand color. Works, but worth verifying it doesn't look harsh in light mode.
- [ ] `Avatar` — fallback initials look fine but could use a subtle gradient background per-user.

## Accessibility

- [ ] Audit all color contrasts once design is final.
- [ ] Verify focus visibility on every interactive element.
- [ ] Ensure keyboard nav flows logically through the sidebar → header → main content.
- [ ] Screen-reader labels on icon-only buttons (already present via `aria-label`, but verify).

## Mobile

- [ ] MVP spec says "mobile-friendly but not over-invested." Pass it once the full desktop UX is locked.

## Step 12 — Analytics

- [ ] Analytics Trends tab — add day-of-week + time-of-day heatmap (spec §"Analytics Page"). Deferred: Recharts has no first-class heatmap, would need a custom grid.
- [ ] PDF export on Articles/Writers tabs — CSV ships, PDF deferred. Likely `@react-pdf/renderer` or a print stylesheet + browser print.
- [ ] Author filter — the filters bar has no author picker yet. Needs a debounced user search combobox (same pattern as graphics assignees).
- [ ] Category filter — same deal; tier filter only for now.
- [ ] Raptive upload dialog — no drag-drop zone, just a click-to-pick label. Works fine; nicer DnD later.
- [ ] Publish-to-peak analysis chart — spec calls this out, needs cumulative pageviews curve per article since publish. Can re-use article_analytics + entries.publish_date.
- [ ] Per-entry analytics in the entry detail panel — spec says EIC/Ops see a mini analytics block in the inline detail panel. Not wired yet.

## Step 14 — Onboarding & Polish

- [ ] Joyride tour styling — colours use CSS vars that may not resolve in the Joyride portal. Verify at first login that the cards look right in both dark and light modes.
- [ ] Bulk operations — "change tier" and "unarchive" actions exist in the API but aren't in the UI toolbar yet. Easy add.
- [ ] Bulk create modal — spec calls for creating multiple entries at once. Low priority; single-create dialog is fast enough.
- [ ] Mobile sidebar — collapses to collapsed mode on `md:` breakpoint. Needs a hamburger toggle on mobile to open/close as a drawer. Currently it's just always narrow.
- [ ] Mobile tables — content table, analytics tables, and staff directory all need a card/list fallback on < 768px.
- [ ] Virtual scrolling — TanStack Virtualizer for the content table when row counts exceed ~200. Not needed yet.
- [ ] Loading skeletons — most pages have loading spinners, a few could use proper Skeleton placeholder components (staff directory, calendar).

---

## How to add items

- Spot something during a step handoff? Jot a line here with the step context (e.g., "Step 5 — graphic requests kanban column widths feel cramped on 1440px").
- Architectural issues → fix immediately, not logged here.
- Items with `[WONTFIX]` prefix stay listed for posterity but won't be addressed.
