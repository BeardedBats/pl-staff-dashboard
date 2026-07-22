import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: {
    RAPTIVE_CLIENT_ID: "raptive-client-id",
    RAPTIVE_CLIENT_SECRET: "raptive-client-secret",
  },
}));

import {
  getRaptiveDateBounds,
  getRaptivePagePerformance,
  listRaptiveSites,
  resetRaptiveTokenCacheForTests,
} from "./raptive-api";

const fetchMock = vi.fn<typeof fetch>();
vi.stubGlobal("fetch", fetchMock);

function jsonResponse(body: unknown, status = 200, headers?: HeadersInit) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function token(value = "access-token") {
  return jsonResponse({
    access_token: value,
    token_type: "Bearer",
    expires_in: 300,
  });
}

function pageRow(url: string, earnings: number) {
  return {
    pageUrl: url,
    siteUrl: "https://pitcherlist.com",
    impressions: 100,
    earnings,
    pageviews: 50,
    pageviewsPercent: 10,
    rpm: 4,
    viewability: { value: 70 },
    cpm: { value: 2, score: 50 },
    impressionsPerPageview: { value: 2, score: 50 },
    modifiedDate: null,
    author: null,
  };
}

function pageResponse(
  data: ReturnType<typeof pageRow>[],
  number: number,
  next: number | null,
  recordCount: number,
) {
  return jsonResponse({
    data,
    meta: {
      recordCount,
      page: {
        number,
        size: 250,
        prev: number === 1 ? null : number - 1,
        next,
        first: 1,
        last: next ?? number,
      },
    },
  });
}

