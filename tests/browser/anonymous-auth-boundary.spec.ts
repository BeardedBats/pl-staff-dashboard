import { expect, test } from "@playwright/test";

test("an anonymous visitor reaches the complete sign-in surface", async ({
  page,
}) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/login$/);
  await expect(
    page.getByRole("heading", { name: "Staff Dashboard" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "WordPress username or email" }),
  ).toBeVisible();
  await expect(page.getByLabel("Application password")).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign in" })).toBeEnabled();
});

test("an anonymous visitor cannot render an authenticated page", async ({
  page,
}) => {
  await page.goto("/home");

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
});

test("the current-user API fails closed with a stable public error", async ({
  request,
}) => {
  const response = await request.get("/api/auth/me");

  expect(response.status()).toBe(401);
  await expect(response.json()).resolves.toEqual({
    error: "Not authenticated",
    code: "NOT_AUTHENTICATED",
  });
});
