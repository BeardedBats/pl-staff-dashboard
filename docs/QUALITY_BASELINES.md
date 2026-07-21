# Performance and accessibility baselines

`npm run test:quality` builds the application, starts a production-mode Next.js
server against isolated local Supabase fixtures, and runs the versioned quality
gate in `quality-budgets.json`. It never targets production or external services.

## What is enforced

- Zero automatically detectable WCAG 2.0, 2.1, and 2.2 Level A/AA violations
  from axe-core on mobile login plus representative writer, manager, editor,
  graphics, and administrator surfaces.
- First Contentful Paint, Largest Contentful Paint, Cumulative Layout Shift,
  total blocking time, encoded response bytes, encoded script bytes, request
  count, and DOM-node count on three representative loading profiles.
- A positive FCP and LCP observation, so a missing browser measurement cannot
  silently pass as zero.
- JSON evidence attached to every Playwright test and retained by CI for 14 days.

## Interpretation boundary

These are controlled Chromium lab regression budgets. They are not production
Core Web Vitals and do not claim the required 75th-percentile field sample.
Real-user LCP, INP, and CLS must be monitored separately after launch. The lab
LCP/CLS ceilings use the current good-experience thresholds (2.5 seconds and
0.1); the remaining ceilings are repository-specific regression guardrails.

Automated axe checks catch common machine-detectable defects, not every WCAG
failure. Keyboard order, screen-reader comprehension, zoom/reflow, motion, and
task completion still require manual assessment before the final production
gate.

## Changing a budget

1. Run `npm run test:quality` on the unchanged baseline and retain its JSON.
2. Run it on the proposed change under the same OS/browser/tool versions.
3. Fix a regression before considering a larger ceiling.
4. If growth is intentional, update `quality-budgets.json`, explain why in the
   PR, and retain before/after evidence. Never update a ceiling only to turn CI
   green.
5. Increment `version` whenever measurement semantics or profiles change.

References: [Playwright accessibility testing](https://playwright.dev/docs/accessibility-testing)
and [Web Vitals thresholds](https://web.dev/articles/vitals).
