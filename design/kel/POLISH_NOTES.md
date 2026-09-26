# Rendering repair — 2026-09-26

Baseline: fde16ba, user screenshot of scrolled Content with an expanded published article.
User asks to fix this rendering. No workflow or data changes are authorized.

## Preservation contract

- Structure: preserve sidebar, toolbar, table, inline detail, action bar, tabs, and all controls.
- Identity: preserve Kel fonts, navy/blue/amber roles, ice outlines, radii, and the original mesh.
- Content: preserve real titles, status, users, permissions, and integration state.
- Behavior: preserve routing, fetching, editing, sorting, selection, and keyboard navigation.
- Repair scope: opaque sticky table headers, compounded backdrop saturation, and tab overflow.

Correction thesis: restore readable scrolling and navy glass without changing the editorial workflow.

## Evidence and decisions

The 2464x1164 baseline reproduces the supplied screenshot.
Header cells and the sticky row group both used rgba(15,45,100,.4), exposing scrolling text.
Use an opaque navy header token. Light mode retains its existing opaque header token.
The tab list has clientHeight47/scrollHeight48 and overflow-y:auto, creating a useless scrollbar.
Retain horizontal scrolling, but clip the one-pixel vertical overflow.

Removing backdrop contrast/saturation in a diagnostic render restores the mesh's navy/slate appearance.
The current user correction supersedes the earlier acceptance of stronger blue compositing.
The app overrides --kel-backdrop:none; the portable package keeps its original configurable default.
Secondary buttons consume the same token so nested controls do not reintroduce the defect.

Baseline and diagnostic images: evidence/repair/before/.
Final evidence: evidence/repair/production/ from a local optimized Next build.
Build, lint, typecheck, and 52 design tests pass. Three regression tests cover these repairs.
The production render has no browser page errors and zero reported axe violations.
Inspected Content at 2464, 1440, 768, and 390 CSS-pixel widths, plus My Work at 1440.
The header remains opaque over scrolled rows. Tab overflow-y is hidden; horizontal access remains auto.
An initial hot-reload run reported an interrupted JSON response; the clean production run did not reproduce it.

## Scoped scorecard

Hierarchy/comprehension: 3 to 4 — column headings remain readable during scrolling.
Typography/readability: 2 to 4 — removed overlapping row text from the header.
Geometry/rhythm: 3 to 4 — removed the tab strip's vertical scrollbar.
Component/interaction craft: 3 to 4 — scrolling remains contained and controls retain their behavior.
Responsive/accessibility integrity: 3 to 4 — inspected the affected narrow/wide states and automated scan.
Fidelity: 3 to 4 — the unfiltered mesh restores navy/slate glass without replacing the palette or layout.

No independent review claimed for this bounded follow-up. No full accessibility-compliance claim.
Earlier REVIEW.md applies to kel-visual-2, not this repair.
