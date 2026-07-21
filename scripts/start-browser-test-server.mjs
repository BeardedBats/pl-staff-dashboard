import { spawn, spawnSync } from "node:child_process";
import path from "node:path";

const nextCli = path.join(
  process.cwd(),
  "node_modules",
  "next",
  "dist",
  "bin",
  "next",
);
const supabaseCli = path.join(
  process.cwd(),
  "node_modules",
  "supabase",
  "dist",
  "supabase.js",
);
const supabaseStartArguments = [
  "start",
  "--exclude",
  "edge-runtime,gotrue,imgproxy,logflare,mailpit,realtime,storage-api,studio,supavisor,vector",
];

function supabaseIsRunning() {
  return spawnSync(
    process.execPath,
    [supabaseCli, "status", "--output", "json"],
    { cwd: process.cwd(), env: process.env, stdio: "ignore" },
  ).status === 0;
}

function runSupabase(arguments_) {
  const result = spawnSync(process.execPath, [supabaseCli, ...arguments_], {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`supabase ${arguments_.join(" ")} exited with ${result.status}`);
  }
}

function localServiceRoleKey() {
  const result = spawnSync(
    "docker",
    ["inspect", "supabase_kong_pl-staff-dashboard"],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error("Unable to inspect the local Supabase gateway");
  }
  const inspected = JSON.parse(result.stdout)[0];
  const configuration = JSON.stringify(
    inspected?.Config?.Entrypoint ?? inspected?.Config?.Cmd ?? [],
  );
  const key = configuration.match(/sb_secret_[A-Za-z0-9_-]+/)?.[0];
  if (!key) throw new Error("Local Supabase service key was not found");
  return key;
}

let ownsLocalStack = false;
if (!supabaseIsRunning()) {
  runSupabase(supabaseStartArguments);
  ownsLocalStack = true;
}

function stopOwnedLocalStack() {
  if (!ownsLocalStack) return;
  ownsLocalStack = false;
  runSupabase(["stop"]);
}

const environment = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:54321",
  SUPABASE_SERVICE_ROLE_KEY: localServiceRoleKey(),
  JWT_SECRET: "browser-test-access-secret-at-least-32-characters",
  JWT_REFRESH_SECRET: "browser-test-refresh-secret-at-least-32-characters",
  WP_PL_URL: "https://example.com",
  WP_PL_USERNAME: "browser-test-user",
  WP_PL_APP_PASSWORD: "browser-test-application-password",
  WP_QB_URL: "",
  WP_QB_USERNAME: "",
  WP_QB_APP_PASSWORD: "",
  GA4_CLIENT_ID: "",
  GA4_CLIENT_SECRET: "",
  GA4_PROPERTY_ID: "",
  NEXT_PUBLIC_APP_URL: "http://127.0.0.1:3100",
  CRON_SECRET: "browser-test-cron-secret-at-least-16-characters",
};

const server = spawn(
  process.execPath,
  [nextCli, "dev", ...process.argv.slice(2)],
  {
    cwd: process.cwd(),
    env: environment,
    stdio: "inherit",
  },
);

server.on("error", (error) => {
  console.error("Unable to start the browser-test server.", error);
  stopOwnedLocalStack();
  process.exitCode = 1;
});

server.on("exit", (code, signal) => {
  stopOwnedLocalStack();
  process.exitCode = code ?? (signal ? 1 : 0);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (!server.killed) server.kill(signal);
  });
}
