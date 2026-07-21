import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { AppRole, AppSite } from "@/lib/auth/current-user";

// --------------------------------------------------------------------------
// Shared shapes
// --------------------------------------------------------------------------

export type StaffUserSummary = {
  id: string;
  wp_user_id: number;
  wp_site: AppSite;
  /** Nullable since migration 0009. Staff imported before they log in via
   * WordPress can have a NULL placeholder email until first sign-in. */
  email: string | null;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  twitter_handle: string | null;
  bluesky_handle: string | null;
  timezone: string;
  theme: "dark" | "light";
  can_publish: boolean;
  onboarding_completed: boolean;
  auto_approve_drafts: boolean;
  last_wp_sync: string | null;
  created_at: string;
  roles: AppRole[];
  role_rows: Array<{ role: AppRole; site: AppSite }>;
  teams: StaffTeamMembership[];
  primary_team: StaffTeamMembership | null;
};

export type StaffTeamMembership = {
  team_id: string;
  team_name: string;
  team_site: AppSite;
  manager_id: string;
  manager_name: string;
  is_primary: boolean;
};

export type ListUsersFilters = {
  search?: string;
  role?: AppRole;
  site?: AppSite;
  teamId?: string;
  limit?: number;
  offset?: number;
};

export type ListUsersResult = {
  users: StaffUserSummary[];
  totalCount: number;
};

// --------------------------------------------------------------------------
// Queries
// --------------------------------------------------------------------------

/**
 * List staff users with optional filters + pagination.
 *
 * Rather than writing a single fancy SQL query, we do three batched reads and
 * stitch the result in app code. Supabase's type helpers aren't great for
 * complex joins anyway, and the payloads are small (~200 rows).
 */
export async function listUsers(filters: ListUsersFilters = {}): Promise<ListUsersResult> {
  const supabase = getSupabaseAdmin();

  const limit = filters.limit ?? 50;
  const offset = filters.offset ?? 0;

  // 1. Base user query with search + site filter.
  let query = supabase
    .from("users")
    .select(
      "id, wp_user_id, wp_site, email, display_name, avatar_url, bio, twitter_handle, bluesky_handle, timezone, theme, can_publish, onboarding_completed, auto_approve_drafts, last_wp_sync, created_at",
      { count: "exact" },
    )
    .order("display_name", { ascending: true });

  if (filters.search) {
    const term = filters.search.replace(/%/g, "").trim();
    if (term.length > 0) {
      query = query.or(
        `display_name.ilike.%${term}%,email.ilike.%${term}%`,
      );
    }
  }

  if (filters.site && filters.site !== "both") {
    query = query.in("wp_site", [filters.site, "both"]);
  }

  query = query.range(offset, offset + limit - 1);

  const { data: userRows, error: userError, count } = await query;
  if (userError || !userRows) {
    return { users: [], totalCount: 0 };
  }

  if (userRows.length === 0) {
    return { users: [], totalCount: count ?? 0 };
  }

  const userIds = userRows.map((u) => u.id as string);

  // 2. Load all roles for these users in one query.
  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("user_id, role, site")
    .in("user_id", userIds);

  const rolesByUser = new Map<
    string,
    Array<{ role: AppRole; site: AppSite }>
  >();
  for (const r of (roleRows ?? []) as Array<{
    user_id: string;
    role: AppRole;
    site: AppSite;
  }>) {
    const existing = rolesByUser.get(r.user_id) ?? [];
    existing.push({ role: r.role, site: r.site });
    rolesByUser.set(r.user_id, existing);
  }

  // 3. Load team memberships with team details.
  const { data: membershipRows } = await supabase
    .from("team_members")
    .select(
      "user_id, is_primary, team_id, teams!inner(id, name, site, manager_id, users!teams_manager_id_fkey(display_name))",
    )
    .in("user_id", userIds);

  const teamsByUser = new Map<string, StaffTeamMembership[]>();
  for (const row of (membershipRows ?? []) as Array<{
    user_id: string;
    is_primary: boolean;
    team_id: string;
    teams: {
      id: string;
      name: string;
      site: AppSite;
      manager_id: string;
      users?: { display_name: string } | null;
    };
  }>) {
    const list = teamsByUser.get(row.user_id) ?? [];
    list.push({
      team_id: row.teams.id,
      team_name: row.teams.name,
      team_site: row.teams.site,
      manager_id: row.teams.manager_id,
      manager_name: row.teams.users?.display_name ?? "",
      is_primary: Boolean(row.is_primary),
    });
    teamsByUser.set(row.user_id, list);
  }

  // 4. Stitch.
  let users: StaffUserSummary[] = userRows.map((u) => {
    const roleList = rolesByUser.get(u.id as string) ?? [];
    const teamList = teamsByUser.get(u.id as string) ?? [];
    return {
      id: u.id as string,
      wp_user_id: u.wp_user_id as number,
      wp_site: u.wp_site as AppSite,
      email: (u.email as string | null) ?? null,
      display_name: u.display_name as string,
      avatar_url: (u.avatar_url as string | null) ?? null,
      bio: (u.bio as string | null) ?? null,
      twitter_handle: (u.twitter_handle as string | null) ?? null,
      bluesky_handle: (u.bluesky_handle as string | null) ?? null,
      timezone: u.timezone as string,
      theme: u.theme as "dark" | "light",
      can_publish: Boolean(u.can_publish),
      onboarding_completed: Boolean(u.onboarding_completed),
      auto_approve_drafts: Boolean(u.auto_approve_drafts),
      last_wp_sync: (u.last_wp_sync as string | null) ?? null,
      created_at: u.created_at as string,
      roles: Array.from(new Set(roleList.map((r) => r.role))),
      role_rows: roleList,
      teams: teamList,
      primary_team: teamList.find((t) => t.is_primary) ?? null,
    };
  });

  // 5. Post-filter for role / team (cheaper than a JOIN for small result sets).
  if (filters.role) {
    users = users.filter((u) => u.roles.includes(filters.role!));
  }
  if (filters.teamId) {
    users = users.filter((u) => u.teams.some((t) => t.team_id === filters.teamId));
  }

  return { users, totalCount: count ?? users.length };
}

