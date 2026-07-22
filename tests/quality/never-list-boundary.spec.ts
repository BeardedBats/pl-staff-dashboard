import path from "node:path";
import { expect, test } from "@playwright/test";

test("production primary action keeps the borderless four-layer Import construction", async ({
  page,
}, testInfo) => {
  await page.goto("/login", { waitUntil: "networkidle" });

  const signIn = page.getByRole("button", { name: "Sign in" });
  await expect(signIn).toBeVisible();
  const construction = await signIn.evaluate((element) => {
    const style = getComputedStyle(element);
    const before = getComputedStyle(element, "::before");
    const after = getComputedStyle(element, "::after");
    return {
      backgroundImage: style.backgroundImage,
      borderStyle: style.borderTopStyle,
      borderWidth: style.borderTopWidth,
      boxShadow: style.boxShadow,
      beforeBackground: before.backgroundImage,
      beforeContent: before.content,
      afterBoxShadow: after.boxShadow,
      afterContent: after.content,
    };
  });

  expect(construction.borderStyle).toBe("none");
  expect(construction.borderWidth).toBe("0px");
  expect(construction.backgroundImage).toContain("149.7deg");
  expect(construction.boxShadow).toContain("rgba(0, 80, 100, 0.4)");
  expect(construction.beforeContent).toBe('""');
  expect(construction.beforeBackground).toContain("rgba(255, 255, 255, 0.15)");
  expect(construction.afterContent).toBe('""');
  expect(construction.afterBoxShadow).toContain("rgba(255, 255, 255, 0.3)");

  await page.screenshot({
    path: testInfo.outputPath("never-list-primary-action.png"),
    fullPage: true,
  });
});

test("production metadata stays upright while hover brightens and active tabs stay amber", async ({
  browser,
}, testInfo) => {
  const eic = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    storageState: path.join(process.cwd(), "test-results", "auth", "eic.json"),
  });

  try {
    const home = await eic.newPage();
    await home.goto("/home", { waitUntil: "networkidle" });
    const pipeline = home
      .locator(".plpd-stateful-card")
      .filter({ hasText: "Pipeline health" });
    const pipelineLink = pipeline.locator('a[href="/content?status=writer_needed"]');
    await expect(pipelineLink).toBeVisible();
    await expect(pipelineLink).toHaveCSS("opacity", "1");

    await pipelineLink.hover();
    await expect(pipelineLink).toHaveCSS("filter", "brightness(1.1)");
    await expect(pipelineLink).toHaveCSS("opacity", "1");
  } finally {
    await eic.close();
  }

  const admin = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    storageState: path.join(
      process.cwd(),
      "test-results",
      "auth",
      "admin.json",
    ),
  });

  try {
    const archive = await admin.newPage();
    await archive.goto("/archive", { waitUntil: "networkidle" });
    await archive
      .getByPlaceholder("Search titles…")
      .first()
      .fill("E2E P3.7 table row 01");

    const row = archive
      .locator(".plpd-table tbody tr")
      .filter({ hasText: "E2E P3.7 table row 01" });
    await expect(row).toBeVisible();
    await expect(row.locator("td").nth(1)).toHaveCSS("font-style", "normal");

    const activeTab = archive.getByRole("tab", { name: /Archived/ });
    await expect(activeTab).toHaveCSS("color", "rgb(255, 194, 119)");
    await expect(activeTab).toHaveCSS("font-weight", "700");

    await archive.screenshot({
      path: testInfo.outputPath("never-list-upright-metadata.png"),
      fullPage: true,
    });
  } finally {
    await admin.close();
  }
});
