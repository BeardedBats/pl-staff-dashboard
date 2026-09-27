import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(file, "utf8");
const base = "packages/kel-design-system/";
const tokens = read(`${base}tokens.css`);
const recipes = read(`${base}components.css`);

describe("portable Kel package", () => {
  it("exports plain CSS without framework dependencies", () => {
    const manifest = JSON.parse(read(`${base}package.json`));
    expect(manifest.dependencies).toBeUndefined();
    for (const file of ["tokens.css", "theme.css", "components.css"]) {
      expect(Object.values(manifest.exports)).toContain(`./${file}`);
      expect(read(`${base}${file}`)).not.toMatch(/@\/|next\/|src\//);
    }
    expect(tokens).toContain(":root {");
    expect(read(`${base}theme.css`)).toContain("@theme inline");
  });

  it("pins the approved palette and accessible status recipes", () => {
    for (const [name, color] of Object.entries({ canvas: "#0B1734", blue: "#2F6BE0", amber: "#FCAC51", success: "#7EE0A8", periwinkle: "#7FA0FF", red: "#E8737B", violet: "#A99CFF", "card-title": "#FFC481" })) {
      expect(tokens).toContain(`--kel-${name}: ${color};`);
    }
    for (const status of ["writer-needed", "none", "needed", "claim-pending", "ready-for-edit", "claimed", "edited", "submitted", "done", "published", "polishing", "scheduled", "flagged"]) {
      expect(recipes).toContain(`.kel-status-${status}`);
    }
    expect(recipes).toMatch(/\.kel-status\s*\{[^}]*background: none;[^}]*font: 700/);
    expect(recipes).toContain(":focus-visible");
    expect(recipes).toContain("prefers-reduced-motion: reduce");
    expect(recipes).toContain("forced-colors: active");
  });

  it("keeps the original mesh declaration byte-for-byte", () => {
    const mesh = read("src/app/globals.css").match(/--plpd-mesh-image:[^;]+;/)?.[0];
    expect(mesh).toBeTruthy();
    expect(createHash("sha256").update(mesh!).digest("hex")).toBe("df8cc25ef7855db32224faaf3bf1fd8d7b4475239a80719c49134e1cf8f8109d");
  });

  it("documents standalone adoption and uses names instead of avatar bubbles", () => {
    const readme = read(`${base}README.md`);
    expect(readme).toContain("Instrument Sans");
    expect(readme).toContain("Inter");
    expect(readme).toContain("qCYof81yjdSZOKgbwYT54y");
    const avatar = read("src/components/users/user-avatar.tsx");
    expect(avatar).toContain("displayName.trim()");
    expect(avatar).not.toMatch(/<Avatar|<img|rounded-full/);
  });
});
