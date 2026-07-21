import { writeFile } from "node:fs/promises";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
  type TestInfo,
} from "@playwright/test";
import budgets from "../../quality-budgets.json";
import { browserActors, browserRecords } from "../browser/global-setup";

type ActorName = keyof typeof browserActors;
type BudgetName = keyof typeof budgets.profiles;
type PerformanceBudget = (typeof budgets.profiles)[BudgetName];

type QualityMetrics = {
  fcpMs: number;
  lcpMs: number;
  cls: number;
  totalBlockingTimeMs: number;
  encodedBodyBytes: number;
  scriptEncodedBodyBytes: number;
  requests: number;
  domNodes: number;
};

type Scenario = {
  name: string;
  path: string;
  actor?: ActorName;
  viewport?: { width: number; height: number };
  theme?: "dark" | "light";
  ready: { role: "button" | "heading"; name: string | RegExp };
};

const wcagTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const accessibilityScenarios: Scenario[] = [
  {
    name: "anonymous login on mobile",
    path: "/login",
    viewport: { width: 390, height: 844 },
    ready: { role: "button", name: "Sign in" },
  },
  {
    name: "writer content detail",
    path: `/content?entry=${browserRecords.writerEntryId}`,
    actor: "writer",
    ready: { role: "heading", name: "Content" },
  },
  {
    name: "manager home",
    path: "/home",
    actor: "manager",
    ready: { role: "heading", name: /Welcome/ },
  },
  {
    name: "editor queue",
    path: "/editing-queue",
    actor: "editor",
    ready: { role: "heading", name: "Editing Queue" },
  },
  {
    name: "graphics board",
    path: "/graphics",
    actor: "graphics",
    ready: { role: "heading", name: "Graphic Requests" },
  },
  {
    name: "administrator user settings",
    path: "/settings?tab=users",
    actor: "admin",
    ready: { role: "heading", name: "Settings" },
  },
  {
    name: "anonymous login in light mode",
    path: "/login",
    viewport: { width: 390, height: 844 },
    theme: "light",
    ready: { role: "button", name: "Sign in" },
  },
  {
    name: "administrator settings in light mode",
    path: "/settings?tab=users",
    actor: "admin",
    theme: "light",
    ready: { role: "heading", name: "Settings" },
  },
];

const performanceScenarios: Array<Scenario & { budget: BudgetName }> = [
  { ...accessibilityScenarios[0], budget: "login-mobile" },
  { ...accessibilityScenarios[1], budget: "writer-content" },
  { ...accessibilityScenarios[5], budget: "admin-settings" },
];

async function scenarioContext(
  browser: Browser,
  scenario: Scenario,
  baseURL: string,
): Promise<BrowserContext> {
  const context = await browser.newContext({
    baseURL,
    viewport: scenario.viewport ?? { width: 1440, height: 900 },
    storageState: scenario.actor
      ? path.join(
          process.cwd(),
          "test-results",
          "auth",
          `${scenario.actor}.json`,
        )
      : undefined,
  });
  if (scenario.theme) {
    await context.addInitScript((theme) => {
      window.localStorage.setItem("theme", theme);
    }, scenario.theme);
  }
  return context;
}

async function waitUntilReady(page: Page, scenario: Scenario) {
  await page.goto(scenario.path, { waitUntil: "networkidle" });
  await expect(
    page.getByRole(scenario.ready.role, { name: scenario.ready.name }).first(),
  ).toBeVisible();
}

function violationSummary(
  violations: Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"],
) {
  return violations.map((violation) => ({
    rule: violation.id,
    impact: violation.impact,
    targets: violation.nodes.map((node) => node.target),
    help: violation.helpUrl,
  }));
}

async function attachJson(testInfo: TestInfo, name: string, value: unknown) {
  const outputPath = testInfo.outputPath(`${name}.json`);
  await writeFile(outputPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await testInfo.attach(name, {
    path: outputPath,
    contentType: "application/json",
  });
}

async function installPerformanceObservers(page: Page) {
  await page.addInitScript(() => {
    const state = {
      lcpMs: 0,
      cls: 0,
      longTaskDurations: [] as number[],
    };
    Object.defineProperty(window, "__qualityBaseline", {
      value: state,
      configurable: false,
    });

    new PerformanceObserver((list) => {
      const latest = list.getEntries().at(-1);
      if (latest) state.lcpMs = latest.startTime;
    }).observe({ type: "largest-contentful-paint", buffered: true });

    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const shift = entry as PerformanceEntry & {
          value: number;
          hadRecentInput: boolean;
        };
        if (!shift.hadRecentInput) state.cls += shift.value;
      }
    }).observe({ type: "layout-shift", buffered: true });

    new PerformanceObserver((list) => {
      state.longTaskDurations.push(
        ...list.getEntries().map((entry) => entry.duration),
      );
    }).observe({ type: "longtask", buffered: true });
  });
}

