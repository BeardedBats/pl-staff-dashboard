import { build } from "esbuild";
import nextEnv from "@next/env";
import { pathToFileURL } from "node:url";
import path from "node:path";
// Explicit environment source. Do not copy secrets into the bundle or reports.
const envDir = process.argv.find((arg) => arg.startsWith("--env-dir="))?.slice(10) ?? process.env.PL_RECOVERY_ENV_DIR;
if (!envDir) throw new Error("Provide --env-dir=<existing environment directory>");
nextEnv.loadEnvConfig(path.resolve(envDir));
const out = path.resolve(".recovery-build/recovery.mjs");
await build({ entryPoints: ["scripts/data-recovery.ts"], outfile: out, bundle: true,
  platform: "node", format: "esm", packages: "external", tsconfig: "tsconfig.json",
  plugins: [{ name: "server-only-cli", setup(builder) {
    builder.onResolve({ filter: /^server-only$/ }, () => ({ path: "server-only", namespace: "empty" }));
    builder.onLoad({ filter: /.*/, namespace: "empty" }, () => ({ contents: "", loader: "js" }));
  } }],
});
await import(pathToFileURL(out).href);
