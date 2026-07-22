import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser } from "@playwright/test";
import { browserActors } from "../browser/global-setup";

async function actorPage(browser: Browser, actor: "writer" | "admin") {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    storageState: path.join(process.cwd(), "test-results", "auth", `${actor}.json`),
    viewport: { width: 1440, height: 900 },
  });
  return { context, page: await context.newPage() };
}

test("staff can configure real in-app batching and local quiet hours", async ({
  browser,
}) => {
  const { context, page } = await actorPage(browser, "writer");
  try {
    await page.goto("/settings?tab=notifications", { waitUntil: "networkidle" });
    await expect(page.getByText("Delivery schedule")).toBeVisible();
    await expect(page.getByText(/delivered only inside this dashboard/i)).toBeVisible();
    await expect(page.getByText("Discord", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Email", { exact: true })).toHaveCount(0);

    await page.getByLabel("Delivery").click();
    await page.getByRole("option", { name: "Daily batch" }).click();
    await page.getByLabel("Daily batch time").fill("08:30");
    await page.getByLabel("Quiet hours start").fill("22:00");
    await page.getByLabel("Quiet hours end").fill("07:00");
    const saved = page.waitForResponse(
      (response) =>
        response.url().endsWith(
          `/api/users/${browserActors.writer.userId}/notification-prefs`,
        ) && response.request().method() === "PATCH",
    );
    await page.getByRole("button", { name: "Save preferences" }).click();
    expect((await saved).status()).toBe(200);
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();

    await page.reload({ waitUntil: "networkidle" });
    await expect(page.getByLabel("Delivery")).toContainText("Daily batch");
    await expect(page.getByLabel("Daily batch time")).toHaveValue("08:30");
    await expect(page.getByLabel("Quiet hours start")).toHaveValue("22:00");
    await expect(page.getByLabel("Quiet hours end")).toHaveValue("07:00");
  } finally {
    await context.close();
  }
});

test("administrators receive an understandable notification and system-health view", async ({
  browser,
}) => {
  const { context, page } = await actorPage(browser, "admin");
  try {
    await page.goto("/settings?tab=sync", { waitUntil: "networkidle" });
    await expect(page.getByText("System health", { exact: false }).first()).toBeVisible();
    await expect(page.getByText(/operating normally|need attention|action is required/i)).toBeVisible();
    await expect(page.getByText("In-app notifications", { exact: true })).toBeVisible();
    await expect(page.getByText(/scheduled for a daily batch or quiet-hours release/i)).toBeVisible();
    await expect(page.getByText("Scheduled jobs", { exact: true })).toBeVisible();

    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(axe.violations).toEqual([]);
  } finally {
    await context.close();
  }
});
