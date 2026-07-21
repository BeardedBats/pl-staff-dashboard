import { NextResponse } from "next/server";
import { errorResponse, parseJsonBody } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isManagerPlusForSite } from "@/lib/auth/authorization";
import {
  bulkCreateEntriesSchema,
  createEntries,
} from "@/lib/entries/mutations";

export const dynamic = "force-dynamic";

/** POST /api/entries/bulk-create — atomically create 1–25 entries. */
export async function POST(request: Request) {
  const viewer = await getCurrentUser();
  if (!viewer) return errorResponse(401, "Not authenticated");

  const parsed = await parseJsonBody(request, bulkCreateEntriesSchema);
  if (!parsed.ok) return parsed.response;

  if (
    parsed.data.entries.some(
      (entry) => !isManagerPlusForSite(viewer, entry.site),
    )
  ) {
    return errorResponse(
      403,
      "Manager+ access is required for every affected entry site",
    );
  }

  const result = await createEntries(viewer.id, parsed.data.entries);
  if (!result.ok) {
    return errorResponse(
      result.kind === "invalid_reference" ? 400 : 500,
      result.error,
    );
  }

  return NextResponse.json({
    ok: true,
    created: result.entryIds.length,
    entry_ids: result.entryIds,
  });
}
