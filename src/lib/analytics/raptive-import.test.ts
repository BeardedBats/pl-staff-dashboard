import { beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), from: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ rpc: mocks.rpc, from: mocks.from }),
}));

import { commitRaptiveRows, parseRaptiveWorkbook } from "./raptive";

function workbookBuffer(sheets: Record<string, unknown[][]>): Buffer {
  const workbook = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.aoa_to_sheet(rows),
      name,
    );
  }
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

const headers = [
  "Date",
  "Page URL",
  "Earnings",
  "RPM",
  "Page RPM",
  "Sessions",
  "Pageviews",
];

describe("Raptive workbook parsing", () => {
  it("finds every data sheet after metadata rows and collapses exact duplicates", () => {
    const result = parseRaptiveWorkbook(
      workbookBuffer({
        "Read Me": [["Raptive export"], ["Generated for testing"]],
        "PL Revenue": [
          ["Pitcher List revenue detail"],
          headers,
          [new Date("2026-07-01T00:00:00.000Z"), "https://pitcherlist.com/a/", 10.25, 2, 3, 4, 5],
          ["7/2/2026", "/b/", "$20.50", "4", "5", "6", "7"],
        ],
        "QB Revenue": [
          ["Day", "Permalink", "Revenue", "Session RPM", "Pageview RPM", "Sessions", "Views"],
          ["2026-07-01", "https://pitcherlist.com/a/?utm=duplicate", 10.25, 2, 3, 4, 5],
          ["2026-07-03", "https://football.pitcherlist.com/c/", 30.75, 6, 7, 8, 9],
        ],
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toHaveLength(3);
    expect(result.dataSheetCount).toBe(2);
    expect(result.duplicateCount).toBe(1);
    expect(result.rejectedCount).toBe(0);
    expect(result.dateRange).toEqual({ start: "2026-07-01", end: "2026-07-03" });
    expect(result.rows[1]).toMatchObject({
      date: "2026-07-02",
      earnings: 20.5,
      sessions: 6,
      pageviews: 7,
    });
  });

  it("reports malformed dates, numbers, and counts without importing them", () => {
    const result = parseRaptiveWorkbook(
      workbookBuffer({
        Revenue: [
          headers,
          ["2026-07-01", "/valid/", 1, 1, 1, 1, 1],
          ["2026-02-30", "/bad-date/", 1, 1, 1, 1, 1],
          ["2026-07-02", "/bad-number/", "not money", 1, 1, 1, 1],
          ["2026-07-03", "/bad-count/", 1, 1, 1, -1, 1],
        ],
      }),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.rows).toHaveLength(1);
    expect(result.rejectedCount).toBe(3);
    expect(result.sampleRejected).toEqual([
      { sheet: "Revenue", row: 3, reason: "Missing or invalid Date or Page URL" },
      { sheet: "Revenue", row: 4, reason: "Invalid numeric value" },
      {
        sheet: "Revenue",
        row: 5,
        reason: "Sessions and pageviews must be nonnegative integers",
      },
    ]);
  });

  it("refuses conflicting duplicates instead of choosing a silent winner", () => {
    const result = parseRaptiveWorkbook(
      workbookBuffer({
        Revenue: [
          headers,
          ["2026-07-01", "https://pitcherlist.com/a/", 1, 1, 1, 1, 1],
          ["2026-07-01", "/a/?source=other", 2, 1, 1, 1, 1],
        ],
      }),
    );

    expect(result).toEqual({
      ok: false,
      error: "Conflicting duplicate rows found for the same date and URL",
    });
  });

  it(
    "parses a representative 20,000-row workbook without truncation",
    () => {
      const rows: unknown[][] = [headers];
      for (let index = 0; index < 20_000; index += 1) {
        rows.push([
          "2026-07-01",
          `/large-fixture/${index}/`,
          index / 100,
          1,
          1,
          index,
          index + 1,
        ]);
      }

      const result = parseRaptiveWorkbook(
        workbookBuffer({ Revenue: rows }),
      );

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.rows).toHaveLength(20_000);
      expect(result.rejectedCount).toBe(0);
    },
    15_000,
  );

  it("rejects corrupt and non-data workbooks safely", () => {
    expect(parseRaptiveWorkbook(Buffer.from("not an xlsx"))).toEqual({
      ok: false,
      error: "Failed to read workbook. Upload a valid XLSX file.",
    });
    expect(
      parseRaptiveWorkbook(workbookBuffer({ Notes: [["Nothing to import"]] })),
    ).toEqual({
      ok: false,
      error: "No sheet contains Date, Page URL, and Earnings columns",
    });
  });
});

describe("Raptive import commit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends one atomic replacement RPC instead of delete-plus-chunks", async () => {
    mocks.rpc.mockResolvedValue({ data: 1, error: null });
    const row = {
      date: "2026-07-01",
      page_url: "/a/",
      earnings: 1,
      rpm: 2,
      page_rpm: 3,
      sessions: 4,
      pageviews: 5,
      entry_id: null,
    };

    await expect(
      commitRaptiveRows(
        [row],
        { start: "2026-07-01", end: "2026-07-01" },
        "fixture.xlsx",
        "operator-1",
      ),
    ).resolves.toEqual({ ok: true, inserted: 1 });

    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.rpc).toHaveBeenCalledWith("commit_raptive_import", {
      p_rows: [row],
      p_date_range_start: "2026-07-01",
      p_date_range_end: "2026-07-01",
      p_file_name: "fixture.xlsx",
      p_uploaded_by: "operator-1",
    });
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("returns one safe failure when the atomic RPC is interrupted", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "detail" } });

    await expect(
      commitRaptiveRows(
        [
          {
            date: "2026-07-01",
            page_url: "/a/",
            earnings: 1,
            rpm: 2,
            page_rpm: 3,
            sessions: 4,
            pageviews: 5,
            entry_id: null,
          },
        ],
        { start: "2026-07-01", end: "2026-07-01" },
        "fixture.xlsx",
        "operator-1",
      ),
    ).resolves.toEqual({ ok: false, error: "Failed to commit Raptive import" });
  });
});
