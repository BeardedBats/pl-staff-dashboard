# PLPD table and data-value contract

Authority: `PLPD Style Guide 6-21-26.html`, version 1.2, SHA-256
`DB7CDC395BD380FECA6DBFA0D687D7AB577BF9B9D80D79CF96388A64E804C98B`.

Every application data table uses the shared `plpd-table-shell` and
`plpd-table` construction. The shell supplies the one-pixel table border,
10px radius, pointed panel depth, and inset edge. The table supplies:

- a 34.5px `#2E3658` header band with 16px/600 Work Sans cyan labels;
- 62px rows with 14px Work Sans data and tabular numerals;
- light-first translucent `row-a` / `row-b` zebra fills;
- a 120ms cyan row-hover wash;
- right-aligned numeric columns and an explicit muted-zero presentation;
- fill-and-text-based bench, injured, best-available, selected, and dashboard
  priority states. Row state never relies on opacity.

The source zero token is retained in the token registry. Readable application
zeros use `--text-zero-accessible`, the established WCAG presentation override,
so they remain visibly subordinate without failing the product's AA gate.

`TableValue` owns numeric value tone. A literal zero always resolves to the
zero tone. Signed deltas may opt into the guide's softer `--val-pos` and
`--val-neg` colors; saturated chip green/red are not used for table deltas.
Current financial totals are neutral values, not signed deltas, and therefore
do not borrow the amber active-state accent.

Pagination uses the shared 32px chevron controls around the current page:
`< current >`. Controls brighten on hover, a disabled endpoint remains at 40%
opacity, and archive pages use the guide's 25-row page size.

## Verification boundary

The source contract inventories every literal application table, rejects a
table without the shared construction, pins the canonical measurements,
tokens, alignments, states, value colors, and pagination behavior, and verifies
the source hash above. Component tests exercise zero/positive/negative value
tone and disabled-aware pagination. Production Chromium checks computed table
geometry, row fills, numeric alignment, zero color, hover, and both pagination
endpoints against a database-backed archive page.
