import { spawn } from "node:child_process";
import path from "node:path";

const nextCli = path.join(
  process.cwd(),
  "node_modules",
  "next",
  "dist",
  "bin",
  "next",
);
const environment = {
  ...process.env,
  NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "browser-test-service-role-key",
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
  process.exitCode = 1;
});

server.on("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (!server.killed) server.kill(signal);
  });
}
