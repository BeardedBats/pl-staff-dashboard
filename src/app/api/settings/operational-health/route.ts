import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/http";
import { getCurrentUser, isOperations } from "@/lib/auth/current-user";
import { isAdminPlusForScope } from "@/lib/auth/authorization";
import { getOperationalHealth } from "@/lib/observability/health";
import {
  emitStructuredLog,
  createErrorId,
  safeErrorCode,
} from "@/lib/observability/structured-log";

export const dynamic = "force-dynamic";

/** GET /api/settings/operational-health — both-site admin operational view. */
export async function GET() {
  const viewer = await getCurrentUser();
  if (!viewer) return errorResponse(401, "Not authenticated");
  if (!isOperations(viewer) && !isAdminPlusForScope(viewer, "both")) {
    return errorResponse(403, "Forbidden");
  }

  try {
    return NextResponse.json({ health: await getOperationalHealth() });
  } catch (error) {
    const id = createErrorId();
    emitStructuredLog({
      level: "error",
      component: "health",
      event: "health.snapshot_failed",
      errorId: id,
      errorCode: safeErrorCode(error, "snapshot_failed"),
    });
    return NextResponse.json(
      { error: "Operational health is temporarily unavailable", errorId: id },
      { status: 500 },
    );
  }
}
