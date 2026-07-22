import { describe, expect, it } from "vitest";
import type { AppRole, AppSite, CurrentUser } from "@/lib/auth/current-user";
import type { StaffUserSummary } from "@/lib/users/queries";
import { sanitizeUserForViewer } from "./visibility";

function viewer(
  id: string,
  rows: Array<{ role: AppRole; site: AppSite }>,
): CurrentUser {
  return {
    id,
    wp_user_id: 1,
    wp_site: "both",
    email: `${id}@example.test`,
    display_name: id,
    avatar_url: null,
    bio: null,
    timezone: "UTC",
    theme: "dark",
    can_publish: false,
    onboarding_completed: true,
    roles: Array.from(new Set(rows.map((row) => row.role))),
    role_rows: rows,
    session_id: `session-${id}`,
  };
}

function target(id: string, site: AppSite): StaffUserSummary {
  return {
    id,
    wp_user_id: 2,
    wp_site: site,
    email: `${id}@private.test`,
    display_name: id,
    avatar_url: null,
    bio: "bio",
    twitter_handle: null,
    bluesky_handle: null,
    timezone: "America/New_York",
    theme: "light",
    can_publish: true,
    onboarding_completed: false,
    auto_approve_drafts: true,
    availability_status: "available",
    availability_note: "Open to one assignment",
    availability_until: null,
    last_wp_sync: null,
    created_at: "2026-07-21T00:00:00.000Z",
    roles: ["writer"],
    role_rows: [{ role: "writer", site }],
    teams: [],
    primary_team: null,
  };
}

describe("staff HTTP visibility", () => {
  it("removes private fields from another staff member", () => {
    const result = sanitizeUserForViewer(
      target("target", "pl"),
      viewer("outsider", [{ role: "writer", site: "pl" }]),
    );
    expect(result).not.toHaveProperty("email");
    expect(result).not.toHaveProperty("timezone");
    expect(result).not.toHaveProperty("can_publish");
  });

  it("shows private fields to self and a site-authorized admin only", () => {
    const plTarget = target("target", "pl");
    expect(
      sanitizeUserForViewer(plTarget, viewer("target", [])),
    ).toMatchObject({ email: "target@private.test" });
    expect(
      sanitizeUserForViewer(
        plTarget,
        viewer("pl-admin", [{ role: "admin", site: "pl" }]),
      ),
    ).toMatchObject({ email: "target@private.test" });
    expect(
      sanitizeUserForViewer(
        target("qb-target", "qb"),
        viewer("pl-admin", [{ role: "admin", site: "pl" }]),
      ),
    ).not.toHaveProperty("email");
  });
});
