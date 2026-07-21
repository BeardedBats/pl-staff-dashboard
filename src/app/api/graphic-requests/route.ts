import { NextResponse } from "next/server";
import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/current-user";
import {
  createGraphicRequest,
  createGraphicRequestSchema,
  listGraphicRequests,
} from "@/lib/graphics/data";
import type { GraphicStatus } from "@/lib/entries/queries";
import type { AppSite } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

const VALID_STATUSES: GraphicStatus[] = ["needed", "claimed", "submitted", "flagged"];
const VALID_SITES: AppSite[] = ["pl", "qb", "both"];

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
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const url = new URL(request.url);

  const status = url.searchParams.get("status");
  const entryId = url.searchParams.get("entryId");
  const site = url.searchParams.get("site");
  const mine = url.searchParams.get("mine") === "true";

  const requests = await listGraphicRequests(viewer, {
    status:
      status && VALID_STATUSES.includes(status as GraphicStatus)
        ? (status as GraphicStatus)
        : undefined,
    entryId: entryId ?? undefined,
    site:
      site && VALID_SITES.includes(site as AppSite)
        ? (site as AppSite)
        : undefined,
    mine,
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
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = createBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  const { entry_id, ...input } = parsed.data;
  const result = await createGraphicRequest(viewer, entry_id, input);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ id: result.id });
}
