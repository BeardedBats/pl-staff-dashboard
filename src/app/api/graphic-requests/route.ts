import { NextResponse } from "next/server";
import {
  errorResponse,
  parseJsonBody,
  parseSearchParams,
} from "@/lib/api/http";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  createGraphicRequest,
  createGraphicRequestSchema,
  listGraphicRequests,
} from "@/lib/graphics/data";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  status: z.enum(["needed", "claimed", "submitted", "flagged"]).optional(),
  entryId: z.uuid().optional(),
  site: z.enum(["pl", "qb", "both"]).optional(),
  mine: z
    .enum(["true", "false"])
    .transform((value) => value === "true")
    .default(false),
});

/**
 * GET /api/graphic-requests
 *
 * Query params:
 *   - status: filter by graphic_status
 *   - entryId: only requests for one entry
 *   - site: pl / qb / both
 *   - mine=true: only requests the current user has claimed
 */
export async function GET(request: Request) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return errorResponse(401, "Not authenticated");
  }

  const parsed = parseSearchParams(request, querySchema);
  if (!parsed.ok) return parsed.response;

  const requests = await listGraphicRequests(viewer, {
    status: parsed.data.status,
    entryId: parsed.data.entryId,
    site: parsed.data.site,
    mine: parsed.data.mine,
    userId: viewer.id,
  });

  return NextResponse.json({ requests });
}

const createBodySchema = createGraphicRequestSchema.extend({
  entry_id: z.uuid(),
});

/**
 * POST /api/graphic-requests
 *
 * Create a new graphic request for an entry. Per Nick's spec: anyone on the
 * entry (writer, editor, admin, etc.) can create a request.
 */
export async function POST(request: Request) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return errorResponse(401, "Not authenticated");
  }

  const parsed = await parseJsonBody(request, createBodySchema);
  if (!parsed.ok) return parsed.response;

  const { entry_id, ...input } = parsed.data;
  const result = await createGraphicRequest(viewer, entry_id, input);
  if (!result.ok) {
    return errorResponse(400, result.error);
  }

  return NextResponse.json({ id: result.id });
}
