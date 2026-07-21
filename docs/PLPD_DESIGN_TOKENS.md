# PLPD design-token authority

The visual authority for this application is Nick's local
`C:\Users\Nick\Downloads\PLPD Style Guide 6-21-26.html`.

- Guide metadata: PLPD Style Guide version 1.2, June 19, 2026
- Verified source SHA-256 on 2026-07-21:
  `DB7CDC395BD380FECA6DBFA0D687D7AB577BF9B9D80D79CF96388A64E804C98B`
- Source precedence: Figma extraction, then `Final_Dash_9.html`, then sections
  that the guide labels derived

The committed application does not copy the guide document. Its centralized
runtime registry is the leading `:root`, `.light`, and `@theme inline` sections
of `src/app/globals.css`. UI code consumes those variables or the token-backed
`plpd-*` helpers; it must not restate hex, RGB, gradient, or shadow literals.

## Canonical source tokens

The registry preserves the guide's exact dark-mode values for:

- the five navy surfaces, cyan/amber brand accents, text ramp, borders, zebra
  rows, semantic colors, and desaturated value-delta colors;
- the complete mesh data URI;
- primary, CTA, active-navigation, dropdown, dropdown-menu, highlighted-row,
  sidebar-wash, and white-fade gradients, including their exact angles;
- sidebar, action, dropdown, active, panel, card, and inset shadow stacks;
- 320 px shell width; header/content spacing; 44 px navigation, 36 px control,
  34.5 px table-header, and 62 px table-row heights; and the 3–12 px radius
  scale;
- DM Sans chrome and Work Sans data roles, their sizes, weights, tracking, and
  the two allowed weight-cap exceptions: 900 section titles and 800 hero
  numerals.

The guide explicitly marks its pitch palette and loading-bars example as
stand-ins. They are not promoted into the canonical token registry.

## Derived application tokens

PLPD defines a dark, mesh-bearing product. This dashboard also needs readable
light mode, print output, and automated-tour overlays. Those values are kept in
the same registry under clearly labeled derived sections. A derived value may
map a canonical role to a contrast-safe presentation, but it must not overwrite
or be documented as the source value.

The `--text-zero` source value therefore remains exact while
`--text-zero-accessible` is the small/body-text presentation token. Light-mode
semantic foregrounds, print colors, and the flat light canvas follow the same
rule.

## Change rules

1. Re-read the complete authority file, including its Never List and validation
   checklist.
2. Verify the source hash. If it changed, review the new file instead of
   assuming that prior values remain valid.
3. Change source-canonical values only from the authority and preserve exact
   hex, RGBA, pixel, degree, and shadow-stack values.
4. Label every application-only extension as derived and reuse existing source
   roles wherever possible.
5. Run `npm run test:quality`; a token change must keep dark/light axe scans,
   keyboard focus, and production performance budgets green.

P3.1 establishes the vocabulary. P3.2 composes reusable primitives from it,
P3.3 applies the typography roles across the application, and P3.8 removes
remaining Never List violations. Those later steps must consume this registry
instead of creating a parallel system.