describe("Raptive Creator API client", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    resetRaptiveTokenCacheForTests();
  });

  it("uses client_secret_basic server-side and returns only validated sites", async () => {
    fetchMock
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              id: "site-1",
              name: "Pitcher List",
              status: "Active",
              service: "AdThrive",
              jw: true,
              url: "https://pitcherlist.com",
            },
          ],
          meta: {
            totalItemCount: 1,
            page: {
              number: 1,
              size: 0,
              prev: null,
              next: null,
              first: 1,
              last: 1,
            },
          },
        }),
      );

    await expect(listRaptiveSites()).resolves.toHaveLength(1);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://publisher-api.raptive.com/oauth/token",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: `Basic ${Buffer.from("raptive-client-id:raptive-client-secret").toString("base64")}`,
        }),
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://publisher-api.raptive.com/creator-api/v1/sites?page%5Bsize%5D=0",
      expect.objectContaining({
        headers: { Authorization: "Bearer access-token" },
      }),
    );
  });

  it("follows documented pagination and reconciles recordCount", async () => {
    fetchMock
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(
        pageResponse(
          [pageRow("https://pitcherlist.com/a/", 1)],
          1,
          2,
          2,
        ),
      )
      .mockResolvedValueOnce(
        pageResponse(
          [pageRow("https://pitcherlist.com/b/", 2)],
          2,
          null,
          2,
        ),
      );

    const rows = await getRaptivePagePerformance("site-1", "2026-07-20");

    expect(rows.map((row) => row.earnings)).toEqual([1, 2]);
    expect(String(fetchMock.mock.calls[1][0])).toContain("page%5Bnumber%5D=1");
    expect(String(fetchMock.mock.calls[2][0])).toContain("page%5Bnumber%5D=2");
  });

  it("validates the consumed date-bound fields without requiring unused dashboard ranges", async () => {
    fetchMock
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(
        jsonResponse({
          data: {
            analyticsDateBounds: {
              range: { startDate: "2026-07-01", endDate: "2026-07-20" },
            },
            earningsDateBounds: {
              range: { startDate: "2026-07-01", endDate: "2026-07-19" },
            },
          },
        }),
      );

    await expect(getRaptiveDateBounds("site-1")).resolves.toMatchObject({
      analyticsDateBounds: {
        range: { startDate: "2026-07-01", endDate: "2026-07-20" },
      },
      earningsDateBounds: {
        range: { startDate: "2026-07-01", endDate: "2026-07-19" },
      },
    });
  });

  it("accepts page rows with every persisted field while ignoring absent presentation metadata", async () => {
    fetchMock
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              pageUrl: "https://pitcherlist.com/minimal/",
              earnings: 3.25,
              pageviews: 75,
              rpm: 5.5,
            },
          ],
          meta: {
            recordCount: 1,
            page: { number: 1, next: null },
          },
        }),
      );

    await expect(
      getRaptivePagePerformance("site-1", "2026-07-20"),
    ).resolves.toEqual([
      {
        pageUrl: "https://pitcherlist.com/minimal/",
        earnings: 3.25,
        pageviews: 75,
        rpm: 5.5,
      },
    ]);
  });

  it("normalizes documented numeric fields returned as strings and an omitted final-page next value", async () => {
    fetchMock
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              pageUrl: "https://pitcherlist.com/coerced/",
              earnings: "3.25",
              pageviews: "75",
              rpm: "5.5",
            },
          ],
          meta: {
            recordCount: "1",
            page: { number: "1" },
          },
        }),
      );

    await expect(
      getRaptivePagePerformance("site-1", "2026-07-20"),
    ).resolves.toEqual([
      {
        pageUrl: "https://pitcherlist.com/coerced/",
        earnings: 3.25,
        pageviews: 75,
        rpm: 5.5,
      },
    ]);
  });

  it("accepts the hostless page paths returned by the live API", async () => {
    fetchMock
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              pageUrl: "/fantasy-baseball/article/",
              earnings: "3.25",
              pageviews: "75",
              rpm: "5.5",
            },
          ],
          meta: {
            recordCount: "1",
            page: { number: "1" },
          },
        }),
      );

    await expect(
      getRaptivePagePerformance("site-1", "2026-07-20"),
    ).resolves.toEqual([
      {
        pageUrl: "/fantasy-baseball/article/",
        earnings: 3.25,
        pageviews: 75,
        rpm: 5.5,
      },
    ]);
  });

  it("returns an endpoint-specific code when a persisted page metric is invalid", async () => {
    fetchMock
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(
        jsonResponse({
          data: [
            {
              pageUrl: "https://pitcherlist.com/invalid/",
              earnings: "not-a-number",
              pageviews: 75,
              rpm: 5.5,
            },
          ],
          meta: {
            recordCount: 1,
            page: { number: 1, next: null },
          },
        }),
      );

    await expect(
      getRaptivePagePerformance("site-1", "2026-07-20"),
    ).rejects.toMatchObject({
      code: "raptive_page_performance_schema_invalid",
    });
  });

  it("refreshes one rejected bearer token without exposing credentials", async () => {
    fetchMock
      .mockResolvedValueOnce(token("expired-token"))
      .mockResolvedValueOnce(jsonResponse({ internalCode: "token_expired" }, 401))
      .mockResolvedValueOnce(token("fresh-token"))
      .mockResolvedValueOnce(
        jsonResponse({
          data: [],
          meta: {
            totalItemCount: 0,
            page: {
              number: 1,
              size: 0,
              prev: null,
              next: null,
              first: 1,
              last: 1,
            },
          },
        }),
      );

    await expect(listRaptiveSites()).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[3][1]).toEqual(
      expect.objectContaining({
        headers: { Authorization: "Bearer fresh-token" },
      }),
    );
  });

  it("honors Retry-After and then succeeds after a rate limit", async () => {
    fetchMock
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(
        jsonResponse({ internalCode: "rate_limited" }, 429, {
          "Retry-After": "0",
        }),
      )
      .mockResolvedValueOnce(
        pageResponse(
          [pageRow("https://pitcherlist.com/a/", 1)],
          1,
          null,
          1,
        ),
      );

    await expect(
      getRaptivePagePerformance("site-1", "2026-07-20"),
    ).resolves.toHaveLength(1);
  });

  it("rejects incomplete pagination instead of silently committing it", async () => {
    fetchMock
      .mockResolvedValueOnce(token())
      .mockResolvedValueOnce(
        pageResponse(
          [pageRow("https://pitcherlist.com/a/", 1)],
          1,
          null,
          2,
        ),
      );

    await expect(
      getRaptivePagePerformance("site-1", "2026-07-20"),
    ).rejects.toMatchObject({
      code: "raptive_page_count_mismatch",
    });
  });
});
