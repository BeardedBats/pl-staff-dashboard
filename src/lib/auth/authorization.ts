import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type {
  AppRole,
  AppSite,
  CurrentUser,
} from "@/lib/auth/current-user";

export type ResourceSite = Exclude<AppSite, "both">;

export type EntryAuthorizationContext = {
  id: string;
  site: ResourceSite;
  createdBy: string;
  isDrafted: boolean;
  authorIds: ReadonlySet<string>;
  editorIds: ReadonlySet<string>;
};

const ADMIN_ROLES: readonly AppRole[] = ["admin", "eic", "operations"];
const MANAGER_ROLES: readonly AppRole[] = [
  "manager",
  "admin",
  "eic",
  "operations",
];
const ALL_ROLES: readonly AppRole[] = [
  "writer",
  "editor",
  "graphics",
  "manager",
  "admin",
  "eic",
  "operations",
];

export function hasRoleForSite(
  user: CurrentUser,
  site: ResourceSite,
  ...roles: AppRole[]
): boolean {
  return user.role_rows.some(
    (row) =>
      roles.includes(row.role) &&
      (row.site === "both" || row.site === site),
  );
}

export function hasAnyRoleForSite(
  user: CurrentUser,
  site: ResourceSite,
): boolean {
  return hasRoleForSite(user, site, ...ALL_ROLES);
}

export function authorizedSiteScope(
  user: CurrentUser,
  ...roles: AppRole[]
): AppSite | null {
  const pl = hasRoleForSite(user, "pl", ...roles);
  const qb = hasRoleForSite(user, "qb", ...roles);
  if (pl && qb) return "both";
  if (pl) return "pl";
  if (qb) return "qb";
  return null;
}

export function isAdminPlusForSite(
  user: CurrentUser,
  site: ResourceSite,
): boolean {
  return hasRoleForSite(user, site, ...ADMIN_ROLES);
}

export function isAdminPlusForScope(
  user: CurrentUser,
  site: AppSite,
): boolean {
  if (site !== "both") return isAdminPlusForSite(user, site);
  return (
    isAdminPlusForSite(user, "pl") &&
    isAdminPlusForSite(user, "qb")
  );
}

export function isManagerPlusForSite(
  user: CurrentUser,
  site: ResourceSite,
): boolean {
  return hasRoleForSite(user, site, ...MANAGER_ROLES);
}

export function isManagerPlusForScope(
  user: CurrentUser,
  site: AppSite,
): boolean {
  if (site !== "both") return isManagerPlusForSite(user, site);
  return (
    isManagerPlusForSite(user, "pl") &&
    isManagerPlusForSite(user, "qb")
  );
}

export function isEntryParticipant(
  user: CurrentUser,
  entry: EntryAuthorizationContext,
): boolean {
  return (
    entry.createdBy === user.id ||
    entry.authorIds.has(user.id) ||
    entry.editorIds.has(user.id)
  );
}

export function canViewEntryResource(
  user: CurrentUser,
  entry: EntryAuthorizationContext,
): boolean {
  if (!entry.isDrafted) return true;
  return (
    entry.createdBy === user.id ||
    entry.authorIds.has(user.id) ||
    isAdminPlusForSite(user, entry.site)
  );
}

export function canEditEntryResource(
  user: CurrentUser,
  entry: EntryAuthorizationContext,
): boolean {
  return (
    canViewEntryResource(user, entry) &&
    (isEntryParticipant(user, entry) || isManagerPlusForSite(user, entry.site))
  );
}

export function canEditChecklistResource(
  user: CurrentUser,
  entry: EntryAuthorizationContext,
): boolean {
  return (
    canViewEntryResource(user, entry) &&
    (entry.authorIds.has(user.id) ||
      entry.editorIds.has(user.id) ||
      isAdminPlusForSite(user, entry.site))
  );
}

export function canClaimWriterResource(
  user: CurrentUser,
  entry: EntryAuthorizationContext,
): boolean {
  return (
    canViewEntryResource(user, entry) &&
    (hasRoleForSite(user, entry.site, "writer") ||
      isManagerPlusForSite(user, entry.site))
  );
}

export function canEditorActOnSite(
  user: CurrentUser,
  site: ResourceSite,
): boolean {
  return (
    hasRoleForSite(user, site, "editor") ||
    isManagerPlusForSite(user, site)
  );
}

