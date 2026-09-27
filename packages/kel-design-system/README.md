# Kel design system

Portable CSS tokens and opt-in component recipes. No React, Next.js, Tailwind, JavaScript, or build dependency.

## Install in any app

1. Copy this folder into your app.
2. Load Instrument Sans (400, 500, 600, 700) and Inter (400, 500, 600, 700).
3. Load tokens.css, then components.css.
4. Add recipe classes to your existing semantic elements.

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Instrument+Sans:wght@400;500;600;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link href="./kel-design-system/tokens.css" rel="stylesheet">
<link href="./kel-design-system/components.css" rel="stylesheet">
<body class="kel-canvas">
  <main>
    <h1 class="kel-page-title">My Work</h1>
    <section class="kel-card">
      <h2 class="kel-card-title">Upcoming deadlines</h2>
      <p class="kel-status kel-status-claimed">Claimed</p>
      <button class="kel-btn-primary">Submit for review</button>
    </section>
  </main>
</body>
```

The host owns spacing and layout. The package does not reset global elements.
Use native controls, real labels, and existing event handlers.
The example.html file demonstrates adoption without an app framework.

To package locally, run `npm pack` in this directory. CSS exports support package imports:

```css
@import "@pitcher-list/kel-design-system/tokens.css";
@import "@pitcher-list/kel-design-system/components.css";
```

Publishing requires the owner's registry and license decision. No registry publication occurs as part of this migration.

## Tailwind v4

Load the optional adapter after Tailwind and tokens. Do not create a Tailwind configuration file.

```css
@import "tailwindcss";
@import "./kel-design-system/tokens.css";
@import "./kel-design-system/theme.css";
@import "./kel-design-system/components.css";
```

The adapter uses `@theme inline`. Utilities include `bg-kel-canvas`, `text-kel-title`, `font-kel-ui`, and `rounded-kel-card`.
It does not rename or replace the host's existing utility namespace.

## Next.js fonts

Use next/font/google once in the root layout. Apply both generated variable classes to html.

```tsx
import { Instrument_Sans, Inter } from "next/font/google";
const ui = Instrument_Sans({ subsets: ["latin"], variable: "--font-instrument-sans", display: "swap" });
const body = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });
// <html className={ui.variable + " " + body.variable}>
```

These variables override the portable font-family fallbacks. Next.js serves the fonts locally.
Inter deliberately replaces SF Pro Text. Do not copy older Figma instructions that require SF Pro or forbid Inter.

## Visual specification

### Typography

| Role | Font | Weight | Size / line height |
| --- | --- | --- | --- |
| Page title | Instrument Sans | 600 | 26 / 32px |
| Card title | Instrument Sans | 700 | 15 / 21px; #FFC481 |
| Section label | Instrument Sans | 500 | 12 / 18px |
| Row label | Instrument Sans | 500 | 14 / 21px |
| Body / metadata | Inter | 400–500 | 14–16px / 1.5 |
| Status | Instrument Sans | 700 | 14 / 21px |

### Palette

| Role | Value |
| --- | --- |
| Canvas / navy glass / deep navy | #0B1734 / #0F2D64 / #06122E |
| Primary / gradient end | #2F6BE0 / #1E4BB0 |
| Ice outline endpoints | #DDE9FF → #BFD8FF |
| Primary / secondary text | #EDF2FA / #C4D4E8 |
| Muted / dim | #8FA9D6 / #6F86AD |
| Links / card titles | #9FC3FF / #FFC481 |
| Amber / working | #FCAC51 |
| Success / unread | #7EE0A8 / #7FA0FF |
| Danger gradient / label | #A6443F → #8B312D / #FFF1F0 |
| Soft red / soft violet | #E8737B / #A99CFF |

Dim is decorative, not small readable body text. Use muted for readable secondary details.

### Canvas and surfaces

Canvas: deep navy. Preserve each app's approved mesh asset.
Set `--kel-mesh-image` to that asset when using kel-canvas.
The PL Dashboard keeps its existing `--plpd-mesh-image` declaration verbatim.
The package does not require or duplicate the dashboard mesh.
Apply the 10% blue wash above the mesh.
Apply the top fade above both: rgba(10,31,69,.70) to transparent across 168px.

Glass cards layer rgba(15,45,100,.30) and rgba(47,107,224,.12).
Use backdrop contrast(1.54) saturate(1.35), without card blur.
Use a 1px ice-gradient outline, radius16, inset white 6%, and shadow 0 10px 30px -6px black 30%.
A masked pseudo-element draws the outline without an opaque underlay.
Nested panels may use a quiet navy fill and hairline. Avoid decorative edge strips or isolated light bursts.
Popovers use an opaque navy surface. They must not show confusing text from behind the menu.

### Components

Primary buttons: blue vertical gradient, radius10, inner top highlight, blue glow.
Secondary: navy glass, radius8, minimum height34. Danger: red gradient and pale label.
Keep larger existing touch targets. Icon-only buttons need accessible names.
Inputs/selects: glass fill, ice hairline, radius10/11, readable placeholders, visible focus and invalid states.
Active navigation: blue 22% fill, primary text. Use `active`, `data-active="true"`, or `aria-current="page"`.
Tables: glass outer wrapper, quiet uppercase headings, 14px body, subtle row dividers, blue hover/selection.
Tabs: text labels, pale-blue active underline, no amber glow.
People: text names. Never add avatar bubbles or initials in circles.

### Status map

All statuses use `kel-status` plus the appropriate color class. Keep words visible; never rely on color alone.

| Text | Class | Color |
| --- | --- | --- |
| Writer needed / None / Needed | kel-status-needed | muted |
| Claim pending / Ready for edit | kel-status-pending | amber |
| Claimed / Edited | kel-status-claimed | periwinkle |
| Submitted / Done / Published | kel-status-success | success |
| Polishing | kel-status-polishing | violet |
| Scheduled | kel-status-scheduled | link |
| Flagged | kel-status-flagged | red |

Each named status also has an explicit alias in components.css.
These are bold text, not filled, bordered, rounded, uppercase chips.

## Accessibility and host responsibilities

Keep body and meaningful metadata at least14px. Reserve12px for short section labels.
Check contrast over the final composed background, not isolated swatches.
The dim token does not meet small-text contrast on every surface.
Preserve keyboard focus, labels, descriptions, errors, disabled states, and confirmation dialogs.
Do not replace accessible controls with styled div elements.
The recipes include reduced-motion and forced-color safeguards.
The host must implement menu/tab/dialog behavior and responsive layouts.
Dark mode is canonical. Any light palette is a host-specific accessible extension.

## Figma source

[PLSD Design System](https://www.figma.com/design/qCYof81yjdSZOKgbwYT54y?node-id=2001-6286).

- Foundations: 2002:28893.
- Kel components: 2002:29277.
- NEW Screens (DRAFT): 2002:30709.
- New Components (DRAFT): 2002:30710; library2058:6.
- Content2051:2, My Work2073:2.
- Article Writing2093:2, Polishing2094:2, Comments2095:2.

Reference inspected September25,2026. The user's portable Inter/body specification takes precedence over older foundation notes.
Preserve product controls and permissions when a mockup omits them.
