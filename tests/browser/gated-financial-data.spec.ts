import path from "node:path";
import { expect, test, type Browser } from "@playwright/test";
import { browserActors, browserRecords } from "./global-setup";

type ActorName = keyof typeof browserActors;

function actorContext(browser: Browser, actor: ActorName, baseURL: string) {
  return browser.newContext({
    baseURL,
    storageState: path.join(
      process.cwd(),
      "test-results",
      "auth",
      `${actor}.json`,
    ),
  });
}

function analyticsQuery(pathname: string) {
  const date = new Date().toISOString().slice(0, 10);
  return `${pathname}?dateFrom=${date}&dateTo=${date}&site=pl`;
}

test("financial values reach an EIC but never enter non-financial role responses", async (
  { browser },
  testInfo,
) => {
  const baseURL = String(testInfo.project.use.baseURL);
  const eic = await actorContext(browser, "eic", baseURL);

  try {
    const response = await eic.request.get(analyticsQuery("/api/analytics/articles"));
    expect(response.status()).toBe(200);
    const body = (await response.json()) as {
      rows: Array<{ entry_id: string; earnings: number }>;
    };
    const sentinel = body.rows.find(
      (row) => row.entry_id === browserRecords.analyticsEntryId,
    );
    expect(sentinel?.earnings).toBeCloseTo(
      browserRecords.financialSentinel,
      4,
    );

    const page = await eic.newPage();
    const chartWarnings: string[] = [];
    page.on("console", (message) => {
      if (message.text().includes("width(-1) and height(-1)")) {
        chartWarnings.push(message.text());
      }
    });
    await page.goto("/home", { waitUntil: "networkidle" });
    await expect(page.getByText("Last 7 days", { exact: true })).toBeVisible();
    await expect(
      page.getByText(`$${browserRecords.financialSentinel.toFixed(2)}`, {
        exact: true,
      }),
    ).toBeVisible();
    expect(chartWarnings).toEqual([]);
    await page.screenshot({
      path: testInfo.outputPath("eic-financial-authorized.png"),
      fullPage: true,
    });
  } finally {
    await eic.close();
  }

  const nonFinancialActors = [
    "writer",
    "manager",
    "editor",
    "graphics",
    "admin",
  ] as const;
  for (const actor of nonFinancialActors) {
    const context = await actorContext(browser, actor, baseURL);
    try {
      const response = await context.request.get(
        analyticsQuery("/api/analytics/articles"),
      );
      expect(response.status(), actor).toBe(403);
      expect(await response.text(), actor).not.toContain(
        String(browserRecords.financialSentinel),
      );
    } finally {
      await context.close();
    }
  }
});

test("admin HTML and every financial read endpoint withhold the sentinel", async (
  { browser },
  testInfo,
) => {
  const context = await actorContext(
    browser,
    "admin",
    String(testInfo.project.use.baseURL),
  );

  try {
    const home = await context.request.get("/home");
    expect(home.status()).toBe(200);
    const homeHtml = await home.text();
    expect(homeHtml).not.toContain(String(browserRecords.financialSentinel));
    expect(homeHtml).not.toContain(
      browserRecords.financialSentinel.toFixed(2),
    );

    const filteredEndpoints = [
      "/api/analytics/overview",
      "/api/analytics/articles",
      "/api/analytics/writers",
      "/api/analytics/publish-to-peak",
      "/api/analytics/articles/export",
      "/api/analytics/writers/export",
    ];
    const endpoints = [
      ...filteredEndpoints.map(analyticsQuery),
      "/api/raptive/uploads",
    ];

    for (const endpoint of endpoints) {
      const response = await context.request.get(endpoint);
      expect(response.status(), endpoint).toBe(403);
      const text = await response.text();
      expect(text, endpoint).not.toContain(
        String(browserRecords.financialSentinel),
      );
      expect(text, endpoint).not.toMatch(/"(?:earnings|page_rpm|rpm)"/);
    }

    const page = await context.newPage();
    await page.goto(
      `/content?entry=${browserRecords.analyticsEntryId}`,
      { waitUntil: "networkidle" },
    );
    await expect(page.getByRole("tab", { name: "Analytics" })).toHaveCount(0);
    expect(await page.content()).not.toContain(
      String(browserRecords.financialSentinel),
    );
    await page.screenshot({
      path: testInfo.outputPath("admin-financial-withheld.png"),
      fullPage: true,
    });
  } finally {
    await context.close();
  }
});
