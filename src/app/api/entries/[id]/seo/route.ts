import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, parseJsonBody } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  canViewEntryResource,
  isEntryParticipant,
  isManagerPlusForSite,
  loadEntryAuthorizationContext,
} from "@/lib/auth/authorization";
import { applyApprovedSeoTitle, getSeoWorkspace } from "@/lib/seo/wordpress";

type RouteContext = { params: Promise<{ id: string }> };
const applySchema = z.object({
  title: z.string().trim().min(10).max(160),
  focus_keyphrase: z.string().trim().min(2).max(120),
  meta_description: z.string().trim().min(50).max(200),
  expected_wp_modified_at: z.string().datetime(),
  confirm: z.literal(true),
});

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

export async function POST(request: Request, context: RouteContext) {
  const viewer = await getCurrentUser();
  if (!viewer) return apiError(401, "NOT_AUTHENTICATED", "Not authenticated");
  const { id } = await context.params;
  const authorization = await loadEntryAuthorizationContext(id);
  if (!authorization || !isManagerPlusForSite(viewer, authorization.site)) {
    return apiError(404, "NOT_FOUND", "Entry not found");
  }
  const parsed = await parseJsonBody(request, applySchema);
  if (!parsed.ok) return parsed.response;
  const result = await applyApprovedSeoTitle(id, viewer.id, {
    title: parsed.data.title,
    focusKeyphrase: parsed.data.focus_keyphrase,
    metaDescription: parsed.data.meta_description,
    expectedWpModifiedAt: parsed.data.expected_wp_modified_at,
  });
  if (!result.ok) {
    return apiError(
      result.conflict ? 409 : 502,
      result.conflict ? "CONFLICT" : "UPSTREAM_ERROR",
      result.error,
    );
  }
  return NextResponse.json(result);
}
