import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ rpc: vi.fn() }));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({ rpc: mocks.rpc }),
}));

import { recordOperationalAlert } from "./alerts";

describe("operational alert persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  it("persists bounded safe metadata and returns the correlated error id", async () => {
    mocks.rpc.mockResolvedValue({ error: null });

    const errorId = await recordOperationalAlert({
      fingerprint: "cron:wp-sync:task",
      severity: "critical",
      component: "cron",
      eventName: "cron.task_failed",
      errorCode: "upstream_error",
      summary: "WordPress sync failed.",
      remediation: "Verify WordPress connectivity and retry the job.",
      metadata: {
        attempt: 2,
        authorization: "Bearer secret-token",
        upstream: "operator@example.test",
      },
    });

    expect(errorId).toMatch(/^[0-9a-f-]{36}$/);
    expect(mocks.rpc).toHaveBeenCalledWith(
      "record_operational_alert",
      expect.objectContaining({
        p_fingerprint: "cron:wp-sync:task",
        p_error_code: "upstream_error",
        p_metadata: {
          attempt: 2,
          upstream: "[redacted]",
          error_id: errorId,
        },
      }),
    );
  });

  it("keeps the product path alive when alert persistence fails", async () => {
    mocks.rpc.mockRejectedValue(new Error("database unavailable"));

    await expect(
      recordOperationalAlert({
        fingerprint: "notifications:delivery",
        severity: "warning",
        component: "notifications",
        eventName: "notifications.delivery_failed",
        summary: "A notification could not be delivered.",
        remediation: "Review database connectivity.",
      }),
    ).resolves.toMatch(/^[0-9a-f-]{36}$/);

    expect(console.warn).toHaveBeenCalledOnce();
  });
});
