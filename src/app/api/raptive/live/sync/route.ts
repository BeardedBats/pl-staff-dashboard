import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, parseJsonBody } from "@/lib/api/http";
import { getCurrentUser, isOperations } from "@/lib/auth/current-user";
import {
  getRaptiveLiveStatus,
  syncRaptiveConnection,
} from "@/lib/analytics/raptive-live";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.object({
  wpSite: z.enum(["pl", "qb"]),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
});

export async function POST(request: Request) {
  const viewer = await getCurrentUser();
  if (!viewer) return errorResponse(401, "Not authenticated");
  if (!isOperations(viewer)) {
    return errorResponse(403, "Only Operations can synchronize Raptive");
  }
  const parsed = await parseJsonBody(request, bodySchema);
  if (!parsed.ok) return parsed.response;

  const status = await getRaptiveLiveStatus();
  const connection = status.connections.find(
    (item) => item.wpSite === parsed.data.wpSite,
  );
  if (!connection) return errorResponse(404, "Raptive connection not found");
  const result = await syncRaptiveConnection(connection, parsed.data.date);
  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}
