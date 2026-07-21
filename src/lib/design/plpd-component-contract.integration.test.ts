import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const uiRoot = path.join(root, "src/components/ui");

const requiredPrimitives = {
  navigation: "navigation.tsx",
  headers: "page-header.tsx",
  tabs: "tabs.tsx",
  buttons: "button.tsx",
  fields: "field.tsx",
  dropdowns: "select.tsx",
  cards: "card.tsx",
  chips: "badge.tsx",
  tables: "table.tsx",
  pagination: "pagination.tsx",
  alerts: "alert.tsx",
  dialogs: "dialog.tsx",
  drawers: "sheet.tsx",
  loading: "state.tsx",
  empty: "empty-state.tsx",
  errors: "state.tsx",
  gated: "gated-value.tsx",
} as const;

describe("PLPD component contract", () => {
  it("provides every P3.2 primitive family", () => {
    for (const [role, file] of Object.entries(requiredPrimitives)) {
      expect(existsSync(path.join(uiRoot, file)), role).toBe(true);
    }
  });

  it("keeps the gated-value API structurally unable to receive a real value", () => {
    const source = readFileSync(path.join(uiRoot, "gated-value.tsx"), "utf8");
    const props = source.match(/type GatedValueProps = \{([\s\S]*?)\n\};/);

    expect(props, "GatedValueProps declaration").not.toBeNull();
    expect(props?.[1]).not.toMatch(/\bvalue\s*[?:]/);
    expect(source).not.toContain("dangerouslySetInnerHTML");
  });

  it("records canonical versus derived component boundaries", () => {
    const documentation = readFileSync(
      path.join(root, "docs/PLPD_COMPONENTS.md"),
      "utf8",
    );

    for (const role of Object.keys(requiredPrimitives)) {
      expect(documentation.toLowerCase(), role).toContain(role);
    }
    expect(documentation).toContain("no real-value prop");
    expect(documentation).toContain("stand-in loading bars are excluded");
    expect(documentation).toContain("P3.8");
  });

  it("composes exact guide constructions through named helpers", () => {
    const css = readFileSync(path.join(root, "src/app/globals.css"), "utf8");
    const table = readFileSync(path.join(uiRoot, "table.tsx"), "utf8");
    const sheet = readFileSync(path.join(uiRoot, "sheet.tsx"), "utf8");

    expect(css).toContain(".plpd-card::before");
    expect(css).toContain(".plpd-table tbody tr:nth-child(odd) td");
    expect(css).toContain(".plpd-dialog-overlay");
    expect(table).toContain("h-[34.5px]");
    expect(table).toContain("h-[62px]");
    expect(sheet).toContain("plpd-modal-surface");
  });
});
