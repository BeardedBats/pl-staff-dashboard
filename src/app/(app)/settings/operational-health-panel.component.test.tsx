import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OperationalHealthSnapshot } from "@/lib/observability/health";
import { OperationalHealthPanel } from "./operational-health-panel";

const initialHealth: OperationalHealthSnapshot = {
  generatedAt: "2026-07-21T20:00:00.000Z",
  overall: "critical",
  cron: [
    {
      key: "wpSync",
      label: "WordPress post sync",
      level: "critical",
      detail: "Latest scheduled run failed (upstream_error).",
      lastRunAt: "2026-07-21T19:55:00.000Z",
      errorCode: "upstream_error",
      remediation: "Verify WordPress connectivity and retry the job.",
    },
  ],
  integrations: [
    {
      key: "wordpress-pl",
      label: "Pitcher List WordPress",
      level: "warning",
      detail: "The latest synchronization is stale.",
      lastSuccessAt: "2026-07-21T19:00:00.000Z",
      remediation: "Run Sync WordPress posts.",
    },
  ],
  imports: {
    level: "healthy",
    detail: "The latest Raptive import completed successfully.",
    latestRunAt: "2026-07-21T18:00:00.000Z",
    latestStatus: "succeeded",
    runningCount: 0,
    recentFailedCount: 0,
  },
  alerts: [
    {
      id: "alert-1",
      severity: "critical",
      component: "cron",
      summary: "WordPress sync failed.",
      remediation: "Verify WordPress connectivity and retry the job.",
      errorCode: "upstream_error",
      occurrenceCount: 2,
      firstSeenAt: "2026-07-21T19:50:00.000Z",
      lastSeenAt: "2026-07-21T19:55:00.000Z",
    },
  ],
  probeErrors: [],
};

describe("OperationalHealthPanel", () => {
  beforeEach(() => vi.unstubAllGlobals());

  it("renders actionable failures and refreshes to a recovered snapshot", async () => {
    const recovered: OperationalHealthSnapshot = {
      ...initialHealth,
      generatedAt: "2026-07-21T20:05:00.000Z",
      overall: "healthy",
      cron: initialHealth.cron.map((job) => ({
        ...job,
        level: "healthy",
        detail: "Latest scheduled run succeeded within its freshness window.",
      })),
      integrations: initialHealth.integrations.map((item) => ({
        ...item,
        level: "healthy",
        detail: "Synchronization is current.",
      })),
      alerts: [],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ health: recovered }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ),
    );
    const user = userEvent.setup();
    render(<OperationalHealthPanel initialHealth={initialHealth} />);

    expect(screen.getByText("WordPress sync failed.")).toBeInTheDocument();
    expect(
      screen.getAllByText("Verify WordPress connectivity and retry the job.")
        .length,
    ).toBeGreaterThan(0);

    await user.click(screen.getByRole("button", { name: "Refresh" }));

    expect(
      await screen.findByText("No active operational alerts."),
    ).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledWith("/api/settings/operational-health");
  });
});
