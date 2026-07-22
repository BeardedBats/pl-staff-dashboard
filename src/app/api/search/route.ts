import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, parseSearchParams } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/current-user";
import { searchDashboard } from "@/lib/search/dashboard";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  q: z.string().trim().min(2).max(80),
  limit: z.coerce.number().int().min(1).max(8).default(5),
});

export async function GET(request: Request) {
  const viewer = await getCurrentUser();
  if (!viewer) return errorResponse(401, "Not authenticated");

  const parsed = parseSearchParams(request, querySchema);
  if (!parsed.ok) return parsed.response;

  const response = await searchDashboard(viewer, parsed.data.q, parsed.data.limit);
  return NextResponse.json(response);
}
