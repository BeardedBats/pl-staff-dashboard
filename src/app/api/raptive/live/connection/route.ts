import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, parseJsonBody } from "@/lib/api/http";
import { getCurrentUser, isOperations } from "@/lib/auth/current-user";
import {
  configureRaptiveSite,
  discoverRaptiveSites,
  getRaptiveLiveStatus,
  setRaptiveSiteEnabled,
} from "@/lib/analytics/raptive-live";

export const dynamic = "force-dynamic";

const bodySchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("configure"),
    wpSite: z.enum(["pl", "qb"]),
    raptiveSiteId: z.string().min(1).max(128),
  }),
  z.object({
    action: z.enum(["enable", "disable"]),
    wpSite: z.enum(["pl", "qb"]),
  }),
]);

export async function POST(request: Request) {
  const viewer = await getCurrentUser();
  if (!viewer) return errorResponse(401, "Not authenticated");
  if (!isOperations(viewer)) {
    return errorResponse(403, "Only Operations can configure Raptive");
  }
  const parsed = await parseJsonBody(request, bodySchema);
  if (!parsed.ok) return parsed.response;

  try {
    if (parsed.data.action === "configure") {
      const connection = await configureRaptiveSite(
        parsed.data.wpSite,
        parsed.data.raptiveSiteId,
        viewer.id,
      );
      return NextResponse.json({ ok: true, connection });
    }

    if (parsed.data.action === "enable") {
      const status = await getRaptiveLiveStatus();
      const connection = status.connections.find(
        (item) => item.wpSite === parsed.data.wpSite,
      );
      if (!connection) return errorResponse(404, "Raptive connection not found");
      const sites = await discoverRaptiveSites();
      if (!sites.some((site) => site.id === connection.raptiveSiteId)) {
        return errorResponse(409, "Configured Raptive site is no longer accessible");
      }
    }

    const enabled = parsed.data.action === "enable";
    if (!(await setRaptiveSiteEnabled(parsed.data.wpSite, enabled))) {
      return errorResponse(404, "Raptive connection not found");
    }
    return NextResponse.json({ ok: true, enabled });
  } catch {
    return errorResponse(502, "Raptive connection could not be updated");
  }
}
