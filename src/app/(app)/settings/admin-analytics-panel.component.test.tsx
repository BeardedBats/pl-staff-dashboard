import type { ComponentProps } from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

import { AdminAnalyticsPanel } from "./admin-analytics-panel";

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
  canConnectGa4: false,
  canManageRaptive: false,
};

describe("AdminAnalyticsPanel Raptive controls", () => {
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
