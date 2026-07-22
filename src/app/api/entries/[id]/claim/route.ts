import { NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody, errorResponse } from "@/lib/api/http";
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
    return errorResponse(401, "Not authenticated");
  }

  const { id } = await context.params;

  const parsed = await parseJsonBody(request, bodySchema, { allowEmpty: true });
  if (!parsed.ok) return parsed.response;

  const result = await createClaim(viewer, id, parsed.data.role_type);
  if (!result.ok) {
    return errorResponse(statusCodeForClaimFailure(result.kind), result.error);
  }

  return NextResponse.json({
    ok: true,
    claim_id: result.claim_id,
    status: result.status,
  });
}

function statusCodeForClaimFailure(
  kind: "invalid" | "not_found" | "forbidden" | "conflict" | "database",
): number {
  switch (kind) {
    case "invalid":
      return 400;
    case "not_found":
      return 404;
    case "forbidden":
      return 403;
    case "conflict":
      return 409;
    case "database":
      return 500;
  }
}
