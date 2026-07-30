import path from "node:path";
import { expect, test } from "@playwright/test";
import { browserActors } from "./global-setup";

test.use({
  storageState: path.join(
    process.cwd(),
    "test-results",
    "auth",
    "writer.json",
  ),
});

test("writer marks all notifications read through UI and API", async ({
  page,
}) => {
  await page.goto("/notifications", { waitUntil: "networkidle" });
  const action = page.getByRole("button", { name: "Mark all read" });
  await expect(action).toBeVisible();

  const responsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith(
        `/api/users/${browserActors.writer.userId}/notifications`,
      ) && response.request().method() === "PATCH",
  );
  await action.click();
  expect((await responsePromise).status()).toBe(200);
  await expect(action).toBeHidden();

  const result = await page.request.get(
    `/api/users/${browserActors.writer.userId}/notifications?onlyUnread=true`,
  );
  expect(result.status()).toBe(200);
  expect(await result.json()).toMatchObject({ rows: [], unreadCount: 0 });
});
