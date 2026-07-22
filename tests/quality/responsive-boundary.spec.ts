import path from "node:path";
import { expect, test, type Browser, type Page } from "@playwright/test";
import { browserActors } from "../browser/global-setup";

const viewports = [
  { name: "mobile", width: 390, height: 844, padding: "16px" },
  { name: "tablet", width: 768, height: 1024, padding: "20px" },
  { name: "desktop", width: 1440, height: 900, padding: "24px" },
] as const;

const routeSets = {
  admin: [
    "/home",
    "/content",
    "/calendar",
    "/my-tasks",
    "/editing-queue",
    "/graphics",
    "/archive",
    "/staff",
    `/staff/${browserActors.writer.userId}`,
    "/notifications",
    "/settings?tab=users",
    "/settings?tab=teams",
    "/settings?tab=templates",
    "/settings?tab=season",
    "/settings?tab=sync",
    "/settings?tab=checklists",
  ],
  eic: ["/analytics", "/settings?tab=analytics"],
} as const;

async function appOverflow(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector("main");
    const scrolling = document.scrollingElement;
    return {
      documentClientWidth: scrolling?.clientWidth ?? 0,
      documentScrollWidth: scrolling?.scrollWidth ?? 0,
      mainClientWidth: main?.clientWidth ?? 0,
      mainScrollWidth: main?.scrollWidth ?? 0,
    };
  });
}

async function assertNoPageOverflow(page: Page, label: string) {
  await expect(page.locator("body")).not.toContainText("Application error");
  const overflow = await appOverflow(page);
  expect(overflow.documentScrollWidth, `${label}: document overflow`).toBeLessThanOrEqual(
    overflow.documentClientWidth + 1,
  );
  expect(overflow.mainScrollWidth, `${label}: main overflow`).toBeLessThanOrEqual(
    overflow.mainClientWidth + 1,
  );
}

async function assertReadableText(page: Page, label: string) {
  const violations = await page.evaluate(() =>
    Array.from(document.body.querySelectorAll("*"))
      .filter((node): node is HTMLElement => node instanceof HTMLElement)
      .filter((element) => {
        if (element.closest("[data-plpd-compact-label]")) return false;
        const style = getComputedStyle(element);
        if (
          style.display === "none" ||
          style.visibility === "hidden" ||
          Number(style.opacity) === 0 ||
          element.getClientRects().length === 0
        ) {
          return false;
        }
        return Array.from(element.childNodes).some(
          (node) => node.nodeType === Node.TEXT_NODE && Boolean(node.textContent?.trim()),
        );
      })
      .flatMap((element) => {
        const style = getComputedStyle(element);
        const fontSize = Number.parseFloat(style.fontSize);
        const hiddenByEllipsis =
          style.textOverflow === "ellipsis" ||
          (style.webkitLineClamp !== "none" && style.webkitLineClamp !== "");
        return fontSize < 14 || hiddenByEllipsis
          ? [
              {
                tag: element.tagName.toLowerCase(),
                text: element.textContent?.trim().slice(0, 80),
                fontSize,
                textOverflow: style.textOverflow,
                lineClamp: style.webkitLineClamp,
              },
            ]
          : [];
      })
      .slice(0, 20),
  );

  expect(violations, `${label}: readable text contract`).toEqual([]);
}

async function authenticatedPage(
  browser: Browser,
  actor: keyof typeof routeSets,
  viewport: (typeof viewports)[number],
) {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    storageState: path.join(
      process.cwd(),
      "test-results",
      "auth",
      `${actor}.json`,
    ),
    viewport: { width: viewport.width, height: viewport.height },
  });
  return { context, page: await context.newPage() };
}

test("authenticated shell switches from drawer navigation to persistent desktop navigation", async ({
  browser,
}, testInfo) => {
  test.setTimeout(90_000);

  for (const viewport of viewports) {
    const { context, page } = await authenticatedPage(browser, "admin", viewport);
    try {
      await page.goto("/home", { waitUntil: "networkidle" });
      const menu = page.getByRole("button", { name: "Open menu" });
      const sidebar = page.locator('[data-tour="sidebar"]');
      const content = page.locator("main > div");

      if (viewport.name === "desktop") {
        await expect(sidebar).toBeVisible();
        await expect(menu).toBeHidden();
      } else {
        await expect(sidebar).toBeHidden();
        await expect(menu).toBeVisible();
        await menu.click();
        await expect(page.getByRole("navigation", { name: "Application" })).toBeVisible();
        await page.keyboard.press("Escape");
      }

      await expect(content).toHaveCSS("padding-left", viewport.padding);
      await assertNoPageOverflow(page, `shell/${viewport.name}`);
      await page.screenshot({
        path: testInfo.outputPath(`responsive-shell-${viewport.name}.png`),
        fullPage: true,
      });
    } finally {
      await context.close();
    }
  }
});

test("every authenticated route contains itself at mobile, tablet, and desktop widths", async ({
  browser,
}) => {
  test.setTimeout(180_000);

  for (const viewport of viewports) {
    for (const [actor, routes] of Object.entries(routeSets) as Array<[
      keyof typeof routeSets,
      readonly string[],
    ]>) {
      const { context, page } = await authenticatedPage(browser, actor, viewport);
      try {
        for (const route of routes) {
          await page.goto(route, { waitUntil: "networkidle" });
          await expect(page.locator("h1").first(), `${route}: page heading`).toBeVisible();
          await assertNoPageOverflow(page, `${actor}/${viewport.name}${route}`);
          await assertReadableText(page, `${actor}/${viewport.name}${route}`);
        }
      } finally {
        await context.close();
      }
    }
  }
});
