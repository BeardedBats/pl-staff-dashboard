import { beforeEach, describe, expect, it, vi } from "vitest";

const rpc = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ rpc }),
}));

import { executeCronJob } from "./execution";

const job = { name: "test-job", intervalSeconds: 3600 };

describe("executeCronJob", () => {
  beforeEach(() => {
    rpc.mockReset();
    vi.useRealTimers();
  });

  it("returns a safe 503 when the execution-control RPC is unavailable", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "missing" } });
    const task = vi.fn();
    const response = await executeCronJob("vercel", job, task);
    expect(response.status).toBe(503);
    expect(task).not.toHaveBeenCalled();
  });

  it.each(["duplicate", "overlap", "exhausted"] as const)(
    "turns a %s claim into a successful no-op",
    async (claimStatus) => {
      rpc.mockResolvedValueOnce({
        data: [{ run_id: "run-1", claim_status: claimStatus, attempt: 2 }],
        error: null,
      });
      const task = vi.fn();
      const response = await executeCronJob("vercel", job, task);
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        ok: true,
        skipped: true,
        reason: claimStatus,
      });
      expect(task).not.toHaveBeenCalled();
    },
  );

  it("persists a successful response summary", async () => {
    rpc
      .mockResolvedValueOnce({
        data: [{ run_id: "run-1", claim_status: "claimed", attempt: 1 }],
        error: null,
      })
      .mockResolvedValueOnce({ data: true, error: null });
    const response = await executeCronJob("manual", job, async () =>
      Response.json({ ok: true, changed: 4 }),
    );
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenLastCalledWith("finish_cron_run", {
      p_run_id: "run-1",
      p_succeeded: true,
      p_summary: { ok: true, changed: 4 },
    });
  });

  it("records a returned failure for bounded retry", async () => {
    rpc
      .mockResolvedValueOnce({
        data: [{ run_id: "run-1", claim_status: "claimed", attempt: 1 }],
        error: null,
      })
      .mockResolvedValueOnce({ data: true, error: null });
    const response = await executeCronJob("vercel", job, async () =>
      Response.json({ error: "safe" }, { status: 502 }),
    );
    expect(response.status).toBe(502);
    expect(rpc).toHaveBeenLastCalledWith("finish_cron_run", {
      p_run_id: "run-1",
      p_succeeded: false,
      p_summary: { error: "safe" },
      p_error_code: "http_502",
    });
  });

  it("fails closed when a successful task outcome cannot be persisted", async () => {
    rpc
      .mockResolvedValueOnce({
        data: [{ run_id: "run-1", claim_status: "claimed", attempt: 1 }],
        error: null,
      })
      .mockResolvedValueOnce({ data: false, error: { message: "write failed" } });
    const response = await executeCronJob("vercel", job, async () =>
      Response.json({ ok: true }),
    );
    expect(response.status).toBe(503);
  });

  it("records an unhandled failure without exposing its exception", async () => {
    rpc
      .mockResolvedValueOnce({
        data: [{ run_id: "run-1", claim_status: "claimed", attempt: 1 }],
        error: null,
      })
      .mockResolvedValueOnce({ data: true, error: null });
    const response = await executeCronJob("vercel", job, async () => {
      throw new Error("secret detail");
    });
    expect(response.status).toBe(500);
    await expect(response.text()).resolves.not.toContain("secret detail");
    expect(rpc).toHaveBeenLastCalledWith("finish_cron_run", {
      p_run_id: "run-1",
      p_succeeded: false,
      p_summary: null,
      p_error_code: "unhandled_exception",
    });
  });
});
