import { describe, expect, it } from "vitest";
import {
  canClaimGraphicResource,
  canClaimWriterResource,
  canCreateGraphicResource,
  canEditGraphicResource,
  canEditEntryResource,
  canFlagGraphicResource,
  canUnflagGraphicResource,
  canUploadOrSubmitGraphicResource,
  canViewGraphicResource,
  canViewEntryResource,
  isAdminPlusForScope,
  type EntryAuthorizationContext,
} from "./authorization";
import type { AppRole, AppSite, CurrentUser } from "./current-user";

function user(
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

function entry(site: "pl" | "qb"): EntryAuthorizationContext {
  return {
    id: `entry-${site}`,
    site,
    createdBy: "creator",
    isDrafted: false,
    authorIds: new Set(["author"]),
    editorIds: new Set(["editor"]),
  };
}

describe("site-aware resource authorization", () => {
  it("does not expand a PL-only role into QB authority", () => {
    const plAdmin = user("admin", [{ role: "admin", site: "pl" }]);
    expect(canEditEntryResource(plAdmin, entry("pl"))).toBe(true);
    expect(canEditEntryResource(plAdmin, entry("qb"))).toBe(false);
    expect(canClaimGraphicResource(plAdmin, entry("qb"))).toBe(false);
  });

  it("allows a both-site role on either concrete site", () => {
    const graphics = user("artist", [{ role: "graphics", site: "both" }]);
    expect(canClaimGraphicResource(graphics, entry("pl"))).toBe(true);
    expect(canClaimGraphicResource(graphics, entry("qb"))).toBe(true);
  });

  it("treats separate PL and QB grants as full both-site coverage", () => {
    const splitAdmin = user("admin", [
      { role: "admin", site: "pl" },
      { role: "eic", site: "qb" },
    ]);
    expect(isAdminPlusForScope(splitAdmin, "both")).toBe(true);
    expect(
      isAdminPlusForScope(
        user("pl-only", [{ role: "admin", site: "pl" }]),
        "both",
      ),
    ).toBe(false);
  });

  it("limits entry and graphics participation to the actual resource", () => {
    const author = user("author", [{ role: "writer", site: "pl" }]);
    const outsider = user("outsider", [{ role: "writer", site: "pl" }]);
    expect(canEditEntryResource(author, entry("pl"))).toBe(true);
    expect(canCreateGraphicResource(author, entry("pl"))).toBe(true);
    expect(canViewGraphicResource(author, entry("pl"))).toBe(true);
    expect(canEditEntryResource(outsider, entry("pl"))).toBe(false);
    expect(canCreateGraphicResource(outsider, entry("pl"))).toBe(false);
  });

  it("applies action-specific graphics walls", () => {
    const plEntry = entry("pl");
    const author = user("author", [{ role: "writer", site: "pl" }]);
    const artist = user("artist", [{ role: "graphics", site: "pl" }]);
    const outsider = user("outsider", [{ role: "writer", site: "pl" }]);

    expect(canFlagGraphicResource(author, plEntry)).toBe(true);
    expect(canUnflagGraphicResource(author, plEntry)).toBe(false);
    expect(canUnflagGraphicResource(artist, plEntry)).toBe(true);
    expect(
      canEditGraphicResource(artist, plEntry, {
        createdBy: "author",
        claimedBy: "artist",
      }),
    ).toBe(true);
    expect(
      canEditGraphicResource(outsider, plEntry, {
        createdBy: "author",
        claimedBy: "artist",
      }),
    ).toBe(false);
  });

  it("requires a writer-capable role on the entry site", () => {
    const plWriter = user("writer", [{ role: "writer", site: "pl" }]);
    const graphics = user("artist", [{ role: "graphics", site: "pl" }]);
    expect(canClaimWriterResource(plWriter, entry("pl"))).toBe(true);
    expect(canClaimWriterResource(plWriter, entry("qb"))).toBe(false);
    expect(canClaimWriterResource(graphics, entry("pl"))).toBe(false);
  });

  it("requires both assignment and graphics role for upload/submit", () => {
    const artist = user("artist", [{ role: "graphics", site: "pl" }]);
    const plAdmin = user("admin", [{ role: "admin", site: "pl" }]);
    expect(
      canUploadOrSubmitGraphicResource(artist, entry("pl"), {
        claimedBy: "artist",
      }),
    ).toBe(true);
    expect(
      canUploadOrSubmitGraphicResource(artist, entry("pl"), {
        claimedBy: "someone-else",
      }),
    ).toBe(false);
    expect(
      canUploadOrSubmitGraphicResource(plAdmin, entry("pl"), {
        claimedBy: null,
      }),
    ).toBe(true);
  });

  it("keeps drafts limited to their author and site admin", () => {
    const draft = { ...entry("pl"), isDrafted: true };
    const author = user("author", [{ role: "writer", site: "pl" }]);
    const manager = user("manager", [{ role: "manager", site: "pl" }]);
    const plAdmin = user("admin", [{ role: "admin", site: "pl" }]);
    expect(canViewEntryResource(author, draft)).toBe(true);
    expect(canViewEntryResource(manager, draft)).toBe(false);
    expect(canViewEntryResource(plAdmin, draft)).toBe(true);
    expect(canEditEntryResource(manager, draft)).toBe(false);
  });
});
