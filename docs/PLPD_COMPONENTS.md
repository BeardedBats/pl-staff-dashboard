# PLPD component primitives

This layer composes the verified tokens in `src/app/globals.css`. It does not
restate visual values in TSX. Canonical PLPD constructions stay distinct from
dashboard-only extensions so future changes cannot quietly become source
claims.

## Primitive map

| Role | Module | Boundary |
| --- | --- | --- |
| Navigation | `ui/navigation.tsx`, `layout/sidebar.tsx`, `layout/header.tsx` | Canonical active/hover treatment; responsive drawer is derived. |
| Page headers | `ui/page-header.tsx` | Canonical compact spacing and type hierarchy. |
| Tabs | `ui/tabs.tsx` | Canonical amber active state and overhanging underline. |
| Buttons | `ui/button.tsx` | Canonical four-layer primary/CTA and ghost treatments. |
| Fields | `ui/field.tsx`, `ui/input.tsx`, `ui/textarea.tsx`, `ui/label.tsx` | Canonical input surface, focus border, and data typography. |
| Dropdowns | `ui/select.tsx`, `ui/dropdown-menu.tsx`, `ui/popover.tsx` | Canonical primary gradient, highlighted row, and secondary flat variant. |
| Cards | `ui/card.tsx` | Canonical pointed-center shadow and inset highlight. |
| Chips | `ui/badge.tsx` | Canonical size, type, fill, border, and semantic palette. |
| Tables | `ui/table.tsx` | Canonical panel frame, header band, zebra rows, dimensions, and hover/selected states. |
| Pagination | `ui/pagination.tsx` | Canonical previous/current/next construction with accessible controls. |
| Alerts | `ui/alert.tsx` | Success/error use the guide's calibration callouts; info/warning are labeled derived extensions. |
| Dialogs | `ui/dialog.tsx` | Derived modal composition over the canonical panel treatment. |
| Drawers | `ui/sheet.tsx` | Derived responsive composition over the same panel treatment. |
| Loading | `ui/skeleton.tsx`, `ui/state.tsx` | Spinner is canonical; skeletons are a layout-preserving dashboard extension. The guide's stand-in loading bars are excluded. |
| Empty/error | `ui/empty-state.tsx`, `ui/state.tsx` | The frame remains in place; error copy is caller-authored rather than raw exception output. |
| Gated values | `ui/gated-value.tsx` | Accepts only a label, unit, and placeholder. It has no real-value prop; authorization must withhold data on the server. |

## Seven-state widget contract

`ui/component-state.ts` is the canonical typed vocabulary: `default`, `hover`,
`active`, `loading`, `error`, `empty`, and `gated`. The shared `Card` records the
current state in `data-plpd-state`; every home-page `WidgetShell` opts into the
stateful surface and can select any member of that vocabulary.

- Default keeps the translucent resting surface and pointed inset construction.
- Hover moves the surface up 1px over 150ms, layers the exact 4% guide wash,
  and reduces contained badge opacity to `.88`.
- Active applies the canonical warm-amber active shadow. No other state adds a
  glow.
- Loading uses the canonical spinner or the documented layout-preserving
  skeleton extension; the guide's stand-in bars remain excluded.
- Error accepts safe product copy, never an exception object or raw error text.
- Empty retains the state frame so the surrounding layout does not collapse.
- Gated renders a lock and placeholder only. The protected value is withheld
  before rendering and cannot be supplied to `GatedValue`.

Rendered state primitives expose the same `data-plpd-state` value so component
and production-browser tests can verify the state currently presented.

## Usage rules

1. Use these primitives before adding page-local visual construction.
2. Keep visual literals in the central token registry, never in TSX.
3. Use `SelectTrigger variant="secondary"` for subordinate filters.
4. Keep numeric table cells right-aligned through `className`; the base table
   defaults to left alignment so semantic row headers remain natural.
5. Pass user-safe copy to `ErrorState`. Do not render caught exception text.
6. Render `GatedValue` only when the server response omits the protected value.
   CSS hiding, masking, or blur is not authorization.
   See `PLPD_GATED_DATA.md` for the enforced financial-data boundary.
7. Use the shared table shell, table, value, and pagination contracts described
   in `PLPD_TABLES.md`; page-local table styling is not a second design system.
8. Treat every prohibition and its product-domain mapping in
   `PLPD_NEVER_LIST.md` as a release rule.

Responsive page-wide adoption remains P3.9 work. P3.2 establishes the reusable,
test-backed component vocabulary those page conversions consume.
