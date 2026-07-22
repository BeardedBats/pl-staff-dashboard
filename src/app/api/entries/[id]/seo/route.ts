import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  canViewEntryResource,
  isEntryParticipant,
  isManagerPlusForSite,
  loadEntryAuthorizationContext,
} from "@/lib/auth/authorization";
import { getSeoWorkspace } from "@/lib/seo/wordpress";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const viewer = await getCurrentUser();
  if (!viewer) return apiError(401, "NOT_AUTHENTICATED", "Not authenticated");
  const { id } = await context.params;
  const authorization = await loadEntryAuthorizationContext(id);
  if (
    !authorization ||
    !canViewEntryResource(viewer, authorization) ||
    (!isEntryParticipant(viewer, authorization) &&
      !isManagerPlusForSite(viewer, authorization.site))
  ) {
    return apiError(404, "NOT_FOUND", "Entry not found");
  }
  const workspace = await getSeoWorkspace(id);
  if (!workspace) return apiError(502, "UPSTREAM_ERROR", "WordPress SEO data is unavailable");
  return NextResponse.json({ workspace });
}
