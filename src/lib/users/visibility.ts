import "server-only";

import type { CurrentUser } from "@/lib/auth/current-user";
import { isAdminPlusForScope } from "@/lib/auth/authorization";
import type { StaffUserSummary } from "@/lib/users/queries";

/** Project a staff record to the fields this viewer may receive over HTTP. */
export function sanitizeUserForViewer(
  target: StaffUserSummary,
  viewer: CurrentUser,
) {
  const isSelf = target.id === viewer.id;
  const isPrivileged = isSelf || isAdminPlusForScope(viewer, target.wp_site);

  const directoryFields = {
    id: target.id,
    wp_user_id: target.wp_user_id,
    wp_site: target.wp_site,
    display_name: target.display_name,
    avatar_url: target.avatar_url,
    bio: target.bio,
    twitter_handle: target.twitter_handle,
    bluesky_handle: target.bluesky_handle,
    roles: target.roles,
    role_rows: target.role_rows,
    teams: target.teams,
    primary_team: target.primary_team,
    created_at: target.created_at,
    last_wp_sync: target.last_wp_sync,
    availability_status: target.availability_status,
    availability_note: target.availability_note,
    availability_until: target.availability_until,
  };

  if (!isPrivileged) return directoryFields;

  return {
    ...directoryFields,
    email: target.email,
    timezone: target.timezone,
    theme: target.theme,
    can_publish: target.can_publish,
    onboarding_completed: target.onboarding_completed,
    auto_approve_drafts: target.auto_approve_drafts,
  };
}
