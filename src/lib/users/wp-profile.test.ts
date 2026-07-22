import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildWpProfileUpdate, hasWpProfileChanges } from "./wp-profile";

const syncedAt = "2026-07-21T16:00:00.000Z";
const remote = {
  name: "WordPress Name",
  description: "WordPress bio",
  avatar_url: "https://example.test/avatar.png",
};

describe("buildWpProfileUpdate", () => {
  it("omits display_name when a local override is active", () => {
    expect(
      buildWpProfileUpdate(
        { display_name: "Chosen Name", display_name_override: true },
        remote,
        syncedAt,
      ),
    ).toEqual({
      bio: "WordPress bio",
      avatar_url: "https://example.test/avatar.png",
      last_wp_sync: syncedAt,
    });
  });

  it("syncs the WordPress name when no override is active", () => {
    expect(
      buildWpProfileUpdate(
        { display_name: "Old Name", display_name_override: false },
        remote,
        syncedAt,
      ),
    ).toMatchObject({ display_name: "WordPress Name" });
  });

  it("keeps an existing name if WordPress unexpectedly returns a blank name", () => {
    expect(
      buildWpProfileUpdate(
        { display_name: "Existing Name", display_name_override: false },
        { ...remote, name: "" },
        syncedAt,
      ).display_name,
    ).toBe("Existing Name");
  });

  it("normalizes empty WordPress bio and avatar values", () => {
    expect(
      buildWpProfileUpdate(
        { display_name: "Name", display_name_override: true },
        { ...remote, description: "", avatar_url: null },
        syncedAt,
      ),
    ).toMatchObject({ bio: null, avatar_url: null });
  });
});

describe("hasWpProfileChanges", () => {
  it("does not report a protected name difference as a change", () => {
    const local = {
      display_name: "Chosen Name",
      display_name_override: true,
      bio: "WordPress bio",
      avatar_url: "https://example.test/avatar.png",
    };
    expect(
      hasWpProfileChanges(
        local,
        buildWpProfileUpdate(local, remote, syncedAt),
      ),
    ).toBe(false);
  });

  it("still reports remote bio changes when a name is protected", () => {
    const local = {
      display_name: "Chosen Name",
      display_name_override: true,
      bio: "Old bio",
      avatar_url: "https://example.test/avatar.png",
    };
    expect(
      hasWpProfileChanges(
        local,
        buildWpProfileUpdate(local, remote, syncedAt),
      ),
    ).toBe(true);
  });
});

describe("WordPress profile caller contract", () => {
  it.each([
    ["src/lib/auth/login.ts", 1],
    ["src/lib/users/mutations.ts", 2],
    ["src/lib/wp-sync/profiles.ts", 1],
  ])(
    "routes every existing-user update in %s through the canonical builder",
    (file, expectedCalls) => {
      const source = fs.readFileSync(path.join(process.cwd(), file), "utf8");
      expect(source.match(/buildWpProfileUpdate\(/g)).toHaveLength(expectedCalls);
    },
  );
});
