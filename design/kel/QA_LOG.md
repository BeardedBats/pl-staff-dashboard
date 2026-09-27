# Kel visual migration QA

Build: kel-visual-2. Date: 2026-09-25. Builder: /root.

## Verified locally

- `npm ci` completed before framework edits.
- Next.js 16 local font and CSS documentation inspected before implementation.
- `npm run build`: passed, Next.js 16.2.11, Turbopack production build.
- `npm run lint`: passed without warnings.
- `npm run typecheck`: passed.
- `npm test`: 433 tests passed. Includes four new portable-package tests.
- `npm pack --dry-run --json` in the package: six publishable files, no dependencies.
- Original mesh declaration SHA-256 remains `df8cc25ef7855db32224faaf3bf1fd8d7b4475239a80719c49134e1cf8f8109d`.

## Rendered evidence

`evidence/before/`: Content, My Work, article detail. Existing pre-Kel hotfix checkout served on local port 3216.
`evidence/after/`: same views from this checkout, local port 3215.
`evidence/figma-*.png`: original MCP screenshot bytes from Content 2051:2, My Work 2073:2, Article Writing 2093:2.

Chromium desktop automation, device scale 1, zoom 100%. Main captures 1440x900.
Additional widths: 768, 390, 320. This is not physical-device verification.
Capture timestamps and Chromium version: `evidence/after/interactions.json` and `coverage.json`.
Real authenticated data was read. No articles, integrations, roles, or notifications were modified.
Login/logout and local theme/menu state were exercised. Write workflows were not submitted.

Six route/detail axe scans reported zero violations. Dialog, light mode, and standalone package scans also reported zero.
This does not establish complete WCAG compliance.
Menu Escape returns focus. Dialog traps focus and closes with Escape. Mobile navigation opens.
Reduced motion produces zero-duration button transitions.
Content has no page overflow at 320/390/768. Tablet table scroll reaches its last column.
Mobile article tabs remain keyboard reachable. Lower-page screenshots cover long content and empty task sections.
No browser page errors occurred in these runs.

## Reference precedence

The user's explicit glass recipe uses navy .30 plus blue .12 and contrast(1.54) saturate(1.35).
The finished Figma Content export uses .28 and .09 fills.
This implementation follows the explicit requested recipe. It renders stronger blue surfaces than that mockup.
The original mesh remains unchanged. Existing controls and data remain, even where mockups omit them.
These captures prove the Kel visual language, not pixel-identical mockup parity.

## Repairs during QA

- Fixed CSS layer order so input utility padding remains effective.
- Linked four New entry field labels and named the Priority switch.
- Corrected light active-navigation text to use the theme foreground.
- Allowed table-shell scrolling so tablet users can reach all columns.

## Remaining verification limits

Docker was unavailable locally. Database-backed role journeys and the complete quality suite await CI.
Historical visual snapshots target PLPD and require review against intentional Kel changes.
Five existing dependency advisories were reported by npm ci; dependencies were not changed in this visual-only task.
No production deployment or production migration was performed.

## Motion

No ornamental motion added. Removed card lift. Kept existing feedback and reduced-motion support.
