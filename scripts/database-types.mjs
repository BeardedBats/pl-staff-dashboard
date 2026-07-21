import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const outputPath = path.join(process.cwd(), "src", "types", "database.ts");
const supabaseScript = path.join(
  process.cwd(),
  "node_modules",
  "supabase",
  "dist",
  "supabase.js",
);
const result = spawnSync(
  process.execPath,
  [
    supabaseScript,
    "gen",
    "types",
    "typescript",
    "--local",
    "--schema",
    "public",
  ],
  {
    cwd: process.cwd(),
    encoding: "utf8",
  },
);

if (result.error || result.status !== 0) {
  const detail =
    result.stderr?.trim() || result.error?.message || "Unknown generator failure";
  console.error("Database type generation failed.");
  console.error("Start Docker and run `npm run db:start`, then retry.");
  console.error(detail);
  process.exit(1);
}

const normalize = (value) => `${value.replace(/\r\n/g, "\n").trimEnd()}\n`;
const generated = normalize(result.stdout ?? "");

if (process.argv.includes("--check")) {
  const committed = normalize(readFileSync(outputPath, "utf8"));
  if (generated !== committed) {
    console.error("Generated database types are out of date.");
    console.error("Run `npm run db:types:generate` and commit src/types/database.ts.");
    process.exit(1);
  }
  console.log("Generated database types match the committed schema contract.");
} else {
  writeFileSync(outputPath, generated, "utf8");
  console.log(`Updated ${path.relative(process.cwd(), outputPath)}.`);
}
