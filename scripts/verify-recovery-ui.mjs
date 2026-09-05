import nextEnv from "@next/env";
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdir } from "node:fs/promises";
nextEnv.loadEnvConfig(process.env.PL_RECOVERY_ENV_DIR ?? process.cwd());
const baseURL = process.env.PL_VERIFY_URL ?? "http://127.0.0.1:3201";
if (!/^http:\/\/127\.0\.0\.1:3201$/.test(baseURL)) throw new Error("This interaction check is limited to the local app");
await mkdir(".recovery-build/screenshots", { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ baseURL });
const errors = [];
const page = await context.newPage();
page.on("pageerror", (error) => errors.push(error.message));
try {
  const response = await context.request.post("/api/auth/login", { data: {
    username: process.env.WP_PL_USERNAME, password: process.env.WP_PL_APP_PASSWORD,
  } });
  if (!response.ok()) throw new Error(`Real login failed: ${response.status()}`);
  for (const viewport of [{ width: 1440, height: 1000 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    for (const route of process.env.PL_VERIFY_ROUTE ? [process.env.PL_VERIFY_ROUTE] : ["/my-tasks", "/connections", "/content", "/calendar", "/settings", "/notifications"]) {
      await page.goto(route, { waitUntil: "networkidle", timeout: 60_000 });
      if (page.url().includes("/login")) throw new Error(`Session lost on ${route}`);
      const name = `${route.slice(1)}-${viewport.width}`;
      await page.screenshot({ path: `.recovery-build/screenshots/${name}.png`, fullPage: true });
      const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      console.log(JSON.stringify({ route, width: viewport.width,
        heading: await page.locator("h1").first().innerText(),
        overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
        accessibility: result.violations.map((item) => ({ id: item.id, impact: item.impact, count: item.nodes.length, nodes: item.nodes.map((node) => ({ target: node.target, summary: node.failureSummary })) })),
      }));
      if (result.violations.some((item) => item.impact === "critical" || item.impact === "serious")) throw new Error(`Accessibility failure on ${name}`);
    }
  }
  await page.goto("/settings?tab=sync");
  await page.waitForURL("**/connections");
  console.log(JSON.stringify({ legacySyncLink: "passes", browserErrors: errors }));
  if (errors.length) throw new Error("Browser runtime errors detected");
} finally {
  await context.request.post("/api/auth/logout").catch(() => undefined);
  await context.close(); await browser.close();
}
