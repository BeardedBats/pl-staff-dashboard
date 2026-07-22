# PLPD gated-data boundary

Authority: `PLPD Style Guide 6-21-26.html`, SHA-256
`DB7CDC395BD380FECA6DBFA0D687D7AB577BF9B9D80D79CF96388A64E804C98B`.

The guide's gated state is an authorization rule, not a visual trick. A lock
and placeholder may explain that a value exists, but the protected value must
not be present in HTML, React payloads, API responses, client state, CSS, or a
direct database session available to the browser.

## Financial-data policy

Raptive earnings, RPM values, and joined revenue analytics are available only
to EIC and Operations roles for their authorized site scope. Admin is
deliberately excluded because an administrator may maintain staff and pipeline
settings without being entitled to financial data.

The boundary has four independent layers:

1. Server-rendered pages resolve the EIC/Operations site scope before loading
   analytics. The home page does not call its revenue loader without that
   scope.
2. Every financial read API authenticates the live session, checks the
   EIC/Operations role, and then narrows the requested site before querying.
3. Browser-facing Supabase roles have no privileges on public tables or
   functions. Only the server-only service client can cross that boundary.
4. `GatedValue` accepts no real-value prop and uses no blur, filter, mask, or
   hidden text. It can render only a lock, label, unit, and placeholder.

Operational health may report whether Raptive imports are fresh or failing to
administrators. That status contains no earnings, RPM, or row-level financial
values and is not a financial-data entitlement.

## Executed proof

The browser harness inserts a unique revenue sentinel and creates live EIC and
non-financial role sessions. It proves the EIC receives the sentinel through
the real analytics API and home page, while writer, manager, editor, graphics,
and admin requests receive 403. It separately confirms the admin home HTML,
content UI, analytics JSON/CSV routes, and Raptive history response never
contain the sentinel or financial fields. The database suite independently
proves `anon` and `authenticated` have no table or function privileges.
