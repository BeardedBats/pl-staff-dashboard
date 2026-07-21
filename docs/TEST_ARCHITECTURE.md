# Test architecture

This project uses one tool per boundary and keeps test intent visible in file
names. A test belongs in the narrowest lane that can prove the behavior.

## Lanes

| Lane | File convention | Runtime | Purpose | Command |
| --- | --- | --- | --- | --- |
| Unit | `*.test.ts` / `*.test.tsx` | Vitest + Node | Pure business rules and isolated modules | `npm run test:unit` |
| Integration | `*.integration.test.ts(x)` | Vitest + Node | Multiple application modules or source-wide contracts | `npm run test:integration` |
| API | `*.api.test.ts(x)` | Vitest + Next request/response primitives | Route handlers, validation, authorization, and response envelopes | `npm run test:api` |
| Component | `*.component.test.tsx` | Vitest + jsdom + Testing Library | User-observable client-component behavior | `npm run test:component` |
| Database | `supabase/tests/*.test.sql` | Supabase CLI + pgTAP | Schema, RLS, RPC, constraint, and migration behavior | `npm run test:database` |
| Browser | `tests/browser/*.spec.ts` | Playwright + Chromium | Real navigation, rendering, and browser/API boundaries | `npm run test:browser` |

`npm test` runs every Vitest lane. `npm run test:coverage` runs those lanes with
V8 coverage and writes text, JSON, and HTML reports under `coverage/`.

## Boundary rules

- Unit tests do not start services or render DOM.
- Integration tests may combine real application modules, but replace network
  and managed-service boundaries with deterministic fakes.
- API tests call exported route methods and assert HTTP status plus the public
  response contract. They mock identity and infrastructure only at explicit
  boundaries; authorization and validation logic should remain real.
- Component tests use accessible queries and user events. Test rendered states
  and effects, not private hook state or CSS implementation details.
- Database tests are transactional pgTAP files. The database runner starts and
  stops the local Supabase stack only when it owns that stack, so an existing
  developer instance is preserved.
- Browser tests must not contact production services. The local server reuses an
  already-running Supabase stack or starts and later stops one it owns. Global
  setup creates short-lived signed sessions and isolated writer, manager,
  editor, graphics, and administrator records; teardown removes them. The role
  suite performs real application and database mutations while WordPress,
  storage, email, Discord, and analytics integrations remain synthetic or idle.

## Local workflow

1. Run `npm test` while developing application behavior.
2. Run the affected boundary command (`test:api`, `test:database`, or
   `test:browser`) before handoff.
3. Run `npm run test:coverage` to inspect missing behavioral paths. Coverage is
   diagnostic until the P2 suite establishes a defensible baseline; no arbitrary
   percentage gate is claimed in P2.1.
4. Install the local browser once with `npx playwright install chromium` before
   the first browser run.

Set `PLAYWRIGHT_BASE_URL` to test an explicitly selected deployed environment.
When it is unset, Playwright owns a local Next development server on port 3100.
Authenticated role journeys are skipped when an external base URL is selected;
do not point mutating browser tests at production.
