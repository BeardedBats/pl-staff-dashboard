import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  parse: vi.fn(),
  match: vi.fn(),
  commit: vi.fn(),
  begin: vi.fn(),
  fail: vi.fn(),
  recordAlert: vi.fn(),
  resolveAlert: vi.fn(),
}));

vi.mock("@/lib/auth/current-user", () => ({
  getCurrentUser: mocks.getCurrentUser,
  isOperations: () => true,
}));
vi.mock("@/lib/analytics/raptive", () => ({
  parseRaptiveWorkbook: mocks.parse,
  matchRaptiveRowsToEntries: mocks.match,
  commitRaptiveRows: mocks.commit,
  beginRaptiveImportRun: mocks.begin,
  failRaptiveImportRun: mocks.fail,
}));
vi.mock("@/lib/observability/alerts", () => ({
  recordOperationalAlert: mocks.recordAlert,
  resolveOperationalAlert: mocks.resolveAlert,
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
    mocks.begin.mockResolvedValue("run-1");
    mocks.fail.mockResolvedValue(true);
    mocks.recordAlert.mockResolvedValue("error-id");
    mocks.resolveAlert.mockResolvedValue(undefined);
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

  it("tracks a successful commit from its durable run through atomic completion", async () => {
    const parsedRow = {
      date: "2026-07-01",
      page_url: "/valid/",
      earnings: 1,
      rpm: 1,
      page_rpm: 1,
      sessions: 1,
      pageviews: 1,
    };
    mocks.parse.mockReturnValue({
      ok: true,
      rows: [parsedRow],
      dateRange: { start: "2026-07-01", end: "2026-07-01" },
      dataSheetCount: 2,
      duplicateCount: 3,
      rejectedCount: 0,
      sampleRejected: [],
    });
    mocks.match.mockResolvedValue({
      matched: [{ ...parsedRow, entry_id: "entry-1" }],
      matchedCount: 1,
      unmatchedCount: 0,
      sampleUnmatched: [],
    });
    mocks.commit.mockResolvedValue({ ok: true, inserted: 1 });

    const response = await POST(
      uploadRequest(new File(["workbook"], "folder-safe.xlsx"), "commit"),
    );

    expect(response.status).toBe(200);
    expect(mocks.begin).toHaveBeenCalledWith("folder-safe.xlsx", "operator-1");
    expect(mocks.commit).toHaveBeenCalledWith(
      "run-1",
      [{ ...parsedRow, entry_id: "entry-1" }],
      { start: "2026-07-01", end: "2026-07-01" },
      "folder-safe.xlsx",
      "operator-1",
      {
        matchedCount: 1,
        unmatchedCount: 0,
        dataSheetCount: 2,
        duplicateCount: 3,
      },
    );
    expect(mocks.resolveAlert).toHaveBeenCalledTimes(3);
  });

  it("records matching failure with a safe error id and visible failed run", async () => {
    mocks.parse.mockReturnValue({
      ok: true,
      rows: [{ date: "2026-07-01", page_url: "/valid/" }],
      dateRange: { start: "2026-07-01", end: "2026-07-01" },
      dataSheetCount: 1,
      duplicateCount: 0,
      rejectedCount: 0,
      sampleRejected: [],
    });
    mocks.match.mockRejectedValue(new Error("database password do-not-log"));

    const response = await POST(
      uploadRequest(new File(["workbook"], "revenue.xlsx"), "commit"),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ errorId: "error-id" });
    expect(mocks.fail).toHaveBeenCalledWith(
      "run-1",
      "error",
      "matching",
    );
    expect(mocks.recordAlert).toHaveBeenCalledOnce();
    expect(mocks.commit).not.toHaveBeenCalled();
  });
});
