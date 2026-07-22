import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  parse: vi.fn(),
  match: vi.fn(),
  commit: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: mocks.getCurrentUser,
  isOperations: () => true,
}));
vi.mock("@/lib/analytics/raptive", () => ({
  parseRaptiveWorkbook: mocks.parse,
  matchRaptiveRowsToEntries: mocks.match,
  commitRaptiveRows: mocks.commit,
}));

import { MAX_RAPTIVE_UPLOAD_BYTES, POST } from "./route";

function uploadRequest(file: File, mode = "preview") {
  const form = new FormData();
  form.set("file", file);
  form.set("mode", mode);
  return new Request("http://localhost/api/raptive/upload", {
    method: "POST",
    body: form,
  });
}

describe("Raptive upload API boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "operator-1" });
  });

  it("rejects an oversized workbook before parsing", async () => {
    const file = new File(
      [new Uint8Array(MAX_RAPTIVE_UPLOAD_BYTES + 1)],
      "large.xlsx",
    );

    const response = await POST(uploadRequest(file));

    expect(response.status).toBe(413);
    expect(mocks.parse).not.toHaveBeenCalled();
  });

  it("rejects unsupported modes and legacy XLS before parsing", async () => {
    const invalidMode = await POST(
      uploadRequest(new File(["bytes"], "revenue.xlsx"), "replace-all"),
    );
    expect(invalidMode.status).toBe(400);

    const legacy = await POST(
      uploadRequest(new File(["bytes"], "revenue.xls")),
    );
    expect(legacy.status).toBe(400);
    expect(mocks.parse).not.toHaveBeenCalled();
  });

  it("previews rejected rows but refuses to commit them", async () => {
    mocks.parse.mockReturnValue({
      ok: true,
      rows: [
        {
          date: "2026-07-01",
          page_url: "/valid/",
          earnings: 1,
          rpm: 1,
          page_rpm: 1,
          sessions: 1,
          pageviews: 1,
        },
      ],
      dateRange: { start: "2026-07-01", end: "2026-07-01" },
      dataSheetCount: 1,
      duplicateCount: 0,
      rejectedCount: 1,
      sampleRejected: [
        { sheet: "Revenue", row: 3, reason: "Invalid numeric value" },
      ],
    });
    mocks.match.mockResolvedValue({
      matched: [],
      matchedCount: 0,
      unmatchedCount: 1,
      sampleUnmatched: ["/valid/"],
    });
    const file = new File(["workbook"], "revenue.xlsx");

    const preview = await POST(uploadRequest(file));
    expect(preview.status).toBe(200);
    await expect(preview.json()).resolves.toMatchObject({
      preview: { rejectedCount: 1 },
    });

    const commit = await POST(uploadRequest(file, "commit"));
    expect(commit.status).toBe(409);
    expect(mocks.commit).not.toHaveBeenCalled();
  });
});
