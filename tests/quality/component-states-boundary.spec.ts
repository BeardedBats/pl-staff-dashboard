import path from "node:path";
import { expect, test, type Locator } from "@playwright/test";

async function stateSurface(locator: Locator) {
  return locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backgroundImage: style.backgroundImage,
      boxShadow: style.boxShadow,
      transform: style.transform,
      transitionDuration: style.transitionDuration,
    };
  });
}

test("production widgets expose the exact default, hover, and active surface states", async (
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
    await page.goto("/home", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();

    const widget = page
      .locator('.plpd-stateful-card[data-plpd-state="default"]')
      .first();
    await expect(widget).toHaveAttribute("data-plpd-state", "default");
    await expect(page.locator('[data-plpd-state="empty"]').first()).toBeVisible();

    const resting = await stateSurface(widget);
    expect(resting.transitionDuration).toContain("0.15s");

    await widget.hover();
    await expect.poll(async () => (await stateSurface(widget)).transform).not.toBe(
      resting.transform,
    );
    const hover = await stateSurface(widget);
    expect(hover.backgroundImage).toContain("rgba(255, 255, 255, 0.04)");

    const badgedWidget = page
      .locator('.plpd-stateful-card[data-plpd-state="default"]')
      .filter({ has: page.locator('[data-slot="badge"]') })
      .first();
    await expect(badgedWidget).toBeVisible();
    await badgedWidget.hover();
    await expect
      .poll(() =>
        badgedWidget
          .locator('[data-slot="badge"]')
          .first()
          .evaluate((element) => getComputedStyle(element).opacity),
      )
      .toBe("0.88");

    const activeShadow = await widget.evaluate((element) => {
      element.setAttribute("data-plpd-state", "active");
      return getComputedStyle(element).boxShadow;
    });
    expect(activeShadow).toContain("rgba(242, 178, 75, 0.3)");

    await page.screenshot({
      path: testInfo.outputPath("home-component-states.png"),
      fullPage: true,
    });
  } finally {
    await context.close();
  }
});
