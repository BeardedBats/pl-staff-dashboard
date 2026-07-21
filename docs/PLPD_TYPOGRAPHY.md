# PLPD typography boundary

The authority is Nick's local `PLPD Style Guide 6-21-26.html`, version 1.2,
whose SHA-256 remains
`DB7CDC395BD380FECA6DBFA0D687D7AB577BF9B9D80D79CF96388A64E804C98B`.

## Runtime rule

- `font-sans` is DM Sans and is the default for application chrome: page and
  section headings, navigation, tabs, buttons, field labels, instructions,
  alerts, dialogs, drawers, state copy, and badges.
- `font-data` is Work Sans and is applied to data: table headers and cells,
  names and teams, stat values and counts, dates and identifiers, wordmarks,
  league or tier pills, dropdown values, form-entered values, and pagination
  numerals. Card titles are also Work Sans because the guide specifies that
  construction directly.
- `font-mono` is reserved for literal code rendered with a `code` element. It
  is not a metadata or small-label style.

The root layout loads DM Sans weights 400–700 and 900 and Work Sans weights
400–800, then applies DM Sans to the body. `plpd-section-title` (DM Sans 900)
and `plpd-hero-numeral` (Work Sans 800) are the only named roles above the
normal 700 weight cap.

## Enforcement

`plpd-typography-contract.integration.test.ts` recursively checks TSX sources
so that literal tables carry `font-data`, monospace classes occur only on
`code` elements, the two font variables stay wired to the root layout, and
the reusable chrome/data primitives keep their assigned families.

P3.3 establishes and applies the font-family and weight boundary. The guide's
minimum readable size, exact table sizing, and remaining page-level visual
adoption are separately closed by P3.7 and P3.8; they must consume this same
boundary rather than define another one.
