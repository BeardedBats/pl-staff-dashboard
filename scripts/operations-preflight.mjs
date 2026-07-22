import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const PROJECT_REF = "ovnwmayhbmbdzbxrfrul";
const PRODUCTION_LOGIN = "https://pl-staff-dashboard.vercel.app/login";
const isWindows = process.platform === "win32";

function executable(name) {
  return isWindows ? `${name}.cmd` : name;
}

function run(command, args, timeout = 15_000) {
  const usesCommandShim = isWindows && command.endsWith(".cmd");
  const executableName = usesCommandShim
    ? process.env.ComSpec ?? "cmd.exe"
    : command;
  const executableArgs = usesCommandShim
    ? [
        "/d",
        "/s",
        "/c",
        `call ${[command, ...args].join(" ")}`,
      ]
    : args;
  const result = spawnSync(executableName, executableArgs, {
    cwd: process.cwd(),
    encoding: "utf8",
    timeout,
    windowsHide: true,
  });
  return {
    ok: result.status === 0,
    timedOut: result.error?.code === "ETIMEDOUT",
    stdout: result.stdout?.trim() ?? "",
  };
}

function migrationState() {
  const directory = path.join(process.cwd(), "supabase", "migrations");
  const files = readdirSync(directory)
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
    .sort();
  const versions = files.map((file) => Number(file.slice(0, 4)));
  const contiguous = versions.every(
    (version, index) => index === 0 || version === versions[index - 1] + 1,
  );
  return {
    count: files.length,
    first: files[0] ?? null,
    latest: files.at(-1) ?? null,
    contiguous,
  };
}

function localContract() {
  const required = [
    "docs/runbooks/README.md",
    "docs/runbooks/BACKUP_AND_RESTORE.md",
    "docs/runbooks/MIGRATION_AND_ROLLBACK.md",
    "docs/runbooks/INCIDENT_RESPONSE.md",
    "docs/runbooks/SECRET_ROTATION.md",
    "docs/runbooks/DEPLOYMENT.md",
  ];
  const gitHead = run("git", ["rev-parse", "HEAD"]);
  const gitStatus = run("git", ["status", "--porcelain", "--untracked-files=no"]);
  const supabaseVersion = run(executable("npx"), ["supabase", "--version"]);
  const vercelVersion = run(executable("vercel"), ["--version"]);
  const githubVersion = run("gh", ["--version"]);
  return {
    gitHead: gitHead.ok ? gitHead.stdout : null,
    trackedWorktreeClean: gitStatus.ok && gitStatus.stdout.length === 0,
    migrations: migrationState(),
    runbooksPresent: required.every((file) => existsSync(file)),
    tools: {
      supabase: supabaseVersion.ok ? supabaseVersion.stdout : "unavailable",
      vercel: vercelVersion.ok ? vercelVersion.stdout.split(/\r?\n/)[0] : "unavailable",
      github: githubVersion.ok ? githubVersion.stdout.split(/\r?\n/)[0] : "unavailable",
    },
  };
}

async function productionContract() {
  const backups = run(
    executable("npx"),
    [
      "supabase",
      "backups",
      "list",
      "--project-ref",
      PROJECT_REF,
      "--output",
      "json",
    ],
    30_000,
  );
  let backupSummary = { available: false };
  if (backups.ok) {
    try {
      const parsed = JSON.parse(backups.stdout);
      const completed = (parsed.backups ?? []).filter(
        (backup) => backup.status === "COMPLETED",
      );
      backupSummary = {
        available: completed.length > 0,
        completedCount: completed.length,
        latestCompletedAt: completed[0]?.inserted_at ?? null,
        pitrEnabled: parsed.pitr_enabled === true,
      };
    } catch {
      backupSummary = { available: false, reason: "invalid_cli_response" };
    }
  } else {
    backupSummary = {
      available: false,
      reason: backups.timedOut ? "cli_timeout" : "management_access_unavailable",
    };
  }

  const linkedRefPath = path.join(
    process.cwd(),
    "supabase",
    ".temp",
    "project-ref",
  );
  const linkedRef = existsSync(linkedRefPath)
    ? readFileSync(linkedRefPath, "utf8").trim()
    : null;
  const linkedMigrationAccess =
    linkedRef === PROJECT_REF
      ? run(
          executable("npx"),
          ["supabase", "migration", "list", "--linked"],
          30_000,
        )
      : { ok: false, timedOut: false };
  const databaseMigrationAccessConfigured = Boolean(
    process.env.SUPABASE_DB_URL ||
      (linkedRef === PROJECT_REF &&
        (process.env.SUPABASE_DB_PASSWORD || linkedMigrationAccess.ok)),
  );

  const vercelLink = existsSync(path.join(process.cwd(), ".vercel", "project.json"));
  const vercelIdentity = run(executable("vercel"), ["whoami"], 10_000);

  let productionLogin = { reachable: false };
  try {
    const response = await fetch(PRODUCTION_LOGIN, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(10_000),
    });
    productionLogin = { reachable: response.status === 200, status: response.status };
  } catch {
    productionLogin = { reachable: false, status: null };
  }

  return {
    projectRef: PROJECT_REF,
    backups: backupSummary,
    databaseMigrationAccessConfigured,
    databaseMigrationAccessProbeTimedOut: linkedMigrationAccess.timedOut,
    vercel: {
      linked: vercelLink,
      authenticated: vercelIdentity.ok,
      probeTimedOut: vercelIdentity.timedOut,
    },
    productionLogin,
  };
}

const includeProduction = process.argv.includes("--production");
const requireReleaseAccess = process.argv.includes("--require-release-access");
const report = {
  generatedAt: new Date().toISOString(),
  mode: includeProduction ? "production-readiness" : "local-contract",
  local: localContract(),
  ...(includeProduction ? { production: await productionContract() } : {}),
};

console.log(JSON.stringify(report, null, 2));

const localReady =
  report.local.runbooksPresent &&
  report.local.migrations.contiguous &&
  Boolean(report.local.migrations.latest);
const releaseReady =
  !includeProduction ||
  (report.local.trackedWorktreeClean &&
    report.production.backups.available &&
    report.production.databaseMigrationAccessConfigured &&
    report.production.vercel.authenticated &&
    report.production.vercel.linked &&
    report.production.productionLogin.reachable);

if (!localReady || (requireReleaseAccess && !releaseReady)) process.exitCode = 1;
