import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

function alphaFromColor(value: string) {
  if (value === "transparent") return 0;
  const commaAlpha = value.match(/rgba\([^)]*,\s*([\d.]+)\s*\)$/);
  if (commaAlpha) return Number(commaAlpha[1]);
  const slashAlpha = value.match(/\/\s*([\d.]+)\s*\)$/);
  if (slashAlpha) return Number(slashAlpha[1]);
  return 1;
}

async function surface(locator: Locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      backgroundImage: style.backgroundImage,
      backdropFilter: style.backdropFilter,
    };
  });
}

async function hasHorizontalOverflow(page: Page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

test("anonymous canvas keeps the mesh visible through an unfrosted panel", async (
  { page },
  testInfo,
) => {
  await page.goto("/login", { waitUntil: "networkidle" });
  const body = await surface(page.locator("body"));
  const wordmark = await surface(
    page.getByText("Pitcher List", { exact: true }).locator(".."),
  );

  expect(body.backgroundImage).toContain("data:image/svg+xml");
  expect(alphaFromColor(wordmark.backgroundColor)).toBeLessThan(1);
  expect(wordmark.backdropFilter).toBe("none");
  expect(await hasHorizontalOverflow(page)).toBe(false);
  await page.screenshot({
    path: testInfo.outputPath("login-glass-mesh.png"),
    fullPage: true,
  });
});

test("authenticated sidebar and legacy page panels preserve the mesh", async (
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
    await page.goto("/calendar", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Calendar" })).toBeVisible();

    const body = await surface(page.locator("body"));
    const sidebar = await surface(page.locator("aside.plpd-sidebar"));
    const sidebarWash = await page.locator("aside.plpd-sidebar").evaluate(
      (element) => getComputedStyle(element, "::before").backgroundImage,
    );
    const calendarPanel = await surface(page.locator(".calendar-wrapper"));
    const header = await surface(page.locator("header").first());

    expect(body.backgroundImage).toContain("data:image/svg+xml");
    expect(alphaFromColor(sidebar.backgroundColor)).toBe(0);
    expect(sidebarWash).not.toBe("none");
    expect(alphaFromColor(calendarPanel.backgroundColor)).toBeCloseTo(0.35, 2);
    expect(alphaFromColor(header.backgroundColor)).toBeLessThan(1);
    expect(await hasHorizontalOverflow(page)).toBe(false);
    await page.screenshot({
      path: testInfo.outputPath("calendar-glass-mesh.png"),
      fullPage: true,
    });
  } finally {
    await context.close();
  }
});
