# PLPD subtle-glass-over-mesh boundary

The visual authority is Nick's local `PLPD Style Guide 6-21-26.html`, version
1.2, verified at SHA-256
`DB7CDC395BD380FECA6DBFA0D687D7AB577BF9B9D80D79CF96388A64E804C98B`.

## Load-bearing atmosphere

Dark mode has three required layers:

1. the exact guide mesh on the page canvas;
2. a transparent sidebar with the source cyan-tinted glass wash and edge
   shadow; and
3. translucent panels and table rows through which the mesh remains visible.

The semantic `card` surface maps to the guide's exact panel fill,
`rgba(33, 36, 58, 0.35)`. Shared state/card constructions retain their exact
40% or source-specified fills. Depth comes from the guide's named outer shadow
stack, 1 px inset highlights, and borders—not generic heavy shadows.

Frosted glass is prohibited. Application sources may not use
`backdrop-filter` or Tailwind `backdrop-blur-*` utilities. The pointed card's
ordinary `filter: blur(13px)` remains allowed because it creates the exact
source shadow point behind the card; it does not blur page content through a
surface.

Dropdown menus use the source translucent blue gradient. Controls such as
inputs may retain their specified solid navy surface; this boundary targets
panels and chrome rather than erasing the five-step surface hierarchy.

## Derived light mode

The guide defines a dark mesh product. The existing derived light mode keeps
its flat canvas and high-opacity readable panel fill, both recorded in the
central registry. It does not claim to be a source-canonical mesh treatment.

## Enforcement

`plpd-glass-mesh-contract.integration.test.ts` pins the exact panel/row fills,
semantic mapping, mesh/sidebar construction, dropdown migration, shadow stack,
and no-frosted-glass rule. Production Chromium checks separately verify that
the mesh resolves, sidebar remains transparent, representative legacy panels
compute to a translucent background, backdrop filtering is absent, and the
screens remain free of horizontal overflow.
