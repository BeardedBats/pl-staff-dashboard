# Phase 1 regression matrix

Verified: 2026-07-21

This maps each Phase 1 security, correctness, or integrity repair to the durable check that fails if the boundary regresses. Live probes are supporting evidence, not substitutes for the automated checks.

| Scope | Repaired boundary | Durable regression |
|---|---|---|
| P1.1–P1.2 | Unique token issuance, current-session access validation, compare-and-swap refresh, replay-family revocation, expiry, and logout | `src/lib/auth/session.test.ts`; `src/lib/auth/session-lifecycle.test.ts` |
| P1.3 | Every exported API method is inventoried with an explicit authorization policy | `src/lib/auth/authorization-matrix.test.ts` requires exact method/path parity with `docs/AUTHORIZATION_MATRIX.md` |
| P1.4 | Site-scoped roles, resource participation, graphics actions, draft privacy, staff field projection, analytics scope, and cross-entry comment integrity | `src/lib/auth/authorization.test.ts`; `src/lib/graphics/create-authorization.test.ts`; `src/lib/users/visibility.test.ts`; `src/lib/analytics/authorization.test.ts`; cross-entry hostile insert in `supabase/tests/0013_verified_database_invariants.test.sql` |
| P1.5 | Interface capabilities derive from the same site/resource policy inputs as APIs | The P1.4 policy suite exercises the shared decision functions; production was additionally verified with a disposable 25-assertion UI/API probe |
| P1.6 | Shared JSON/query parsing, stable errors, bounded client messages, and no raw upstream/database leakage | `src/lib/api/http.test.ts`; `src/lib/api/client.test.ts`; `src/lib/api/route-contracts.test.ts` |
| P1.7 | Generated database types match the complete migration-built schema | `npm run db:types:check`; `.github/workflows/database-types.yml` |
| P1.8 | Identity, foreign-key, uniqueness, state, date, range, and metric invariants | `supabase/tests/0013_verified_database_invariants.test.sql` |
| P1.9 | Atomic bulk create/update, rollback, authorization, checklist preservation, and honest audit counts | `src/lib/entries/bulk-mutations.test.ts`; `supabase/tests/0014_transactional_bulk_entries.test.sql` |
| P1.10 | Canonical analytics URLs, collision refusal, WordPress configuration/auth, and email identity normalization | `src/lib/analytics/url-normalization.test.ts`; `src/lib/wordpress/config.test.ts`; `src/lib/identity/normalization.test.ts` |
| P1.11 | Local display-name overrides survive every WordPress synchronization path | `src/lib/users/wp-profile.test.ts` |
| P1.12 | Vercel methods, cron authorization, overlap, duplicate windows, leases, retry bounds, safe outcomes, and notification dedupe | `src/lib/cron/route-contracts.test.ts`; `src/lib/cron/execution.test.ts`; `src/lib/cron/recipients.test.ts`; `supabase/tests/0015_cron_execution_control.test.sql` |
| P1.13 | Forced RLS, server-only table/RPC privileges, private bucket contract, signing TTLs, and no browser/public object path | `src/lib/graphics/storage-contracts.test.ts`; `supabase/tests/0016_reassert_server_only_data_boundary.test.sql` |
| P1.14 | Patched dependency graph with no dormant runtime packages | Fresh `npm ci`, `npm audit`, and the recorded unused-dependency scan; CI hardening continues in P2.1 |
| P1.15 | In-app-only notification settings and schema cannot claim unsupported external delivery | `src/lib/notifications/in-app-only-contract.test.ts`; `supabase/tests/0017_remove_unsupported_notification_channels.test.sql` |

Phase 1 automated gate: `npm test`, cold migration reset, `supabase test db`, `npm run db:types:check`, `npm audit`, `npm run lint`, `npm run typecheck`, and `npm run build` must all pass.
