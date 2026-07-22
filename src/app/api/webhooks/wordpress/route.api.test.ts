import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  secret: "test-wordpress-webhook-secret-with-32-bytes",
  begin: vi.fn(),
  finish: vi.fn(),
  findSystemUserId: vi.fn(),
  sync: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ env: { WP_WEBHOOK_SECRET: mocks.secret } }));
vi.mock("@/lib/wp-sync/events", () => ({
  beginWordPressSyncEvent: mocks.begin,
  finishWordPressSyncEvent: mocks.finish,
}));
vi.mock("@/lib/recurring-templates/generator", () => ({
  findSystemUserId: mocks.findSystemUserId,
}));
vi.mock("@/lib/wp-sync/posts", () => ({ syncWpPostsForSite: mocks.sync }));

import { POST } from "./route";

function request(body: string, signature?: string) {
  return new Request("http://localhost/api/webhooks/wordpress", {
    method: "POST",
    headers: signature ? { "x-pl-signature": signature } : {},
    body,
  });
}

function sign(body: string) {
  return `sha256=${createHmac("sha256", mocks.secret).update(body).digest("hex")}`;
}

describe("WordPress webhook API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.begin.mockResolvedValue({
      ok: true,
      eventId: "event-row",
      shouldProcess: true,
      attemptCount: 1,
    });
    mocks.finish.mockResolvedValue(true);
    mocks.findSystemUserId.mockResolvedValue("system-user");
    mocks.sync.mockResolvedValue({ site: "pl", errors: [], postsFetched: 1 });
  });

  it("rejects an unsigned request before touching persistence", async () => {
    const response = await POST(request("{}"));

    expect(response.status).toBe(401);
    expect(mocks.begin).not.toHaveBeenCalled();
  });

  it("deduplicates a completed delivery without another WordPress read", async () => {
    const body = JSON.stringify({ site: "pl", post_id: 42, event_id: "evt-42" });
    mocks.begin.mockResolvedValue({
      ok: true,
      eventId: "event-row",
      shouldProcess: false,
      attemptCount: 1,
    });

    const response = await POST(request(body, sign(body)));

    expect(response.status).toBe(200);
    expect(mocks.sync).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({ deduplicated: true });
  });

  it("records a successful authenticated reconciliation", async () => {
    const body = JSON.stringify({ site: "pl", post_id: 42, event_id: "evt-42" });

    const response = await POST(request(body, sign(body)));

    expect(response.status).toBe(200);
    expect(mocks.begin).toHaveBeenCalledWith({
      site: "pl",
      wpPostId: 42,
      eventKey: "evt-42",
      source: "webhook",
    });
    expect(mocks.sync).toHaveBeenCalledWith("pl", "system-user");
    expect(mocks.finish).toHaveBeenCalledWith("event-row", true, undefined);
  });

  it("returns retryable failure and retains a bounded attempt record", async () => {
    const body = JSON.stringify({ site: "pl", post_id: 42, event_id: "evt-42" });
    mocks.sync.mockResolvedValue({
      site: "pl",
      errors: [{ wpPostId: 42, message: "upstream unavailable" }],
    });

    const response = await POST(request(body, sign(body)));

    expect(response.status).toBe(502);
    expect(mocks.finish).toHaveBeenCalledWith(
      "event-row",
      false,
      "upstream unavailable",
    );
  });
});
