import path from "node:path";
import { expect, test, type Browser, type BrowserContext } from "@playwright/test";
import { browserActors, browserRecords } from "./global-setup";

type ActorName = keyof typeof browserActors;

async function actorContext(
  browser: Browser,
  actor: ActorName,
  baseURL: string,
): Promise<BrowserContext> {
  return browser.newContext({
    baseURL,
    storageState: path.join(process.cwd(), "test-results", "auth", `${actor}.json`),
  });
}

test.describe("database-backed role journeys", () => {
  test.skip(
    Boolean(process.env.PLAYWRIGHT_BASE_URL),
    "role fixtures are deliberately local-only",
  );

  test("writer submits assigned work and cannot enter the editing queue", async ({
    browser,
  }, testInfo) => {
    const context = await actorContext(
      browser,
      "writer",
      String(testInfo.project.use.baseURL),
    );
    const page = await context.newPage();
    try {
      await page.goto(`/content?entry=${browserRecords.writerEntryId}`);
      await expect(page.getByText("E2E P2.8 writer submission").first()).toBeVisible();

      const submitted = page.waitForResponse(
        (response) =>
          response.url().endsWith(
            `/api/entries/${browserRecords.writerEntryId}/content-status`,
          ) && response.request().method() === "PATCH",
      );
      await page.getByRole("button", { name: /^Submit$/ }).click();
      expect((await submitted).status()).toBe(200);
      await expect(page.getByText("Submitted", { exact: true }).first()).toBeVisible();

      await page.goto("/editing-queue");
      await expect(page).toHaveURL(/\/home$/);
      await expect(
        page.getByRole("link", { name: "Editing Queue" }),
      ).toHaveCount(0);
    } finally {
      await context.close();
    }
  });

  test("manager approves a pending writer claim from the blocking inbox", async ({
    browser,
  }, testInfo) => {
    const context = await actorContext(
      browser,
      "manager",
      String(testInfo.project.use.baseURL),
    );
    const page = await context.newPage();
    try {
      await page.goto("/home");
      await expect(page.getByText("E2E P2.8 manager approval")).toBeVisible();
      await expect(page.getByText("Claim requests (1)")).toBeVisible();

      const approved = page.waitForResponse(
        (response) =>
          response.url().endsWith(`/api/claims/${browserRecords.managerClaimId}`) &&
          response.request().method() === "PATCH",
      );
      await page.getByRole("button", { name: "Approve" }).click();
      expect((await approved).status()).toBe(200);
      await expect(page.getByText("Claim requests (0)")).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test("editor claims a ready article and completes the editor track", async ({
    browser,
  }, testInfo) => {
    const context = await actorContext(
      browser,
      "editor",
      String(testInfo.project.use.baseURL),
    );
    const page = await context.newPage();
    try {
      await page.goto(`/content?entry=${browserRecords.editorEntryId}`);
      await expect(page.getByText("E2E P2.8 editor completion").first()).toBeVisible();

      const claimed = page.waitForResponse(
        (response) =>
          response.url().endsWith(
            `/api/entries/${browserRecords.editorEntryId}/editor-status`,
          ) && response.request().method() === "PATCH",
      );
      await page.getByRole("button", { name: "Claim edit" }).click();
      expect((await claimed).status()).toBe(200);

      const edited = page.waitForResponse(
        (response) =>
          response.url().endsWith(
            `/api/entries/${browserRecords.editorEntryId}/editor-status`,
          ) && response.request().method() === "PATCH",
      );
      await page.getByRole("button", { name: "Mark edited" }).click();
      expect((await edited).status()).toBe(200);
      await expect(page.getByText("Edited", { exact: true }).first()).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test("graphics staff claims an open request without external upload side effects", async ({
    browser,
  }, testInfo) => {
    const context = await actorContext(
      browser,
      "graphics",
      String(testInfo.project.use.baseURL),
    );
    const page = await context.newPage();
    try {
      await page.goto("/graphics");
      const card = page
        .getByText("E2E P2.8 featured image")
        .locator("xpath=ancestor::div[.//button[normalize-space()='Claim']][1]");
      await expect(card).toBeVisible();

      const claimed = page.waitForResponse(
        (response) =>
          response.url().endsWith(
            `/api/graphic-requests/${browserRecords.graphicRequestId}`,
          ) && response.request().method() === "PATCH",
      );
      await card.getByRole("button", { name: "Claim" }).click();
      expect((await claimed).status()).toBe(200);
      await expect(page.getByText("Claimed by").first()).toBeVisible();
      await expect(page.getByText(browserActors.graphics.displayName).first()).toBeVisible();
    } finally {
      await context.close();
    }
  });

  test("administrator reaches all administration tabs but not revenue analytics", async ({
    browser,
  }, testInfo) => {
    const context = await actorContext(
      browser,
      "admin",
      String(testInfo.project.use.baseURL),
    );
    const page = await context.newPage();
    try {
      await page.goto("/settings?tab=users");
      await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
      for (const tab of [
        "Profile",
        "Notifications",
        "Users",
        "Teams",
        "Templates",
        "Season",
        "Sync",
        "Checklists",
      ]) {
        await expect(page.getByRole("tab", { name: tab })).toBeVisible();
      }
      await expect(page.getByRole("tab", { name: "Analytics" })).toHaveCount(0);
      await expect(page.getByText(browserActors.writer.displayName).first()).toBeVisible();

      await page.getByRole("tab", { name: "Sync" }).click();
      await expect(
        page.getByText("System health", { exact: false }).first(),
      ).toBeVisible();
      await expect(page.getByText("Scheduled jobs", { exact: true })).toBeVisible();
      const healthRefresh = page.waitForResponse(
        (response) =>
          response.url().endsWith("/api/settings/operational-health") &&
          response.request().method() === "GET",
      );
      await page.getByRole("button", { name: "Refresh", exact: true }).click();
      expect((await healthRefresh).status()).toBe(200);
    } finally {
      await context.close();
    }
  });
});