/** Get a single user by ID, including roles + teams. Returns null if not found. */
export async function getUserById(id: string): Promise<StaffUserSummary | null> {
  const { users } = await listUsers({ limit: 1, offset: 0 });
  // Shortcut: if the caller knows the ID, a direct query is cheaper than
  // the list path. Do it inline instead of round-tripping.
  if (users.length > 0 && users[0].id === id) return users[0];

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("users")
    .select(
      "id, wp_user_id, wp_site, email, display_name, avatar_url, bio, twitter_handle, bluesky_handle, timezone, theme, can_publish, onboarding_completed, auto_approve_drafts, last_wp_sync, created_at",
    )
    .eq("id", id)
    .maybeSingle();

  if (error || !data) return null;

  // Reuse listUsers pattern for roles + teams on this one user.
  const { data: roleRows } = await supabase
    .from("user_roles")
    .select("role, site")
    .eq("user_id", id);

  const { data: membershipRows } = await supabase
    .from("team_members")
    .select(
      "is_primary, teams!inner(id, name, site, manager_id, users!teams_manager_id_fkey(display_name))",
    )
    .eq("user_id", id);

  const roleList = ((roleRows ?? []) as Array<{ role: AppRole; site: AppSite }>).map(
    (r) => ({ role: r.role, site: r.site }),
  );

  const teamList: StaffTeamMembership[] = (
    (membershipRows ?? []) as Array<{
      is_primary: boolean;
      teams: {
        id: string;
        name: string;
        site: AppSite;
        manager_id: string;
        users?: { display_name: string } | null;
      };
    }>
  ).map((row) => ({
    team_id: row.teams.id,
    team_name: row.teams.name,
    team_site: row.teams.site,
    manager_id: row.teams.manager_id,
    manager_name: row.teams.users?.display_name ?? "",
    is_primary: Boolean(row.is_primary),
  }));

  return {
    id: data.id as string,
    wp_user_id: data.wp_user_id as number,
    wp_site: data.wp_site as AppSite,
    email: (data.email as string | null) ?? null,
    display_name: data.display_name as string,
    avatar_url: (data.avatar_url as string | null) ?? null,
    bio: (data.bio as string | null) ?? null,
    twitter_handle: (data.twitter_handle as string | null) ?? null,
    bluesky_handle: (data.bluesky_handle as string | null) ?? null,
    timezone: data.timezone as string,
    theme: data.theme as "dark" | "light",
    can_publish: Boolean(data.can_publish),
    onboarding_completed: Boolean(data.onboarding_completed),
    auto_approve_drafts: Boolean(data.auto_approve_drafts),
    last_wp_sync: (data.last_wp_sync as string | null) ?? null,
    created_at: data.created_at as string,
    roles: Array.from(new Set(roleList.map((r) => r.role))),
    role_rows: roleList,
    teams: teamList,
    primary_team: teamList.find((t) => t.is_primary) ?? null,
  };
}
