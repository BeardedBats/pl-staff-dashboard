import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  notificationUpsert: vi.fn(),
  notificationSingle: vi.fn(),
  notificationLte: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  getSupabaseAdmin: () => ({
    from: (table: string) => {
      if (table === "users") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: "user-1",
                  timezone: "UTC",
                  notification_delivery_mode: "immediate",
                  notification_digest_time: "09:00:00",
                  notification_quiet_start: null,
                  notification_quiet_end: null,
                },
              }),
            }),
          }),
        };
      }
      if (table === "user_roles") {
        return {
          select: () => ({
            eq: vi.fn().mockResolvedValue({ data: [{ role: "writer" }] }),
          }),
        };
      }
      if (table === "notification_preferences") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { in_app_enabled: true },
                }),
              }),
            }),
          }),
        };
      }
      if (table === "notifications") {
        const query = {
          eq: vi.fn(),
          lte: vi.fn(),
          order: vi.fn(),
          range: vi.fn(),
          then: (resolve: (value: { data: never[]; count: number; error: null }) => void) =>
            resolve({ data: [], count: 0, error: null }),
        };
        query.eq.mockReturnValue(query);
        query.lte.mockImplementation((column: string, value: string) => {
          mocks.notificationLte(column, value);
          return query;
        });
        query.order.mockReturnValue(query);
        query.range.mockReturnValue(query);
        return {
          select: () => query,
          upsert: (payload: unknown) => {
            mocks.notificationUpsert(payload);
            return {
              select: () => ({ single: mocks.notificationSingle }),
            };
          },
        };
      }
      throw new Error(`Unexpected table ${table}`);
    },
  }),
}));

import { dispatchNotification, listNotificationsForUser } from "./data";

const input = {
  userId: "user-1",
  entryId: null,
  type: "mention" as const,
  title: "Mentioned",
  body: "A teammate mentioned you.",
};

describe("in-app notification delivery", () => {
  beforeEach(() => vi.clearAllMocks());

  it("retries with one stable id and records the successful attempt", async () => {
    mocks.notificationSingle
      .mockResolvedValueOnce({ data: null, error: { code: "temporary" } })
      .mockResolvedValueOnce({ data: null, error: { code: "temporary" } })
      .mockResolvedValueOnce({ data: { id: "notification-1" }, error: null });

    await expect(dispatchNotification(input)).resolves.toEqual({
      ok: true,
      deduplicated: false,
    });
    expect(mocks.notificationUpsert).toHaveBeenCalledTimes(3);
    const payloads = mocks.notificationUpsert.mock.calls.map(([payload]) => payload as {
      id: string;
      delivery_attempts: number;
    });
    expect(new Set(payloads.map((payload) => payload.id)).size).toBe(1);
    expect(payloads.map((payload) => payload.delivery_attempts)).toEqual([1, 2, 3]);
  });

  it("reports failure after the bounded third attempt", async () => {
    mocks.notificationSingle.mockResolvedValue({
      data: null,
      error: { code: "unavailable" },
    });

    await expect(dispatchNotification(input)).resolves.toEqual({ ok: false });
    expect(mocks.notificationUpsert).toHaveBeenCalledTimes(3);
  });

  it("withholds future batches from both rows and the unread count", async () => {
    await expect(listNotificationsForUser("user-1")).resolves.toEqual({
      rows: [],
      unreadCount: 0,
    });
    expect(mocks.notificationLte).toHaveBeenCalledTimes(2);
    expect(mocks.notificationLte.mock.calls.every(([column]) => column === "available_at")).toBe(true);
  });
});
