import { NextResponse } from "next/server";
import { parseJsonBody, errorResponse } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isAdminPlusForSite } from "@/lib/auth/authorization";
import {
  deleteTemplate,
  getTemplateById,
  updateTemplate,
  updateTemplateSchema,
} from "@/lib/recurring-templates/data";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return errorResponse(401, "Not authenticated");
  }
  const { id } = await context.params;
  const template = await getTemplateById(id);
  if (!template) {
    return errorResponse(404, "Not found");
  }
  return NextResponse.json({ template });
}

export async function PATCH(request: Request, context: RouteContext) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return errorResponse(401, "Not authenticated");
  }
  const { id } = await context.params;
  const existing = await getTemplateById(id);
  if (!existing) {
    return errorResponse(404, "Not found");
  }
  if (!isAdminPlusForSite(viewer, existing.site as "pl" | "qb")) {
    return errorResponse(403, "Forbidden");
  }

  const parsed = await parseJsonBody(request, updateTemplateSchema);
  if (!parsed.ok) return parsed.response;
  if (
    parsed.data.site &&
    !isAdminPlusForSite(viewer, parsed.data.site)
  ) {
    return errorResponse(403, "Forbidden");
  }

  const result = await updateTemplate(id, parsed.data);
  if (!result.ok) {
    return errorResponse(500, result.error);
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return errorResponse(401, "Not authenticated");
  }
  const { id } = await context.params;
  const existing = await getTemplateById(id);
  if (!existing) {
    return errorResponse(404, "Not found");
  }
  if (!isAdminPlusForSite(viewer, existing.site as "pl" | "qb")) {
    return errorResponse(403, "Forbidden");
  }
  const ok = await deleteTemplate(id);
  if (!ok) {
    return errorResponse(500, "Delete failed");
  }
  return NextResponse.json({ ok: true });
}
