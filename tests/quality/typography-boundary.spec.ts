import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

async function fontFamily(locator: Locator) {
  return locator.evaluate((element) => getComputedStyle(element).fontFamily);
}

async function waitForFonts(page: Page) {
  await page.evaluate(() => document.fonts.ready);
}

test("anonymous chrome and wordmark load the assigned font families", async (
  { page },
  testInfo,
) => {
  await page.goto("/login", { waitUntil: "networkidle" });
  await waitForFonts(page);

  await expect(
    fontFamily(page.getByRole("heading", { name: "Staff Dashboard" })),
  ).resolves.toContain("DM Sans");
  await expect(fontFamily(page.getByText("Pitcher List", { exact: true }))).resolves.toContain(
    "Work Sans",
  );
  await expect(fontFamily(page.getByRole("button", { name: "Sign in" }))).resolves.toContain(
    "DM Sans",
  );
  await page.screenshot({
    path: testInfo.outputPath("login-typography.png"),
    fullPage: true,
  });
});

test("authenticated chrome, form data, tables, and data pills keep their boundary", async (
  { browser },
  testInfo,
) => {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    storageState: path.join(
      process.cwd(),
      "test-results",
      "auth",
      "admin.json",
    ),
  });
  const page = await context.newPage();

  try {
    await page.goto("/settings?tab=users", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
    await waitForFonts(page);

    await expect(
      fontFamily(page.getByRole("heading", { name: "Settings" })),
    ).resolves.toContain("DM Sans");
    await expect(fontFamily(page.getByPlaceholder("Search staff by name or email…"))).resolves.toContain(
      "Work Sans",
    );
    await expect(fontFamily(page.locator("table").first())).resolves.toContain(
      "Work Sans",
    );
    await expect(fontFamily(page.locator("table .font-data").first())).resolves.toContain(
      "Work Sans",
    );
    await page.screenshot({
      path: testInfo.outputPath("settings-typography.png"),
      fullPage: true,
    });
  } finally {
    await context.close();
  }
});
