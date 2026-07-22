import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser } from "@playwright/test";

async function actorPage(browser: Browser, actor: "admin" | "onboarding") {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    storageState: path.join(process.cwd(), "test-results", "auth", `${actor}.json`),
    viewport: { width: 1440, height: 900 },
  });
  return { context, page: await context.newPage() };
}

test("Today prioritizes one action and global search covers every work source", async ({
  browser,
}) => {
  const { context, page } = await actorPage(browser, "admin");
  try {
    await page.goto("/home", { waitUntil: "networkidle" });
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /approval.*blocking the team/i })).toBeVisible();
    await expect(page.getByRole("link", { name: "Review manager inbox" })).toBeVisible();

    await page.keyboard.press("Control+k");
    const search = page.getByRole("textbox", {
      name: "Search staff, content, assignments, graphics, and schedules",
    });
    await expect(search).toBeFocused();

    await search.fill("Writer Journey");
    await expect(page.getByRole("heading", { name: "Staff", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Assignments" })).toBeVisible();

    await search.fill("E2E P2.8");
    await expect(page.getByRole("heading", { name: "Content" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Graphics" })).toBeVisible();

    await search.fill("E2E P3.6");
    await expect(page.getByRole("heading", { name: "Schedule" })).toBeVisible();

    const axe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      axe.violations.map((violation) => ({
        id: violation.id,
        targets: violation.nodes.map((node) => node.target),
      })),
    ).toEqual([]);
  } finally {
    await context.close();
  }
});

test("first-time writers receive and can finish a role-specific setup checklist", async ({
  browser,
}) => {
  const { context, page } = await actorPage(browser, "onboarding");
  try {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        "pl-dashboard-tour:28000000-0000-0000-0000-000000000007",
        "done",
      );
    });
    await page.goto("/home", { waitUntil: "networkidle" });

    await expect(
      page.getByRole("heading", { name: "Finish setting up your dashboard" }),
    ).toBeVisible();
    await expect(page.getByRole("link", { name: /Confirm your profile and timezone/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Open your personal worklist/ })).toBeVisible();
    const finish = page.getByRole("button", { name: "Finish setup" });
    await expect(finish).toBeDisabled();

    await page.evaluate(() => {
      window.localStorage.setItem(
        "pl-dashboard-setup:28000000-0000-0000-0000-000000000007",
        JSON.stringify(["profile", "writer-work"]),
      );
    });
    await page.reload({ waitUntil: "networkidle" });
    await expect(finish).toBeEnabled();
    await finish.click();
    await expect(page.getByText("Setup complete", { exact: true })).toBeVisible();
  } finally {
    await context.close();
  }
});
