import path from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";

const stableTime = new Date("2026-07-21T16:00:00.000Z");

async function authenticatedPage(
  browser: Browser,
  actor: "admin" | "eic",
  viewport: { width: number; height: number },
) {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    colorScheme: "dark",
    reducedMotion: "reduce",
    storageState: path.join(process.cwd(), "test-results", "auth", `${actor}.json`),
    viewport,
  });
  const page = await context.newPage();
  await page.clock.setFixedTime(stableTime);
  return { context, page };
}

async function readyPage(page: Page, route: string, heading: string | RegExp) {
  await page.goto(route, { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: heading }).first()).toBeVisible();
  await page.evaluate(() => document.fonts.ready);
}

test("anonymous mobile login page matches its PLPD baseline", async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    colorScheme: "dark",
    reducedMotion: "reduce",
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  await page.clock.setFixedTime(stableTime);

  try {
    await page.goto("/login", { waitUntil: "networkidle" });
    await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    await expect(page).toHaveScreenshot("login-mobile-dark.png", {
      fullPage: true,
      maxDiffPixelRatio: 0.05,
    });
  } finally {
    await context.close();
  }
});

test("administrator home page matches its desktop PLPD baseline", async ({ browser }) => {
  const { context, page } = await authenticatedPage(browser, "admin", {
    width: 1440,
    height: 900,
  });

  try {
    await readyPage(page, "/home", /Welcome,/);
    await expect(page).toHaveScreenshot("admin-home-desktop.png", { fullPage: true });
  } finally {
    await context.close();
  }
});

test("responsive archive table matches its mobile PLPD baseline", async ({ browser }) => {
  const { context, page } = await authenticatedPage(browser, "admin", {
    width: 390,
    height: 844,
  });

  try {
    await readyPage(page, "/archive", "Archive");
    await expect(page).toHaveScreenshot("archive-mobile.png", { fullPage: true });
  } finally {
    await context.close();
  }
});

test("shared dialog controls match their PLPD primitive baseline", async ({ browser }) => {
  const { context, page } = await authenticatedPage(browser, "admin", {
    width: 1440,
    height: 900,
  });

  try {
    await readyPage(page, "/settings?tab=templates", "Settings");
    await page.getByRole("button", { name: "New template" }).first().click();
    const dialog = page.getByRole("dialog", { name: "New recurring template" });
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveScreenshot("template-dialog-primitives.png");
  } finally {
    await context.close();
  }
});

test("EIC analytics page matches its financial-data baseline", async ({ browser }) => {
  const { context, page } = await authenticatedPage(browser, "eic", {
    width: 1440,
    height: 900,
  });

  try {
    await readyPage(page, "/analytics", "Analytics");
    await expect(page).toHaveScreenshot("eic-analytics-desktop.png", { fullPage: true });
  } finally {
    await context.close();
  }
});
