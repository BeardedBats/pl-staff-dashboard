import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser } from "@playwright/test";
import { browserRecords } from "../browser/global-setup";

async function actorPage(browser: Browser, actor: "graphics" | "writer") {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    storageState: path.join(process.cwd(), "test-results", "auth", `${actor}.json`),
    viewport: { width: 1440, height: 900 },
  });
  return { context, page: await context.newPage() };
}

test("graphics receives a complete brief, focused asset view, and least-information response", async ({
  browser,
}) => {
  const { context, page } = await actorPage(browser, "graphics");
  try {
    const response = await context.request.get("/api/graphic-requests");
    expect(response.status()).toBe(200);
    const responseText = await response.text();
    for (const privateField of ["earnings", "revenue", "payment", "email"]) {
      expect(responseText).not.toContain(`\"${privateField}\"`);
    }

    await page.goto("/graphics", { waitUntil: "networkidle" });
    await expect(page.getByText("E2E P2.8 featured image")).toBeVisible();
    await expect(page.getByText("Article header")).toBeVisible();
    await expect(page.getByText("1200 × 675 WEBP")).toBeVisible();
    await expect(page.getByText("Pitcher standing on the mound")).toBeVisible();

    await page.getByRole("button", { name: "Assets" }).click();
    await expect(page.getByText("No uploaded assets match")).toBeVisible();

    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(axe.violations).toEqual([]);
  } finally {
    await context.close();
  }
});

test("entry participants cannot submit an incomplete graphic brief", async ({
  browser,
}) => {
  const { context, page } = await actorPage(browser, "writer");
  try {
    await page.goto(`/content?entry=${browserRecords.writerEntryId}`, {
      waitUntil: "networkidle",
    });
    await page.getByRole("button", { name: "Request", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Request a graphic" })).toBeVisible();
    await expect(page.getByLabel("Asset type *")).toBeVisible();
    await expect(page.getByLabel("Delivery format *")).toBeVisible();
    await expect(page.getByLabel("Placement or purpose *")).toHaveValue("Featured image");
    await expect(page.getByLabel("Width (px) *")).toHaveValue("1200");
    await expect(page.getByLabel("Height (px) *")).toHaveValue("675");
    await expect(page.getByLabel("Alt text *")).toHaveAttribute("required", "");
    await page.getByRole("button", { name: "Request graphic" }).click();
    await expect(page.getByRole("dialog", { name: "Request a graphic" })).toBeVisible();
  } finally {
    await context.close();
  }
});
