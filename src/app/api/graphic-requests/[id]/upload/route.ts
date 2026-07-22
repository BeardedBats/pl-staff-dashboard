import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/auth/current-user";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getGraphicRequestById } from "@/lib/graphics/data";
import {
  deleteStoredGraphic,
  uploadGraphicFile,
} from "@/lib/graphics/storage";
import {
  canUploadOrSubmitGraphicResource,
  isAdminPlusForSite,
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
 * Records an immutable version. A failed/concurrent metadata write removes
 * only the just-uploaded object; prior versions remain recoverable.
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
      409,
      "This graphic is already submitted. Unflag or create a new request.",
    );
  }
  if (
    existing.graphic_status === "claimed" &&
    existing.review_submitted_at
  ) {
    return errorResponse(
      409,
      "This version is awaiting review. Request changes before uploading a replacement.",
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

  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .rpc("record_graphic_upload", {
      p_actor_id: viewer.id,
      p_request_id: id,
      p_allow_override: isAdminPlusForSite(viewer, authorization.site),
      p_expected_storage_path: existing.storage_path ?? "",
      p_storage_path: upload.file.storagePath,
      p_file_name: upload.file.fileName,
      p_file_size: upload.file.fileSize,
      p_mime_type: upload.file.mimeType,
    })
    .single();

  if (error) {
    await deleteStoredGraphic(upload.file.storagePath);
    if (error.code === "P0001") {
      return errorResponse(409, "Graphic changed while the upload was processing");
    }
    if (error.code === "P0002") {
      return errorResponse(404, "Request not found");
    }
    if (error.code === "42501") {
      return errorResponse(403, "Only the assigned graphics worker can upload");
    }
    return errorResponse(500, "Failed to record upload");
  }

  const fresh = await getGraphicRequestById(viewer, id);
  return NextResponse.json({ request: fresh });
}
