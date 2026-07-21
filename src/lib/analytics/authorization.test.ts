import { describe, expect, it } from "vitest";
import type { AppRole, AppSite, CurrentUser } from "@/lib/auth/current-user";
import { authorizeAnalyticsFilters } from "./authorization";

function viewer(rows: Array<{ role: AppRole; site: AppSite }>): CurrentUser {
  return {
    id: "viewer",
    wp_user_id: 1,
    wp_site: "both",
    email: "viewer@example.test",
    display_name: "Viewer",
    avatar_url: null,
    bio: null,
    timezone: "UTC",
    theme: "dark",
    can_publish: false,
    onboarding_completed: true,
    roles: Array.from(new Set(rows.map((row) => row.role))),
    role_rows: rows,
    session_id: "session",
  };
}

const base = { dateFrom: "2026-07-01", dateTo: "2026-07-21" };

describe("analytics site authorization", () => {
  it("forces an unscoped query to the viewer's only authorized site", () => {
    const result = authorizeAnalyticsFilters(
      viewer([{ role: "eic", site: "pl" }]),
      base,
    );
    expect(result?.site).toBe("pl");
  });

  it("rejects an explicitly unauthorized site", () => {
    expect(
      authorizeAnalyticsFilters(
        viewer([{ role: "operations", site: "pl" }]),
        { ...base, site: "qb" },
      ),
    ).toBeNull();
  });

  it("keeps both-site queries unfiltered when both sites are covered", () => {
    const result = authorizeAnalyticsFilters(
      viewer([{ role: "operations", site: "both" }]),
      { ...base, site: "both" },
    );
    expect(result?.site).toBeUndefined();
  });
});