async function collectMetrics(page: Page): Promise<QualityMetrics> {
  await page.waitForTimeout(250);
  return page.evaluate(() => {
    const resources = performance.getEntriesByType(
      "resource",
    ) as PerformanceResourceTiming[];
    const navigation = performance.getEntriesByType(
      "navigation",
    )[0] as PerformanceNavigationTiming;
    const paints = performance.getEntriesByType("paint");
    const fcp = paints.find((entry) => entry.name === "first-contentful-paint");
    const state = (
      window as typeof window & {
        __qualityBaseline: {
          lcpMs: number;
          cls: number;
          longTaskDurations: number[];
        };
      }
    ).__qualityBaseline;

    return {
      fcpMs: Math.round(fcp?.startTime ?? 0),
      lcpMs: Math.round(state.lcpMs),
      cls: Number(state.cls.toFixed(4)),
      totalBlockingTimeMs: Math.round(
        state.longTaskDurations.reduce(
          (total, duration) => total + Math.max(0, duration - 50),
          0,
        ),
      ),
      encodedBodyBytes:
        navigation.encodedBodySize +
        resources.reduce((total, resource) => total + resource.encodedBodySize, 0),
      scriptEncodedBodyBytes: resources
        .filter((resource) => resource.initiatorType === "script")
        .reduce((total, resource) => total + resource.encodedBodySize, 0),
      requests: resources.length + 1,
      domNodes: document.querySelectorAll("*").length,
    };
  });
}

function enforceBudget(
  metrics: QualityMetrics,
  budget: PerformanceBudget,
  profile: string,
) {
  expect(metrics.fcpMs, `${profile} FCP must be observed`).toBeGreaterThan(0);
  expect(metrics.lcpMs, `${profile} LCP must be observed`).toBeGreaterThan(0);
  expect(metrics.fcpMs, `${profile} FCP`).toBeLessThanOrEqual(budget.maxFcpMs);
  expect(metrics.lcpMs, `${profile} LCP`).toBeLessThanOrEqual(budget.maxLcpMs);
  expect(metrics.cls, `${profile} CLS`).toBeLessThanOrEqual(budget.maxCls);
  expect(metrics.totalBlockingTimeMs, `${profile} total blocking time`).toBeLessThanOrEqual(
    budget.maxTotalBlockingTimeMs,
  );
  expect(metrics.encodedBodyBytes, `${profile} encoded bytes`).toBeLessThanOrEqual(
    budget.maxEncodedBodyBytes,
  );
  expect(
    metrics.scriptEncodedBodyBytes,
    `${profile} script encoded bytes`,
  ).toBeLessThanOrEqual(budget.maxScriptEncodedBodyBytes);
  expect(metrics.requests, `${profile} requests`).toBeLessThanOrEqual(
    budget.maxRequests,
  );
  expect(metrics.domNodes, `${profile} DOM nodes`).toBeLessThanOrEqual(
    budget.maxDomNodes,
  );
}

test.describe("automated WCAG A/AA baseline", () => {
  for (const scenario of accessibilityScenarios) {
    test(scenario.name, async ({ browser }, testInfo) => {
      const context = await scenarioContext(
        browser,
        scenario,
        String(testInfo.project.use.baseURL),
      );
      const page = await context.newPage();
      try {
        await waitUntilReady(page, scenario);
        const results = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
        const summary = violationSummary(results.violations);
        await attachJson(testInfo, "axe-results", {
          scenario: scenario.name,
          url: page.url(),
          tags: wcagTags,
          violations: summary,
          passes: results.passes.length,
          incomplete: results.incomplete.length,
        });
        expect(summary, JSON.stringify(summary, null, 2)).toEqual([]);
      } finally {
        await context.close();
      }
    });
  }

  test("login keyboard order retains visible focus", async ({ page }) => {
    await page.goto("/login", { waitUntil: "networkidle" });
    const username = page.getByRole("textbox", {
      name: "WordPress username or email",
    });
    const password = page.getByLabel("Application password");
    const submit = page.getByRole("button", { name: "Sign in" });

    await page.keyboard.press("Tab");
    await expect(username).toBeFocused();
    expect(
      await username.evaluate((element) => getComputedStyle(element).outlineStyle),
    ).not.toBe("none");
    await page.keyboard.press("Tab");
    await expect(password).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(submit).toBeFocused();
  });
});

test.describe("production-mode performance budgets", () => {
  for (const scenario of performanceScenarios) {
    test(scenario.name, async ({ browser }, testInfo) => {
      const context = await scenarioContext(
        browser,
        scenario,
        String(testInfo.project.use.baseURL),
      );
      const page = await context.newPage();
      try {
        await installPerformanceObservers(page);
        await waitUntilReady(page, scenario);
        const metrics = await collectMetrics(page);
        const evidence = {
          profile: scenario.budget,
          path: scenario.path,
          viewport: scenario.viewport ?? { width: 1440, height: 900 },
          metrics,
          budget: budgets.profiles[scenario.budget],
          budgetVersion: budgets.version,
        };
        console.log(`QUALITY_BASELINE ${JSON.stringify(evidence)}`);
        await attachJson(testInfo, "performance-metrics", evidence);
        enforceBudget(metrics, budgets.profiles[scenario.budget], scenario.budget);
      } finally {
        await context.close();
      }
    });
  }
});
