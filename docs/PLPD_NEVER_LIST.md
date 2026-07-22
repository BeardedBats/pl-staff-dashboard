# PLPD Never List contract

Authority: `PLPD Style Guide 6-21-26.html`, version 1.2, SHA-256
`DB7CDC395BD380FECA6DBFA0D687D7AB577BF9B9D80D79CF96388A64E804C98B`.

The guide names 16 prohibited constructions. The dashboard treats them as
release rules, not suggestions:

1. **Opaque flat panels:** dark semantic cards map to the exact translucent
   panel fill; the mesh/glass contract verifies representative computed alpha.
2. **Frosted-blur glassmorphism:** production TSX/CSS contains no backdrop
   blur or backdrop filter.
3. **Uniform heavy shadows:** generic `shadow-lg`, `shadow-xl`, and
   `shadow-2xl` utilities are prohibited. Deliberate elevation uses the exact
   named PLPD shadow stacks, including the transient graphics drag overlay.
4. **Invented hex values:** visual literals remain centralized in the reviewed
   token registry; TSX consumers cannot introduce hex, RGB, or gradients.
5. **DM Sans on table data / Work Sans on titles:** every literal table declares
   `font-data`, while headings remain on the DM Sans application default.
6. **Italic meta lines:** all application metadata, edited markers, null
   markers, empty copy, and helper copy remain upright. Production TSX cannot
   use the italic utility.
7. **`LEAGUE:` prefixes:** the product has no prefixed league/page label.
8. **Centered numeric columns:** numeric table headers/cells use the shared
   right-aligned data attribute and cannot add a centered utility.
9. **Full-brightness zeros:** literal zeros resolve through the shared muted
   zero token or `TableValue` zero tone.
10. **Opacity-dimmed bench rows:** bench/injured/best/priority states use fills
    and text ramps; row-state rules cannot declare opacity.
11. **Pre as a column label:** application table headers cannot use `Pre`.
12. **Opponent matchup on the player line:** this dashboard does not currently
    render fantasy player lines. Production presentation source rejects
    opponent/matchup copy so a later player surface must first establish the
    guide's team-and-position construction.
13. **Cyan active tabs:** shared active tabs are amber 700 with the exact warm
    underline/glow and cannot add a cyan active-state class.
14. **Borders instead of the Import shadow-ring:** primary and amber CTA buttons
    use the four-layer PLPD construction: gradient, shadow-ring/drop shadow,
    white-fade layer, and inset highlight, with no border.
15. **Weights above 700 outside two exceptions:** free-form 800/900 utilities
    are prohibited. Only the named 900 section-title and 800 hero-numeral roles
    may exceed 700.
16. **Hidden CONFLICT states:** the dashboard's conflict-equivalent editorial
    states are always rendered: `polishing` is violet and `flagged` is red.
    Aggregate graphics status prioritizes `flagged`, so conflict cannot be
    hidden behind a lower-priority state.

The source also says hover should brighten rather than fade. Production TSX
therefore cannot lower opacity on hover. The guide's exact `.88` contained-badge
hover behavior remains the explicit canonical component-state exception;
controls that move from hidden to `opacity-100` are reveals, not fades.

Responsive wrapping, readable minimum sizes, and ellipsis removal are validated
separately by P3.9 because those changes require viewport-specific layout work;
they are not silently claimed by this 16-item Never List gate.
