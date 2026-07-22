import { spawnSync } from "node:child_process";
import path from "node:path";

const executable = process.execPath;
const supabaseCli = path.join(
  process.cwd(),
  "node_modules",
  "supabase",
  "dist",
  "supabase.js",
);
const startArguments = [
  "start",
  "--exclude",
  "edge-runtime,gotrue,imgproxy,logflare,mailpit,realtime,storage-api,studio,supavisor,vector",
];

function invoke(arguments_, options = {}) {
  const result = spawnSync(executable, [supabaseCli, ...arguments_], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
    ...options,
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    const description = result.signal
      ? `terminated by ${result.signal}`
      : `exited with code ${result.status}`;
    throw new Error(`supabase ${arguments_.join(" ")} ${description}`);
  }
}

function databaseIsRunning() {
  const result = spawnSync(
    executable,
    [supabaseCli, "status", "--output", "json"],
    {
      cwd: process.cwd(),
      env: process.env,
      stdio: "ignore",
    },
  );
  return result.status === 0;
}

let ownsLocalStack = false;

try {
  if (!databaseIsRunning()) {
    invoke(startArguments);
    ownsLocalStack = true;
  }
  invoke(["test", "db"]);
} finally {
  if (ownsLocalStack) {
    invoke(["stop"]);
  }
}
