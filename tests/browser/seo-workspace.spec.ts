import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { browserRecords } from "./global-setup";

test("manager reviews explainable SEO and reaches explicit approval", async ({ browser }, testInfo) => {
  test.skip(Boolean(process.env.PLAYWRIGHT_BASE_URL), "role fixtures are local-only");
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    storageState: path.join(process.cwd(), "test-results", "auth", "manager.json"),
  });
  const page = await context.newPage();
  try {
    await page.route(`**/api/entries/${browserRecords.managerEntryId}/seo`, async (route) => {
      if (route.request().method() !== "GET") return route.continue();
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          workspace: {
            title: "Fantasy Baseball Rankings for 2026",
            contentText: "Fantasy baseball rankings open this guide. First, compare pitchers and values. However, roles change. Finally, choose targets.",
            headings: ["Fantasy Baseball Rankings", "Pitcher Targets"],
            focusKeyphrase: "fantasy baseball rankings",
            metaDescription: "A practical fantasy baseball rankings guide with pitcher targets, values, sleepers, and draft advice for the complete 2026 season.",
            wpModifiedAt: "2026-07-22T00:00:00.000Z",
            titleScore: { total: 80 },
            findings: [],
            yoast: {
              title: "Yoast-reported title",
              description: "Yoast-reported description",
              canonical: "https://pitcherlist.com/e2e-seo-preview/",
              robots: { index: "index", follow: "follow" },
              focusKeyphrase: "fantasy baseball rankings",
              writable: true,
            },
          },
        }),
      });
    });

    await page.goto(`/content?entry=${browserRecords.managerEntryId}`);
    await page.getByRole("tab", { name: "SEO" }).click();
    await expect(page.getByRole("heading", { name: "Pitcher List title studio" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pitcher List analysis" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Yoast-reported values" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Approve and apply" })).toBeEnabled();
    await expect(page.getByText(/including .*Pitcher List/)).toBeVisible();

    const accessibility = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
    expect(accessibility.violations).toEqual([]);
  } finally {
    await context.close();
  }
});
