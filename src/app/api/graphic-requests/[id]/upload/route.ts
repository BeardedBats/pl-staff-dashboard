import { NextResponse } from "next/server";
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
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await context.params;

  const existing = await getGraphicRequestById(viewer, id);
  if (!existing) {
    return NextResponse.json({ error: "Request not found" }, { status: 404 });
  }

  const authorization = await loadEntryAuthorizationContext(existing.entry_id);
  if (
    !authorization ||
    !canUploadOrSubmitGraphicResource(viewer, authorization, {
      claimedBy: existing.claimed_by,
    })
  ) {
    return NextResponse.json(
      { error: "Only the assigned graphics worker can upload this file" },
      { status: 403 },
    );
  }

  if (existing.graphic_status === "submitted") {
    return NextResponse.json(
      {
        error:
          "This graphic is already submitted. Unflag or create a new request.",
      },
      { status: 400 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json(
      { error: "Expected multipart form data" },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json(
      { error: "No file field in upload" },
      { status: 400 },
    );
  }

  const bytes = await file.arrayBuffer();

  const upload = await uploadGraphicFile(
    existing.entry_id,
    file.name,
    file.type || "application/octet-stream",
    bytes,
  );
  if (!upload.ok) {
    return NextResponse.json({ error: upload.error }, { status: 400 });
  }

  // Delete the previous file if one existed.
  if (existing.storage_path && existing.storage_path !== upload.file.storagePath) {
    // Best-effort; don't fail the upload if cleanup fails.
    await deleteStoredGraphic(existing.storage_path);
  }

  // Update the DB row. file_url stores the most recent signed URL — it'll
  // expire, but the read path always regenerates from storage_path so it
  // doesn't matter long-term. We keep it populated as a hint to migrations
  // and for the audit log "uploaded:" marker.
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("graphic_requests")
    .update({
      file_url: upload.file.signedUrl,
      storage_path: upload.file.storagePath,
      file_name: upload.file.fileName,
      file_size: upload.file.fileSize,
      mime_type: upload.file.mimeType,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json(
      { error: "Failed to record upload in DB" },
      { status: 500 },
    );
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
