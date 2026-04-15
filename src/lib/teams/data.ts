import "server-only";

import { z } from "zod";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { AppSite } from "@/lib/auth/current-user";

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export type TeamSummary = {
  id: string;
  name: string;
  description: string | null;
  site: AppSite;
  manager_id: string;
  manager_name: string;
  manager_avatar_url: string | null;
  member_count: number;
  created_at: string;
};

export type TeamDetail = TeamSummary & {
  members: TeamMemberRow[];
};

export type TeamMemberRow = {
  user_id: string;
  display_name: string;
  email: string;
  avatar_url: string | null;
  is_primary: boolean;
  joined_at: string;
};

// --------------------------------------------------------------------------
// Queries
// --------------------------------------------------------------------------

export async function listTeams(filters: { site?: AppSite } = {}): Promise<TeamSummary[]> {
  const supabase = getSupabaseAdmin();

  let query = supabase
    .from("teams")
    .select(
      "id, name, description, site, manager_id, created_at, users!teams_manager_id_fkey(display_name, avatar_url)",
    )
    .order("name", { ascending: true });

  if (filters.site && filters.site !== "both") {
    query = query.in("site", [filters.site, "both"]);
  }

  const { data, error } = await query;
  if (error || !data) return [];

  const teamIds = data.map((t) => t.id as string);
  const memberCounts = await countMembers(teamIds);

  return (data as Array<{
    id: string;
    name: string;
    description: string | null;
    site: AppSite;
    manager_id: string;
    created_at: string;
    users?: { display_name: string; avatar_url: string | null } | null;
  }>).map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    site: t.site,
    manager_id: t.manager_id,
    manager_name: t.users?.display_name ?? "",
    manager_avatar_url: t.users?.avatar_url ?? null,
    member_count: memberCounts.get(t.id) ?? 0,
    created_at: t.created_at,
  }));
}

async function countMembers(teamIds: string[]): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  if (teamIds.length === 0) return counts;

  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("team_members")
    .select("team_id")
    .in("team_id", teamIds);

  for (const row of (data ?? []) as Array<{ team_id: string }>) {
    counts.set(row.team_id, (counts.get(row.team_id) ?? 0) + 1);
  }
  return counts;
}

export async function getTeamById(id: string): Promise<TeamDetail | null> {
  const supabase = getSupabaseAdmin();

  const { data: team } = await supabase
    .from("teams")
    .select(
      "id, name, description, site, manager_id, created_at, users!teams_manager_id_fkey(display_name, avatar_url)",
    )
    .eq("id", id)
    .maybeSingle();

  if (!team) return null;

  const { data: memberRows } = await supabase
    .from("team_members")
    .select(
      "is_primary, created_at, users!inner(id, display_name, email, avatar_url)",
    )
    .eq("team_id", id);

  const members: TeamMemberRow[] = (
    (memberRows ?? []) as Array<{
      is_primary: boolean;
      created_at: string;
      users: {
        id: string;
        display_name: string;
        email: string;
        avatar_url: string | null;
      };
    }>
  ).map((row) => ({
    user_id: row.users.id,
    display_name: row.users.display_name,
    email: row.users.email,
    avatar_url: row.users.avatar_url,
    is_primary: Boolean(row.is_primary),
    joined_at: row.created_at,
  }));

  const managerInfo = team.users as
    | { display_name: string; avatar_url: string | null }
    | null
    | undefined;

  return {
    id: team.id as string,
    name: team.name as string,
    description: (team.description as string | null) ?? null,
    site: team.site as AppSite,
    manager_id: team.manager_id as string,
    manager_name: managerInfo?.display_name ?? "",
    manager_avatar_url: managerInfo?.avatar_url ?? null,
    member_count: members.length,
    created_at: team.created_at as string,
    members: members.sort((a, b) => {
      // Primary first, then alpha.
      if (a.is_primary && !b.is_primary) return -1;
      if (b.is_primary && !a.is_primary) return 1;
      return a.display_name.localeCompare(b.display_name);
    }),
  };
}

// --------------------------------------------------------------------------
// Mutations (Admin+ / Manager of own team)
// --------------------------------------------------------------------------

export const createTeamSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(2000).optional().or(z.literal("")),
  site: z.enum(["pl", "qb", "both"]),
  manager_id: z.uuid(),
});

export type CreateTeamInput = z.infer<typeof createTeamSchema>;

export async function createTeam(
  input: CreateTeamInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("teams")
    .insert({
      name: input.name,
      description: input.description?.trim() || null,
      site: input.site,
      manager_id: input.manager_id,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: "Failed to create team" };
  }
  return { ok: true, id: data.id as string };
}

export const updateTeamSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  site: z.enum(["pl", "qb", "both"]).optional(),
  manager_id: z.uuid().optional(),
});

export type UpdateTeamInput = z.infer<typeof updateTeamSchema>;

export async function updateTeam(
  id: string,
  input: UpdateTeamInput,
): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("teams")
    .update({ ...input, updated_at: new Date().toISOString() })
    .eq("id", id);
  return !error;
}

export async function deleteTeam(id: string): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.from("teams").delete().eq("id", id);
  return !error;
}

// --------------------------------------------------------------------------
// Membership mutations
// --------------------------------------------------------------------------

/**
 * Add a user to a team. If `is_primary` is true, this becomes their primary
 * team and any previous primary team is demoted (enforced by the partial
 * unique index, so we explicitly clear the old primary first).
 */
export async function addTeamMember(
  teamId: string,
  userId: string,
  isPrimary: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabaseAdmin();

  if (isPrimary) {
    // Clear any existing primary flag for this user so the partial unique
    // index doesn't trip.
    await supabase
      .from("team_members")
      .update({ is_primary: false })
      .eq("user_id", userId)
      .eq("is_primary", true);
  }

  // Upsert: if the user is already on this team, flip their primary flag
  // rather than inserting a duplicate (blocked by the (team_id, user_id)
  // unique constraint).
  const { data: existing } = await supabase
    .from("team_members")
    .select("id, is_primary")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .maybeSingle();

  if (existing) {
    if (Boolean(existing.is_primary) !== isPrimary) {
      const { error } = await supabase
        .from("team_members")
        .update({ is_primary: isPrimary })
        .eq("id", existing.id as string);
      if (error) return { ok: false, error: "Failed to update primary flag" };
    }
    return { ok: true };
  }

  const { error } = await supabase.from("team_members").insert({
    team_id: teamId,
    user_id: userId,
    is_primary: isPrimary,
  });

  if (error) return { ok: false, error: "Failed to add member" };
  return { ok: true };
}

export async function removeTeamMember(
  teamId: string,
  userId: string,
): Promise<boolean> {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("team_members")
    .delete()
    .eq("team_id", teamId)
    .eq("user_id", userId);
  return !error;
}

export async function setMemberPrimary(
  teamId: string,
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = getSupabaseAdmin();

  // Demote any current primary for this user.
  await supabase
    .from("team_members")
    .update({ is_primary: false })
    .eq("user_id", userId)
    .eq("is_primary", true);

  const { error } = await supabase
    .from("team_members")
    .update({ is_primary: true })
    .eq("team_id", teamId)
    .eq("user_id", userId);

  if (error) return { ok: false, error: "Failed to set primary team" };
  return { ok: true };
}
