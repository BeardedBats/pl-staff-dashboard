import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const requiredFiles = [
  "README.md",
  "BACKUP_AND_RESTORE.md",
  "MIGRATION_AND_ROLLBACK.md",
  "INCIDENT_RESPONSE.md",
  "SECRET_ROTATION.md",
  "DEPLOYMENT.md",
];
const errors = [];

function read(relativePath) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

for (const file of requiredFiles) {
  const body = read(path.join("docs", "runbooks", file));
  for (const section of [
    "## Preconditions",
    "## Stop conditions",
    "## Verification",
    "## Evidence to retain",
  ]) {
    if (!body.includes(section)) errors.push(`${file} is missing ${section}`);
  }
}

const migrations = readdirSync(path.join(root, "supabase", "migrations"))
  .filter((file) => /^\d{4}_.+\.sql$/.test(file))
  .sort();
const versions = migrations.map((file) => Number(file.slice(0, 4)));
if (
  !versions.every(
    (version, index) => index === 0 || version === versions[index - 1] + 1,
  )
) {
  errors.push("migration versions are not contiguous");
}
const latestMigration = migrations.at(-1);
const migrationRunbook = read("docs/runbooks/MIGRATION_AND_ROLLBACK.md");
if (!latestMigration || !migrationRunbook.includes(latestMigration)) {
  errors.push("migration runbook does not name the latest migration");
}

const envKeys = read(".env.example")
  .split(/\r?\n/)
  .map((line) => /^([A-Z][A-Z0-9_]*)=/.exec(line)?.[1])
  .filter(Boolean);
const rotationRunbook = read("docs/runbooks/SECRET_ROTATION.md");
for (const key of envKeys) {
  if (!rotationRunbook.includes(key)) {
    errors.push(`secret rotation runbook omits ${key}`);
  }
}

const combined = requiredFiles
  .map((file) => read(path.join("docs", "runbooks", file)))
  .join("\n");
for (const command of [
  "supabase backups list",
  "supabase db dump",
  "supabase migration list",
  "supabase db push --dry-run",
  "supabase db push",
  "supabase storage cp",
  "vercel logs",
  "vercel rollback",
  "vercel promote",
  "npm run test:coverage",
  "npm run test:database",
  "npm run test:browser",
  "npm run ops:preflight:production",
  "--single-transaction",
  "SET session_replication_role = replica",
  "-x storage.buckets_vectors",
  "-x storage.vector_indexes",
]) {
  if (!combined.includes(command)) errors.push(`runbooks omit command: ${command}`);
}

if (errors.length > 0) {
  for (const error of errors) console.error(`RUNBOOK_CONTRACT: ${error}`);
  process.exit(1);
}

console.log(
  `Runbook contract verified: ${requiredFiles.length} files, ${envKeys.length} environment keys, migrations ${migrations[0]} through ${latestMigration}.`,
);
