import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  isOperations: vi.fn(),
  discoverSites: vi.fn(),
  configureSite: vi.fn(),
  getStatus: vi.fn(),
  setEnabled: vi.fn(),
  syncConnection: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: mocks.getCurrentUser,
  isOperations: mocks.isOperations,
}));
vi.mock("@/lib/analytics/raptive-live", () => ({
  discoverRaptiveSites: mocks.discoverSites,
  configureRaptiveSite: mocks.configureSite,
  getRaptiveLiveStatus: mocks.getStatus,
  setRaptiveSiteEnabled: mocks.setEnabled,
  syncRaptiveConnection: mocks.syncConnection,
}));

import { POST as updateConnection } from "./connection/route";
import { GET as listSites } from "./sites/route";
import { POST as syncSite } from "./sync/route";

const connection = {
  wpSite: "pl" as const,
  raptiveSiteId: "site-1",
  siteName: "Pitcher List",
  siteUrl: "https://pitcherlist.com",
  enabled: false,
};

function jsonRequest(path: string, body: unknown): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("Raptive live API authorization and resource boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "operator-1" });
    mocks.isOperations.mockReturnValue(true);
    mocks.discoverSites.mockResolvedValue([
      {
        id: "site-1",
        name: "Pitcher List",
        status: "Active",
        service: "AdThrive",
        jw: true,
        url: "https://pitcherlist.com",
      },
    ]);
    mocks.getStatus.mockResolvedValue({
      configured: true,
      databaseReady: true,
      connections: [connection],
    });
    mocks.setEnabled.mockResolvedValue(true);
    mocks.syncConnection.mockResolvedValue({
      ok: true,
      wpSite: "pl",
      date: "2026-07-20",
    });
  });

  it("denies anonymous and non-Operations users before any provider call", async () => {
    mocks.getCurrentUser.mockResolvedValue(null);
    expect((await listSites()).status).toBe(401);
    expect(
      (
        await updateConnection(
          jsonRequest("/api/raptive/live/connection", {
            action: "disable",
            wpSite: "pl",
          }),
        )
      ).status,
    ).toBe(401);

    mocks.getCurrentUser.mockResolvedValue({ id: "eic-1" });
    mocks.isOperations.mockReturnValue(false);
    expect((await listSites()).status).toBe(403);
    expect(
      (
        await syncSite(
          jsonRequest("/api/raptive/live/sync", { wpSite: "pl" }),
        )
      ).status,
    ).toBe(403);
    expect(mocks.discoverSites).not.toHaveBeenCalled();
    expect(mocks.setEnabled).not.toHaveBeenCalled();
    expect(mocks.syncConnection).not.toHaveBeenCalled();
  });

  it("validates site/date inputs before changing state", async () => {
    const invalidConnection = await updateConnection(
      jsonRequest("/api/raptive/live/connection", {
        action: "enable",
        wpSite: "other",
      }),
    );
    const invalidDate = await syncSite(
      jsonRequest("/api/raptive/live/sync", {
        wpSite: "pl",
        date: "07/20/2026",
      }),
    );

    expect(invalidConnection.status).toBe(400);
    expect(invalidDate.status).toBe(400);
    expect(mocks.setEnabled).not.toHaveBeenCalled();
    expect(mocks.syncConnection).not.toHaveBeenCalled();
  });

  it("refuses to enable a stored site no longer visible to the credential", async () => {
    mocks.discoverSites.mockResolvedValue([]);

    const response = await updateConnection(
      jsonRequest("/api/raptive/live/connection", {
        action: "enable",
        wpSite: "pl",
      }),
    );

    expect(response.status).toBe(409);
    expect(mocks.setEnabled).not.toHaveBeenCalled();
  });

  it("syncs only the requested configured dashboard site", async () => {
    const response = await syncSite(
      jsonRequest("/api/raptive/live/sync", {
        wpSite: "pl",
        date: "2026-07-20",
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.syncConnection).toHaveBeenCalledWith(
      connection,
      "2026-07-20",
    );
  });
});
