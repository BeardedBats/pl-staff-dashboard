import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  getGraphicRequestById,
} from "@/lib/graphics/data";
import {
  deleteStoredGraphic,
  uploadGraphicFile,
} from "@/lib/graphics/storage";
import { writeAuditRow } from "@/lib/entries/status-transitions";
import {
  canUploadOrSubmitGraphicResource,
  loadEntryAuthorizationContext,
} from "@/lib/auth/authorization";

// Larger body limit for file uploads — Next.js 16 raises these via fetch
// handler defaults, but we pin the runtime to Node.js just in case.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/graphic-requests/:id/upload
 *
 * Multipart upload. Expects a `file` field in the form data.
 * Replaces any previously-uploaded file for this request (old object
 * is deleted from Supabase Storage).
 *
 * Must be in `needed`, `claimed`, or `flagged` state to upload.
 */
export async function POST(request: Request, context: RouteContext) {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return errorResponse(401, "Not authenticated");
  }

  const { id } = await context.params;

  const existing = await getGraphicRequestById(viewer, id);
  if (!existing) {
    return errorResponse(404, "Request not found");
  }

  const authorization = await loadEntryAuthorizationContext(existing.entry_id);
  if (
    !authorization ||
    !canUploadOrSubmitGraphicResource(viewer, authorization, {
      claimedBy: existing.claimed_by,
    })
  ) {
    return errorResponse(
      403,
      "Only the assigned graphics worker can upload this file",
    );
  }

  if (existing.graphic_status === "submitted") {
    return errorResponse(
      400,
      "This graphic is already submitted. Unflag or create a new request.",
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse(400, "Expected multipart form data");
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return errorResponse(400, "No file field in upload");
  }

  const bytes = await file.arrayBuffer();

  const upload = await uploadGraphicFile(
    existing.entry_id,
    file.name,
    file.type || "application/octet-stream",
    bytes,
  );
  if (!upload.ok) {
    return errorResponse(400, upload.error);
  }

  // Delete the previous file if one existed.
  if (existing.storage_path && existing.storage_path !== upload.file.storagePath) {
    // Best-effort; don't fail the upload if cleanup fails.
    await deleteStoredGraphic(existing.storage_path);
  }

  // Persist only the durable private-object path. Authorized read paths mint
  // short-lived signed URLs on demand; expiring bearer URLs never enter DB.
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("graphic_requests")
    .update({
      file_url: null,
      storage_path: upload.file.storagePath,
      file_name: upload.file.fileName,
      file_size: upload.file.fileSize,
      mime_type: upload.file.mimeType,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    return errorResponse(500, "Failed to record upload");
  }

  await writeAuditRow(
    existing.entry_id,
    viewer.id,
    "graphic_update",
    "file_url",
    null,
    `uploaded: ${upload.file.fileName} (${Math.round(upload.file.fileSize / 1024)} KB)`,
  );

  const fresh = await getGraphicRequestById(viewer, id);
  return NextResponse.json({ request: fresh });
}
