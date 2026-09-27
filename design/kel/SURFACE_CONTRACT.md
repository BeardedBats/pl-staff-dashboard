# Surface contract

Status: frozen, Kel v1, 2026-09-25.
Selected artifact: reference/ exports from Figma qCYof81yjdSZOKgbwYT54y.
Approval: APPROVAL.md, current user request. No concept exploration is required.

## Structure
Preserve existing sidebar, top bar, content controls, responsive layouts, table selection, inline article panel, and permissions.
Reference screens use 1440x900. Preserve actual data and controls, even when examples omit them.
Use a 256px expanded sidebar. Preserve collapse and mobile navigation.
Content keeps search/filter/table/pagination. My Work keeps all task sections and deadlines.
Article detail keeps pipeline, comments, SEO, audit, readiness, checklist, and WordPress controls.

## Visual rules
Page title: Instrument Sans 600 26/32. Card title: Instrument Sans 700 15, #FFC481.
UI row label: Instrument Sans 500 14. Body: Inter 400/500 14–16. Section label: 500 12.
Colors: canvas #0B1734; glass #0F2D64; primary #2F6BE0; text #EDF2FA/#C4D4E8/#8FA9D6; dim #6F86AD for nonessential decoration only.
Accent #9FC3FF; working #FCAC51; success #7EE0A8; periwinkle #7FA0FF; red #E8737B; violet #A99CFF.
Glass: rgba(15,45,100,.30) plus rgba(47,107,224,.12); 1px gradient ice outline; radius16; inset white 6%; 0 10px 30px -6px black 30%.
Primary buttons: blue #2F6BE0 to #1E4BB0, radius10, inner highlight, glow.
Secondary buttons: glass, radius8, minimum34px; retain larger touch targets where existing.
Danger buttons: #A6443F to #8B312D, #FFF1F0 text.
Inputs: glass with hairline, radius10–11. Menus and dialog surfaces must remain legible over content.
Statuses: muted needed/none; amber pending/ready; periwinkle claimed/edited; success submitted/done/published; violet polishing; accent scheduled; red flagged.
Never encode status with color alone; retain text. Remove avatar bubbles and duplicate identity labels.

## Constraints and exceptions
Visual edits only. No new routes or business logic. Keep role gates, events, links, data, dialogs, and destructive confirmations.
User explicitly approves glass, gradients, blue glow, and inner top highlight; these override generic craft restrictions.
Keep existing light-mode control and provide an accessible derived light palette; dark mode is the reference.
No added ornamental motion. Preserve feedback transitions, remove card lift if it adds no useful state, respect reduced motion.
Portable package has no React/Next dependency. Tailwind mapping is optional; plain CSS must work alone.

## Acceptance
Build, lint, typecheck; targeted component/theme tests; runtime screenshots before/after for Content, My Work, article detail.
Check narrow screens, keyboard focus, menus, status contrast, and unchanged mesh. Fresh independent review before completion.
Commit and push requested branch, open review PR. Do not merge or deploy production.

