export type LocalWpProfile = {
  display_name: string | null;
  display_name_override: boolean;
};

export type RemoteWpProfile = {
  name: string;
  description: string;
  avatar_url: string | null;
};

export type WpProfileUpdate = {
  display_name?: string;
  bio: string | null;
  avatar_url: string | null;
  last_wp_sync: string;
};

/**
 * Build the only supported WordPress-to-existing-user profile update.
 * Intentional local names are immutable until the override flag is cleared.
 */
export function buildWpProfileUpdate(
  local: LocalWpProfile,
  remote: RemoteWpProfile,
  syncedAt: string,
): WpProfileUpdate {
  const update: WpProfileUpdate = {
    bio: remote.description || null,
    avatar_url: remote.avatar_url ?? null,
    last_wp_sync: syncedAt,
  };

  if (!local.display_name_override) {
    update.display_name = remote.name || local.display_name || "";
  }

  return update;
}

export function hasWpProfileChanges(
  local: LocalWpProfile & { bio: string | null; avatar_url: string | null },
  update: WpProfileUpdate,
): boolean {
  return (
    ("display_name" in update && local.display_name !== update.display_name) ||
    (local.bio || null) !== update.bio ||
    local.avatar_url !== update.avatar_url
  );
}
