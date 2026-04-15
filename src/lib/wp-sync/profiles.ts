import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { fetchWpUserById, type WpSiteKey } from "@/lib/auth/wordpress";

/**
 * Periodic WP profile refresh.
 *
 * Walks every dashboard user that has a `wp_user_id` and pulls fresh
 * `display_name`, `bio`, and `avatar_url` from the WP REST API. Updates
 * the dashboard row only when at least one field changed — otherwise we
 * just increment the unchanged counter.
 *
 * For `wp_site = 'both'`, we prefer the PL fetch and fall back to QB on
 * 404.
 *
 * Never throws at the top level. Individual user errors are collected
 * into the report so the cron can log them.
 */

export type ProfileSyncReport = {
  usersChecked: number;
  usersUpdated: number;
  unchanged: number;
  notFound: number;
  errors: Array<{ userId: string; message: string }>;
};

type DashboardUserRow = {
  id: string;
  wp_user_id: number;
  wp_site: "pl" | "qb" | "both";
  display_name: string | null;
  bio: string | null;
  avatar_url: string | null;
};

// --------------------------------------------------------------------------
// Per-user fetch: honor the 'both' preference order
// --------------------------------------------------------------------------

async function fetchUserFromPreferredSite(
  user: DashboardUserRow,
): Promise<
  | { ok: true; site: WpSiteKey; value: { name: string; description: string; avatar_url: string | null } }
  | { ok: false; kind: "not_found" | "error"; message: string }
> {
  const tryOrder: WpSiteKey[] =
    user.wp_site === "qb" ? ["qb"] : user.wp_site === "both" ? ["pl", "qb"] : ["pl"];

  let lastError: { kind: "not_found" | "error"; message: string } = {
    kind: "not_found",
    message: "WP user not found",
  };

  for (const site of tryOrder) {
    const result = await fetchWpUserById(site, user.wp_user_id);
    if (result.ok) {
      return {
        ok: true,
        site,
        value: {
          name: result.value.name,
          description: result.value.description,
          avatar_url: result.value.avatar_url,
        },
      };
    }
    if (result.error.kind === "not_found") {
      lastError = { kind: "not_found", message: result.error.message };
      continue; // try next site in order
    }
    lastError = { kind: "error", message: result.error.message };
    // Keep trying the next site — a network blip on PL shouldn't skip a
    // 'both' user entirely.
  }

  return { ok: false, ...lastError };
}

// --------------------------------------------------------------------------
// Main
// --------------------------------------------------------------------------

export async function syncWpProfiles(): Promise<ProfileSyncReport> {
  const report: ProfileSyncReport = {
    usersChecked: 0,
    usersUpdated: 0,
    unchanged: 0,
    notFound: 0,
    errors: [],
  };

  const supabase = getSupabaseAdmin();
  const { data: users } = await supabase
    .from("users")
    .select("id, wp_user_id, wp_site, display_name, bio, avatar_url")
    .not("wp_user_id", "is", null);

  const rows = (users ?? []) as unknown as DashboardUserRow[];

  for (const user of rows) {
    if (user.wp_user_id == null) continue;
    report.usersChecked++;

    try {
      const result = await fetchUserFromPreferredSite(user);

      if (!result.ok) {
        if (result.kind === "not_found") {
          report.notFound++;
        } else {
          report.errors.push({ userId: user.id, message: result.message });
        }
        continue;
      }

      const nextDisplayName = result.value.name || user.display_name || "";
      const nextBio = result.value.description || "";
      const nextAvatarUrl = result.value.avatar_url ?? null;

      const changed =
        (user.display_name ?? "") !== nextDisplayName ||
        (user.bio ?? "") !== nextBio ||
        (user.avatar_url ?? null) !== nextAvatarUrl;

      if (!changed) {
        report.unchanged++;
        continue;
      }

      const { error: updateError } = await supabase
        .from("users")
        .update({
          display_name: nextDisplayName,
          bio: nextBio,
          avatar_url: nextAvatarUrl,
          last_wp_sync: new Date().toISOString(),
        })
        .eq("id", user.id);

      if (updateError) {
        report.errors.push({ userId: user.id, message: updateError.message });
        continue;
      }

      report.usersUpdated++;
    } catch (err) {
      report.errors.push({
        userId: user.id,
        message: err instanceof Error ? err.message : "Unknown error",
      });
    }
  }

  return report;
}
