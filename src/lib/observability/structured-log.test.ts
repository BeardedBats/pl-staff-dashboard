import { afterEach, describe, expect, it, vi } from "vitest";
import {
  emitStructuredLog,
  safeErrorCode,
  sanitizeLogAttributes,
} from "./structured-log";

afterEach(() => vi.restoreAllMocks());

describe("structured operational logging", () => {
  it("emits one filterable JSON object with a correlation-safe error id", () => {
    const output = vi.spyOn(console, "error").mockImplementation(() => {});
    const errorId = emitStructuredLog({
      level: "error",
      component: "cron",
      event: "cron.task_failed",
      errorCode: "HTTP 502",
      attributes: { job: "wp-sync", duration_ms: 1250 },
    });

    expect(errorId).toMatch(/^[0-9a-f-]{36}$/);
    const parsed = JSON.parse(String(output.mock.calls[0]?.[0]));
    expect(parsed).toMatchObject({
      level: "error",
      component: "cron",
      event: "cron.task_failed",
      error_code: "http_502",
      error_id: errorId,
      job: "wp-sync",
      duration_ms: 1250,
    });
  });

  it("drops dangerous keys and redacts secret-shaped or personal values", () => {
    expect(
      sanitizeLogAttributes({
        authorization: "Bearer do-not-log",
        access_token: "secret",
        contact: "writer@example.test",
        service_key: "sb_secret_do_not_log",
        job: "wp-sync",
      }),
    ).toEqual({
      contact: "[redacted]",
      service_key: "[redacted]",
      job: "wp-sync",
    });
  });

  it("never derives an error code from a raw exception message", () => {
    const error = Object.assign(new Error("password=do-not-log"), {
      code: "PGRST 116",
    });
    expect(safeErrorCode(error)).toBe("pgrst_116");
    expect(safeErrorCode(new Error("sb_secret_do_not_log"))).toBe("error");
  });
});
