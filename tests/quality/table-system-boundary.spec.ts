import path from "node:path";
import { expect, test, type Locator } from "@playwright/test";

async function computedTableStyle(locator: Locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      color: style.color,
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      fontWeight: style.fontWeight,
      height: style.height,
      textAlign: style.textAlign,
      transitionDuration: style.transitionDuration,
    };
  });
}

test("production analytics renders the Kel table and numeric-value contract", async ({
  browser,
}, testInfo) => {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    storageState: path.join(process.cwd(), "test-results", "auth", "eic.json"),
  });
  const page = await context.newPage();

  try {
    await page.goto("/analytics", { waitUntil: "networkidle" });
    await page.getByRole("tab", { name: "Articles" }).click();

    const row = page
      .locator(".plpd-table tbody tr")
      .filter({ hasText: "E2E P3.6 gated financial sentinel" });
    await expect(row).toBeVisible();

    const header = page.locator(".plpd-table th").first();
    const headerStyle = await computedTableStyle(header);
    expect(Number.parseFloat(headerStyle.height)).toBeCloseTo(44, 0);
    expect(headerStyle.backgroundColor).toBe("rgb(27, 49, 86)");
    expect(headerStyle.color).toBe("rgb(143, 169, 214)");
    expect(headerStyle.fontFamily).toContain("Instrument Sans");
    expect(headerStyle.fontSize).toBe("12px");
    expect(headerStyle.fontWeight).toBe("600");

    const numericCells = row.locator('td[data-numeric="true"]');
    const pageviews = numericCells.nth(0);
    const sessions = numericCells.nth(1);
    await expect(pageviews).toHaveText("1,337");
    await expect(sessions).toHaveText("0");
    await expect(sessions).toHaveAttribute("data-zero", "true");

    const numericStyle = await computedTableStyle(pageviews);
    const zeroStyle = await computedTableStyle(sessions);
    expect(Number.parseFloat(numericStyle.height)).toBeCloseTo(62, 0);
    expect(numericStyle.fontFamily).toContain("Inter");
    expect(numericStyle.fontSize).toBe("14px");
    expect(numericStyle.textAlign).toBe("right");
    expect(zeroStyle.color).toBe("rgb(143, 169, 214)");
    expect(zeroStyle.transitionDuration).toBe("0.12s");

    await row.hover();
    await expect
      .poll(async () => (await computedTableStyle(sessions)).backgroundColor)
      .toBe("rgba(47, 107, 224, 0.12)");

    await page.screenshot({
      path: testInfo.outputPath("analytics-table-contract.png"),
      fullPage: true,
    });
  } finally {
    await context.close();
  }
});

test("production archive paginates at 25 rows with exact endpoint states", async ({
  browser,
}, testInfo) => {
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
    await page.goto("/archive", { waitUntil: "networkidle" });
    await page
      .getByPlaceholder("Search titles…")
      .first()
      .fill("E2E P3.7 table row");

    const pagination = page.getByRole("navigation", {
      name: "Archive pages",
    });
    const previous = pagination.getByRole("button", { name: "Previous page" });
    const next = pagination.getByRole("button", { name: "Next page" });
    const current = pagination.locator('[aria-current="page"]');

    await expect(page.getByText("E2E P3.7 table row 01")).toBeVisible();
    await expect(page.getByText("E2E P3.7 table row 25")).toBeVisible();
    await expect(page.getByText("E2E P3.7 table row 26")).toHaveCount(0);
    await expect(current).toHaveText("1");
    await expect(previous).toBeDisabled();
    await expect(next).toBeEnabled();

    const previousStyle = await previous.evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        height: style.height,
        opacity: style.opacity,
        width: style.width,
      };
    });
    expect(previousStyle).toEqual({
      height: "32px",
      opacity: "0.4",
      width: "32px",
    });
    await expect(pagination).toHaveCSS("column-gap", "14px");

    await next.hover();
    await expect(next).toHaveCSS("filter", "brightness(1.2)");
    await next.click();

    await expect(current).toHaveText("2");
    await expect(page.getByText("E2E P3.7 table row 26")).toBeVisible();
    await expect(page.getByText("E2E P3.7 table row 01")).toHaveCount(0);
    await expect(previous).toBeEnabled();
    await expect(next).toBeDisabled();

    await page.screenshot({
      path: testInfo.outputPath("archive-pagination-contract.png"),
      fullPage: true,
    });
  } finally {
    await context.close();
  }
});
