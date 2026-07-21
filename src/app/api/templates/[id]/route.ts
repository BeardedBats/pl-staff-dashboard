import { NextResponse } from "next/server";
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
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await context.params;
  const template = await getTemplateById(id);
  if (!template) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return NextResponse.json({ template });
}

export async function PATCH(request: Request, context: RouteContext) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await context.params;
  const existing = await getTemplateById(id);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!isAdminPlusForSite(viewer, existing.site as "pl" | "qb")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = updateTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  if (
    parsed.data.site &&
    !isAdminPlusForSite(viewer, parsed.data.site)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await updateTemplate(id, parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const { id } = await context.params;
  const existing = await getTemplateById(id);
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!isAdminPlusForSite(viewer, existing.site as "pl" | "qb")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const ok = await deleteTemplate(id);
  if (!ok) {
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
