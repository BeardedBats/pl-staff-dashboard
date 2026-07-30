import type { ComponentProps } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

import { AdminAnalyticsPanel } from "./admin-analytics-panel";
import type { OperationalHealthSnapshot } from "@/lib/observability/health";

const health: OperationalHealthSnapshot = {
  generatedAt: "2026-07-29T12:00:00.000Z",
  overall: "healthy",
  cron: [],
  integrations: [],
  imports: {
    level: "healthy",
    detail: "The latest Raptive import completed successfully.",
    latestRunAt: "2026-07-22T12:00:00.000Z",
    latestStatus: "succeeded",
    runningCount: 0,
    recentFailedCount: 0,
  },
  notifications: {
    level: "healthy",
    detail: "0 notifications are scheduled.",
    scheduledCount: 0,
    activeFailureCount: 0,
    remediation: "No action required.",
  },
  alerts: [],
  probeErrors: [],
};

const baseProps: ComponentProps<typeof AdminAnalyticsPanel> = {
  initialGa4Status: {
    configured: false,
    connected: false,
    propertyId: null,
    lastSyncedAt: null,
  },
  initialUploads: [],
  initialImportRuns: [],
  initialRaptiveStatus: {
    configured: true,
    databaseReady: true,
    connections: [],
  },
  initialOperationalHealth: null,
  canConnectGa4: false,
  canManageRaptive: false,
};

describe("AdminAnalyticsPanel Raptive controls", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shows Connect GA4 immediately after a successful disconnect", async () => {
    const user = userEvent.setup();
    vi.stubGlobal("confirm", vi.fn(() => true));
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(JSON.stringify({ ok: true }), { status: 200 }),
        )
        .mockResolvedValueOnce(
          new Response(
            JSON.stringify({
              status: {
                configured: true,
                connected: false,
                propertyId: "property-id",
                lastSyncedAt: null,
              },
            }),
            { status: 200 },
          ),
        ),
    );

    render(
      <AdminAnalyticsPanel
        {...baseProps}
        canConnectGa4
        initialGa4Status={{
          configured: true,
          connected: true,
          propertyId: "property-id",
          lastSyncedAt: null,
        }}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Disconnect" }));

    expect(await screen.findByRole("button", { name: "Connect GA4" })).toBeEnabled();
    expect(screen.getByText("GA4 disconnected.")).toBeVisible();
  });

  it("shows global read-only system health when supplied for Operations", () => {
    render(
      <AdminAnalyticsPanel
        {...baseProps}
        initialOperationalHealth={health}
      />,
    );

    expect(screen.getByText("System health")).toBeVisible();
    expect(screen.getByText("No active operational alerts.")).toBeVisible();
  });

  it("keeps live connection controls read-only for EIC viewers", () => {
    render(
      <AdminAnalyticsPanel
        {...baseProps}
        initialRaptiveStatus={{
          configured: true,
          databaseReady: true,
          connections: [
            {
              wpSite: "pl",
              raptiveSiteId: "site-1",
              siteName: "Pitcher List",
              siteUrl: "https://pitcherlist.com",
              enabled: true,
              configuredAt: "2026-07-22T00:00:00.000Z",
              updatedAt: "2026-07-22T00:00:00.000Z",
              lastAttemptedDate: "2026-07-20",
              lastSuccessfulDate: "2026-07-20",
              lastSyncedAt: "2026-07-22T00:00:00.000Z",
              lastRowCount: 20,
              lastEarnings: 31,
              lastErrorCode: null,
            },
          ],
        }}
      />,
    );

    expect(screen.getByText("Only Operations can change or run the connection.")).toBeVisible();
    expect(screen.getByText("Pitcher List: Pitcher List")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Disable" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Sync latest day" })).not.toBeInTheDocument();
  });

  it("explains migration readiness and exposes controls only when safe", () => {
    const { unmount } = render(
      <AdminAnalyticsPanel
        {...baseProps}
        canManageRaptive
        initialRaptiveStatus={{
          configured: true,
          databaseReady: false,
          connections: [],
        }}
      />,
    );

    expect(screen.getByText("Migration pending")).toBeVisible();
    expect(screen.queryByRole("button", { name: "Find eligible sites" })).not.toBeInTheDocument();

    unmount();
    render(
      <AdminAnalyticsPanel
        {...baseProps}
        canManageRaptive
      />,
    );
    expect(screen.getByRole("button", { name: "Find eligible sites" })).toBeEnabled();
  });
});
