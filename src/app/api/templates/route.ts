import { NextResponse } from "next/server";
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
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const templates = await listTemplates();
  return NextResponse.json({ templates });
}

export async function POST(request: Request) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createTemplateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  if (!isAdminPlusForSite(viewer, parsed.data.site)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await createTemplate(parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }
  return NextResponse.json({ template_id: result.id });
}
