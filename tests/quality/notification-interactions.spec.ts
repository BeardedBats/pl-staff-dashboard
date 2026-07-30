import path from "node:path";
import { expect, test, type Browser } from "@playwright/test";
import { browserActors, browserRecords } from "../browser/global-setup";

async function writerPage(browser: Browser) {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    storageState: path.join(
      process.cwd(),
      "test-results",
      "auth",
      "writer.json",
    ),
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  const reset = await page.request.patch(
    `/api/users/${browserActors.writer.userId}/notifications`,
    {
      data: {
        ids: [browserRecords.notificationId],
        is_read: false,
      },
    },
  );
  expect(reset.status()).toBe(200);
  return { context, page };
}

test("floating menus and notification popovers are fully opaque", async ({
  browser,
}) => {
  const { context, page } = await writerPage(browser);
  try {
    await page.goto("/notifications", { waitUntil: "networkidle" });
    await page
      .getByRole("combobox", { name: "Filter notifications by type" })
      .click();
    const listbox = page.getByRole("listbox");
    await expect(listbox).toBeVisible();
    const menuBackground = await listbox.evaluate(
      (element) => getComputedStyle(element).backgroundImage,
    );
    expect(menuBackground).not.toContain("0.6");

    await page.keyboard.press("Escape");
    await page.getByRole("button", { name: "1 unread notifications" }).click();
    const popover = page.getByText("E2E notification interaction").locator(
      "xpath=ancestor::*[@data-radix-popper-content-wrapper]/*[1]",
    );
    const popoverBackground = await popover.evaluate(
      (element) => getComputedStyle(element).backgroundColor,
    );
    expect(popoverBackground).not.toMatch(/rgba\([^)]*,\s*0\.[0-9]+\)/);
    expect(popoverBackground).not.toBe("rgba(0, 0, 0, 0)");
  } finally {
    await context.close();
  }
});

test("notification row action is visible with keyboard focus", async ({
  browser,
}) => {
  const { context, page } = await writerPage(browser);
  try {
    await page.goto("/notifications", { waitUntil: "networkidle" });
    const action = page.getByRole("button", { name: "Mark read" });
    await action.focus();
    await expect(action).toBeFocused();
    await expect(action).toHaveCSS("opacity", "1");
  } finally {
    await context.close();
  }
});

test("failed notification mutations keep state and show a retryable error", async ({
  browser,
}) => {
  const { context, page } = await writerPage(browser);
  try {
    await page.route(
      `**/api/users/${browserActors.writer.userId}/notifications`,
      async (route) => {
        if (route.request().method() === "PATCH") {
          await route.fulfill({
            status: 500,
            contentType: "application/json",
            body: JSON.stringify({ error: "Audit mutation failure" }),
          });
        } else {
          await route.continue();
        }
      },
    );
    await page.goto("/notifications", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: "Mark all read" }).click();
    await expect(page.getByText("Audit mutation failure")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Mark all read" }),
    ).toBeEnabled();
  } finally {
    await context.close();
  }
});
