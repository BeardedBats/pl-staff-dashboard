import { NextResponse } from "next/server";
import { parseJsonBody, errorResponse } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isAdminPlusForSite } from "@/lib/auth/authorization";
import {
  createTemplate,
  createTemplateSchema,
  listTemplates,
} from "@/lib/recurring-templates/data";

export const dynamic = "force-dynamic";

export async function GET() {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return errorResponse(401, "Not authenticated");
  }
  const templates = await listTemplates();
  return NextResponse.json({ templates });
}

export async function POST(request: Request) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return errorResponse(401, "Not authenticated");
  }
  const parsed = await parseJsonBody(request, createTemplateSchema);
  if (!parsed.ok) return parsed.response;
  if (!isAdminPlusForSite(viewer, parsed.data.site)) {
    return errorResponse(403, "Forbidden");
  }

  const result = await createTemplate(parsed.data);
  if (!result.ok) {
    return errorResponse(500, result.error);
  }
  return NextResponse.json({ template_id: result.id });
}