export function canViewGraphicResource(
  user: CurrentUser,
  entry: EntryAuthorizationContext,
): boolean {
  return (
    hasRoleForSite(user, entry.site, "graphics") ||
    isManagerPlusForSite(user, entry.site) ||
    isEntryParticipant(user, entry)
  );
}

export function canCreateGraphicResource(
  user: CurrentUser,
  entry: EntryAuthorizationContext,
): boolean {
  return (
    canViewEntryResource(user, entry) &&
    (isEntryParticipant(user, entry) || isManagerPlusForSite(user, entry.site))
  );
}

export function canClaimGraphicResource(
  user: CurrentUser,
  entry: EntryAuthorizationContext,
): boolean {
  return (
    hasRoleForSite(user, entry.site, "graphics") ||
    isAdminPlusForSite(user, entry.site)
  );
}

export function canFlagGraphicResource(
  user: CurrentUser,
  entry: EntryAuthorizationContext,
): boolean {
  return (
    canViewEntryResource(user, entry) &&
    (isEntryParticipant(user, entry) || isManagerPlusForSite(user, entry.site))
  );
}

export function canUnflagGraphicResource(
  user: CurrentUser,
  entry: EntryAuthorizationContext,
): boolean {
  return (
    hasRoleForSite(user, entry.site, "graphics") ||
    isManagerPlusForSite(user, entry.site)
  );
}

export function canEditGraphicResource(
  user: CurrentUser,
  entry: EntryAuthorizationContext,
  request: { createdBy: string | null; claimedBy: string | null },
): boolean {
  return (
    request.createdBy === user.id ||
    request.claimedBy === user.id ||
    isEntryParticipant(user, entry) ||
    isManagerPlusForSite(user, entry.site)
  );
}

export function canUploadOrSubmitGraphicResource(
  user: CurrentUser,
  entry: EntryAuthorizationContext,
  request: { claimedBy: string | null },
): boolean {
  if (isAdminPlusForSite(user, entry.site)) return true;
  return (
    request.claimedBy === user.id &&
    hasRoleForSite(user, entry.site, "graphics")
  );
}

export async function loadEntryAuthorizationContext(
  entryId: string,
): Promise<EntryAuthorizationContext | null> {
  const contexts = await loadEntryAuthorizationContexts([entryId]);
  return contexts.get(entryId) ?? null;
}

export async function loadEntryAuthorizationContexts(
  entryIds: readonly string[],
): Promise<Map<string, EntryAuthorizationContext>> {
  const uniqueIds = Array.from(new Set(entryIds));
  if (uniqueIds.length === 0) return new Map();

  const supabase = getSupabaseAdmin();
  const [entriesResult, authorsResult, editorsResult] = await Promise.all([
    supabase
      .from("entries")
      .select("id, site, created_by, is_drafted")
      .in("id", uniqueIds),
    supabase
      .from("entry_authors")
      .select("entry_id, user_id")
      .in("entry_id", uniqueIds),
    supabase
      .from("entry_editors")
      .select("entry_id, user_id")
      .in("entry_id", uniqueIds),
  ]);

  const authorIds = new Map<string, Set<string>>();
  for (const row of (authorsResult.data ?? []) as Array<{
    entry_id: string;
    user_id: string;
  }>) {
    const ids = authorIds.get(row.entry_id) ?? new Set<string>();
    ids.add(row.user_id);
    authorIds.set(row.entry_id, ids);
  }

  const editorIds = new Map<string, Set<string>>();
  for (const row of (editorsResult.data ?? []) as Array<{
    entry_id: string;
    user_id: string;
  }>) {
    const ids = editorIds.get(row.entry_id) ?? new Set<string>();
    ids.add(row.user_id);
    editorIds.set(row.entry_id, ids);
  }

  const contexts = new Map<string, EntryAuthorizationContext>();
  for (const row of (entriesResult.data ?? []) as Array<{
    id: string;
    site: ResourceSite;
    created_by: string;
    is_drafted: boolean;
  }>) {
    contexts.set(row.id, {
      id: row.id,
      site: row.site,
      createdBy: row.created_by,
      isDrafted: Boolean(row.is_drafted),
      authorIds: authorIds.get(row.id) ?? new Set<string>(),
      editorIds: editorIds.get(row.id) ?? new Set<string>(),
    });
  }

  return contexts;
}
