import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, parseJsonBody } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  isManagerPlusForSite,
  loadEntryAuthorizationContext,
} from "@/lib/auth/authorization";
import { resolveWpTitleConflict } from "@/lib/entries/wp-post";

type RouteContext = { params: Promise<{ id: string }> };
const schema = z.object({
  resolution: z.enum(["wordpress", "dashboard"]),
  expected_wp_modified_at: z.string().datetime(),
  confirm: z.literal(true),
});

export async function POST(request: Request, context: RouteContext) {
  const viewer = await getCurrentUser();
  if (!viewer) return apiError(401, "NOT_AUTHENTICATED", "Not authenticated");
  const { id } = await context.params;
  const authorization = await loadEntryAuthorizationContext(id);
  if (!authorization || !isManagerPlusForSite(viewer, authorization.site)) {
    return apiError(404, "NOT_FOUND", "Entry not found");
  }
  const parsed = await parseJsonBody(request, schema);
  if (!parsed.ok) return parsed.response;

  const result = await resolveWpTitleConflict(id, viewer.id, {
    resolution: parsed.data.resolution,
    expectedWpModifiedAt: parsed.data.expected_wp_modified_at,
  });
  if (!result.ok) {
    return apiError(
      result.conflict ? 409 : 502,
      result.conflict ? "CONFLICT" : "UPSTREAM_ERROR",
      result.error,
    );
  }
  return NextResponse.json({ resolution: parsed.data.resolution, ...result });
}
