import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser } from "@playwright/test";
import { browserRecords } from "../browser/global-setup";

async function actorPage(
  browser: Browser,
  actor: "admin" | "onboarding" | "writer" | "editor",
) {
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

test("managers get risk-first operations, useful presets, and confirmed bulk actions", async ({
  browser,
}) => {
  const { context, page } = await actorPage(browser, "admin");
  try {
    await page.goto("/home", { waitUntil: "networkidle" });
    await expect(
      page.getByRole("heading", { name: "Manager control center" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Weekly operations" }),
    ).toBeVisible();
    await expect(page.getByText("Published in 7 days")).toBeVisible();
    await expect(page.getByText("Decisions waiting")).toBeVisible();

    await page.goto("/content", { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /Views/ }).click();
    await page.getByRole("button", { name: /Needs a writer/ }).click();
    await expect(page.getByRole("combobox", { name: "Filter by content status" })).toHaveText(
      "Writer needed",
    );

    await page.getByRole("checkbox", { name: "Select all" }).click();
    const setPriority = page.getByRole("button", { name: "Set priority" });
    await expect(setPriority).toBeVisible();
    await setPriority.click();
    await expect(
      page.getByRole("heading", { name: "Set priority selected entries?" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(setPriority).toBeVisible();

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

test("writers and editors get focused handoffs, readiness, templates, and safe multi-claiming", async ({
  browser,
}) => {
  const writer = await actorPage(browser, "writer");
  try {
    await writer.page.goto("/my-tasks", { waitUntil: "networkidle" });
    await expect(writer.page.getByRole("heading", { name: "My Work" })).toBeVisible();
    await expect(writer.page.getByText("Revision requested by Editor Journey")).toBeVisible();
    await expect(
      writer.page.getByText("Clarify the conclusion and verify the final statistic."),
    ).toBeVisible();
    await writer.page.getByRole("link", { name: /E2E P4 polishing feedback/ }).click();
    await expect(
      writer.page.getByRole("heading", { name: "Publication readiness" }),
    ).toBeVisible();
    await writer.page.getByRole("tab", { name: "Audit" }).click();
    await expect(
      writer.page.getByText(
        "Sent to the writer for polishing — Clarify the conclusion and verify the final statistic.",
      ),
    ).toBeVisible();
  } finally {
    await writer.context.close();
  }

  const editor = await actorPage(browser, "editor");
  try {
    await editor.page.goto("/editing-queue", { waitUntil: "networkidle" });
    await editor.page.getByRole("button", { name: "Unclaimed" }).click();
    await editor.page
      .getByRole("checkbox", { name: "Select E2E P2.8 editor completion" })
      .click();
    const claimSelected = editor.page.getByRole("button", { name: "Claim selected" });
    await claimSelected.click();
    await expect(
      editor.page.getByRole("heading", { name: "Claim selected edits?" }),
    ).toBeVisible();
    await editor.page.getByRole("button", { name: "Cancel" }).click();
    await expect(claimSelected).toBeVisible();

    await editor.page.goto(`/content?entry=${browserRecords.editorEntryId}`, {
      waitUntil: "networkidle",
    });
    await expect(
      editor.page.getByRole("heading", { name: "Publication readiness" }),
    ).toBeVisible();
    await editor.page.getByRole("button", { name: "Send to polishing" }).click();
    await editor.page.getByRole("button", { name: "Fact check" }).click();
    await expect(editor.page.getByLabel("What needs fixing?")).toHaveValue(
      "Verify the facts, links, names, and statistics called out in the draft.",
    );

    const axe = await new AxeBuilder({ page: editor.page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    expect(
      axe.violations.map((violation) => ({
        id: violation.id,
        targets: violation.nodes.map((node) => node.target),
      })),
    ).toEqual([]);
  } finally {
    await editor.context.close();
  }
});
