import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import { createClaim } from "@/lib/claims/data";

export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

const bodySchema = z.object({
  role_type: z.enum(["writer", "editor", "graphic"]).optional().default("writer"),
});

/**
 * POST /api/entries/:id/claim
 *
 * File a claim request for a writer slot. Auto-approves for manager+ roles;
 * others create a pending claim that a manager resolves.
 */
export async function POST(request: Request, context: RouteContext) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await context.params;

  let body: unknown = {};
  try {
    body = (await request.json().catch(() => ({}))) ?? {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const result = await createClaim(viewer, id, parsed.data.role_type);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({
    ok: true,
    claim_id: result.claim_id,
    status: result.status,
  });
}
