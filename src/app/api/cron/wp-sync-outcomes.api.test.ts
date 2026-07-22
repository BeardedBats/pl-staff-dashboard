import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authorizeCronRequest: vi.fn(),
  executeCronJob: vi.fn(),
  findSystemUserId: vi.fn(),
  syncWpPostsForBothSites: vi.fn(),
  syncWpProfiles: vi.fn(),
  syncWpCategoriesForBothSites: vi.fn(),
}));

vi.mock("@/lib/cron/authorization", () => ({
  authorizeCronRequest: mocks.authorizeCronRequest,
}));
vi.mock("@/lib/cron/execution", () => ({
  executeCronJob: mocks.executeCronJob,
}));
vi.mock("@/lib/recurring-templates/generator", () => ({
  findSystemUserId: mocks.findSystemUserId,
}));
vi.mock("@/lib/wp-sync/posts", () => ({
  syncWpPostsForBothSites: mocks.syncWpPostsForBothSites,
}));
vi.mock("@/lib/wp-sync/profiles", () => ({
  syncWpProfiles: mocks.syncWpProfiles,
}));
vi.mock("@/lib/wp-sync/categories", () => ({
  syncWpCategoriesForBothSites: mocks.syncWpCategoriesForBothSites,
}));

import { GET as syncPosts } from "./wp-sync/route";
import { GET as syncProfiles } from "./profile-sync/route";
import { GET as syncCategories } from "./category-sync/route";

const request = new Request("http://localhost/api/cron/test");

describe("WordPress cron retry outcomes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authorizeCronRequest.mockResolvedValue({
      ok: true,
      source: "vercel",
    });
    mocks.executeCronJob.mockImplementation(
      async (_source, _job, task: () => Promise<Response>) => task(),
    );
    mocks.findSystemUserId.mockResolvedValue("system-user");
  });

  it("returns a retryable failure when any post site is incomplete", async () => {
    mocks.syncWpPostsForBothSites.mockResolvedValue([
      { site: "pl", errors: [{ wpPostId: 42, message: "failed" }] },
    ]);

    const response = await syncPosts(request);

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toMatchObject({
      code: "UPSTREAM_ERROR",
      error: "WordPress post sync incomplete",
    });
  });

  it("returns a retryable failure when profile reconciliation has errors", async () => {
    mocks.syncWpProfiles.mockResolvedValue({
      usersChecked: 1,
      usersUpdated: 0,
      unchanged: 0,
      notFound: 0,
      errors: [{ userId: "user-1", message: "failed" }],
    });

    const response = await syncProfiles(request);

    expect(response.status).toBe(502);
  });

  it("returns a retryable failure instead of accepting a partial category snapshot", async () => {
    mocks.syncWpCategoriesForBothSites.mockResolvedValue([
      {
        site: "pl",
        fetched: 0,
        created: 0,
        updated: 0,
        deactivated: 0,
        errors: ["WP returned 503"],
      },
    ]);

    const response = await syncCategories(request);

    expect(response.status).toBe(502);
  });

  it("keeps a complete post reconciliation successful", async () => {
    const reports = [{ site: "pl", errors: [] }];
    mocks.syncWpPostsForBothSites.mockResolvedValue(reports);

    const response = await syncPosts(request);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, reports });
  });
});
