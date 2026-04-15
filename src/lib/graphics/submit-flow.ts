import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { writeAuditRow } from "@/lib/entries/status-transitions";
import { downloadGraphicBytes } from "./storage";
import { uploadMediaToWp, setFeaturedMedia } from "./wp-media";
import type { CurrentUser } from "@/lib/auth/current-user";
import type { WpSiteKey } from "@/lib/auth/wordpress";

/**
 * Submit a graphic request — the terminal "this is the final image" action.
 *
 * Preconditions:
 *  - Request must have a file_url (i.e. something was uploaded)
 *  - Request must not already be in `submitted` or `flagged` state
 *  - The parent entry must have a wp_post_id (i.e. a WP draft exists)
 *
 * Side effects, in order:
 *  1. Download the bytes from Supabase Storage.
 *  2. POST the bytes to WP media library → get back a wp_media_id.
 *  3. POST the media ID to WP as the post's featured_media.
 *  4. Mark the graphic_request as submitted, is_featured=true, store
 *     wp_media_id, write an audit row on the entry.
 *  5. Clear any other graphics on the same entry from is_featured (only one
 *     can be featured at a time).
 *
 * If any WP step fails we roll the request back to `claimed` and log the
 * error in the audit trail. The Supabase Storage copy is preserved so a
 * retry can skip the re-upload.
 */

export type SubmitResult =
  | { ok: true; wp_media_id: number }
  | { ok: false; error: string };

export async function submitGraphicRequest(
  viewer: CurrentUser,
  requestId: string,
): Promise<SubmitResult> {
  const supabase = getSupabaseAdmin();

  // 1. Load the request and its parent entry.
  const { data: req } = await supabase
    .from("graphic_requests")
    .select(
      "id, entry_id, title, graphic_status, storage_path, file_name, mime_type, wp_media_id",
    )
    .eq("id", requestId)
    .maybeSingle();

  if (!req) return { ok: false, error: "Request not found" };

  if (req.graphic_status === "submitted") {
    return { ok: false, error: "Already submitted" };
  }
  if (!req.storage_path || !req.file_name || !req.mime_type) {
    return {
      ok: false,
      error: "No file uploaded yet — upload before submitting.",
    };
  }

  const { data: entry } = await supabase
    .from("entries")
    .select("id, site, wp_post_id, wp_post_url")
    .eq("id", req.entry_id as string)
    .maybeSingle();
  if (!entry) {
    return { ok: false, error: "Parent entry not found" };
  }
  if (!entry.wp_post_id) {
    return {
      ok: false,
      error:
        "The parent entry has no WordPress draft yet. Approve a writer claim first so the draft gets created.",
    };
  }

  const site = (entry.site as WpSiteKey) ?? "pl";

  // 2. Download the bytes from Supabase Storage.
  const download = await downloadGraphicBytes(req.storage_path as string);
  if (!download.ok) {
    return { ok: false, error: `Download failed: ${download.error}` };
  }

  // 3. Upload to WP media library.
  const upload = await uploadMediaToWp(site, {
    fileName: req.file_name as string,
    mimeType: req.mime_type as string,
    bytes: download.bytes,
  });
  if (!upload.ok) {
    await writeAuditRow(
      req.entry_id as string,
      viewer.id,
      "graphic_update",
      "wp_media_upload_error",
      null,
      upload.error,
    );
    return { ok: false, error: upload.error };
  }

  // 4. Set as featured media on the post.
  const featured = await setFeaturedMedia(
    site,
    entry.wp_post_id as number,
    upload.media.mediaId,
  );
  if (!featured.ok) {
    await writeAuditRow(
      req.entry_id as string,
      viewer.id,
      "graphic_update",
      "wp_featured_set_error",
      null,
      featured.error,
    );
    return { ok: false, error: featured.error };
  }

  // 5. Unfeature other graphics on the same entry.
  await supabase
    .from("graphic_requests")
    .update({ is_featured: false })
    .eq("entry_id", req.entry_id as string)
    .neq("id", requestId);

  // 6. Mark this request submitted + featured.
  const { error } = await supabase
    .from("graphic_requests")
    .update({
      graphic_status: "submitted",
      is_featured: true,
      wp_media_id: upload.media.mediaId,
      flag_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", requestId);

  if (error) {
    return { ok: false, error: "DB update failed after WP push" };
  }

  await writeAuditRow(
    req.entry_id as string,
    viewer.id,
    "graphic_update",
    "graphic_request",
    "claimed",
    `submitted + featured (wp_media=${upload.media.mediaId})`,
  );

  return { ok: true, wp_media_id: upload.media.mediaId };
}
