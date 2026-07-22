import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { browserActors } from "../browser/global-setup";

const wcagTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

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

async function actorPage(
  browser: Browser,
  actor: keyof typeof routeSets,
  viewport = { width: 1440, height: 900 },
) {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    storageState: path.join(process.cwd(), "test-results", "auth", `${actor}.json`),
    viewport,
  });
  return { context, page: await context.newPage() };
}

async function expectNoAxeViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
  const summary = results.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact,
    targets: violation.nodes.map((node) => node.target),
  }));
  expect(summary, `${label}: ${JSON.stringify(summary, null, 2)}`).toEqual([]);
}

async function expectVisibleFocus(locator: Locator) {
  await expect(locator).toBeFocused();
  const indicator = await locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      outlineStyle: style.outlineStyle,
      outlineWidth: style.outlineWidth,
      boxShadow: style.boxShadow,
    };
  });
  expect(
    indicator.outlineStyle !== "none" && indicator.outlineWidth !== "0px" ||
      indicator.boxShadow !== "none",
    `focused element has no visible indicator: ${JSON.stringify(indicator)}`,
  ).toBe(true);
}

test("every authenticated route passes the automated WCAG A/AA baseline", async ({
  browser,
}) => {
  test.setTimeout(180_000);

  for (const [actor, routes] of Object.entries(routeSets) as Array<[
    keyof typeof routeSets,
    readonly string[],
  ]>) {
    const { context, page } = await actorPage(browser, actor);
    try {
      for (const route of routes) {
        await page.goto(route, { waitUntil: "networkidle" });
        await expect(page.locator("h1").first(), `${route}: page heading`).toBeVisible();
        await expectNoAxeViolations(page, `${actor}${route}`);
      }
    } finally {
      await context.close();
    }
  }
});

test("mobile navigation traps focus, closes with Escape, and restores the trigger", async ({
  browser,
}) => {
  const { context, page } = await actorPage(browser, "admin", {
    width: 390,
    height: 844,
  });
  try {
    await page.goto("/home", { waitUntil: "networkidle" });
    const trigger = page.getByRole("button", { name: "Open menu" });
    await trigger.focus();
    await page.keyboard.press("Enter");

    const drawer = page.getByRole("dialog");
    await expect(drawer).toBeVisible();
    await expectNoAxeViolations(page, "open mobile navigation");

    for (let index = 0; index < 14; index += 1) {
      await page.keyboard.press("Tab");
      expect(
        await drawer.evaluate((element) => element.contains(document.activeElement)),
        `focus escaped the mobile drawer after ${index + 1} tabs`,
      ).toBe(true);
    }

    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expectVisibleFocus(trigger);
  } finally {
    await context.close();
  }
});

test("settings tabs support arrow-key navigation with visible focus", async ({ browser }) => {
  const { context, page } = await actorPage(browser, "admin");
  try {
    await page.goto("/settings?tab=users", { waitUntil: "networkidle" });
    const users = page.getByRole("tab", { name: "Users" });
    const teams = page.getByRole("tab", { name: "Teams" });
    const templates = page.getByRole("tab", { name: "Templates" });

    await users.focus();
    await expectVisibleFocus(users);
    await page.keyboard.press("ArrowRight");
    await expectVisibleFocus(teams);
    await expect(teams).toHaveAttribute("data-state", "active");
    await page.keyboard.press("ArrowRight");
    await expectVisibleFocus(templates);
    await expect(templates).toHaveAttribute("data-state", "active");
  } finally {
    await context.close();
  }
});

test("dialog and user menu support keyboard entry, Escape, and focus return", async ({
  browser,
}) => {
  const { context, page } = await actorPage(browser, "admin");
  try {
    await page.goto("/settings?tab=templates", { waitUntil: "networkidle" });
    const newTemplate = page.getByRole("button", { name: "New template" }).first();
    await newTemplate.focus();
    await page.keyboard.press("Enter");

    const dialog = page.getByRole("dialog", { name: "New recurring template" });
    await expect(dialog).toBeVisible();
    await expectNoAxeViolations(page, "new template dialog");
    for (let index = 0; index < 18; index += 1) {
      await page.keyboard.press("Tab");
      expect(
        await dialog.evaluate((element) => element.contains(document.activeElement)),
        `focus escaped the template dialog after ${index + 1} tabs`,
      ).toBe(true);
    }
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expectVisibleFocus(newTemplate);

    const userMenu = page.getByRole("button", { name: "User menu" });
    await userMenu.focus();
    await page.keyboard.press("Enter");
    const menu = page.getByRole("menu");
    await expect(menu).toBeVisible();
    await expectNoAxeViolations(page, "open user menu");
    const profileItem = page.getByRole("menuitem", { name: "Profile & settings" });
    const logoutItem = page.getByRole("menuitem", { name: "Sign out" });
    await expectVisibleFocus(profileItem);
    await page.keyboard.press("ArrowDown");
    await expectVisibleFocus(logoutItem);
    await page.keyboard.press("ArrowUp");
    await expectVisibleFocus(profileItem);
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expectVisibleFocus(userMenu);
  } finally {
    await context.close();
  }
});
