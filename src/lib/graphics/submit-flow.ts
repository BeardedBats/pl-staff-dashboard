import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { writeAuditRow } from "@/lib/entries/status-transitions";
import { triggerGraphicSubmitted } from "@/lib/notifications/trigger";
import { downloadGraphicBytes } from "./storage";
import { uploadMediaToWp, setFeaturedMedia } from "./wp-media";
import type { CurrentUser } from "@/lib/auth/current-user";
import type { WpSiteKey } from "@/lib/auth/wordpress";
import {
  canFlagGraphicResource,
  loadEntryAuthorizationContext,
} from "@/lib/auth/authorization";

/**
 * Submit a graphic request — the terminal "this is the final image" action.
 *
 * Preconditions:
 *  - Request must have a durable current version and private storage metadata
 *  - Request must not already be in `submitted` or `flagged` state
 *  - The parent entry must have a wp_post_id (i.e. a WP draft exists)
 *
 * Side effects, in order:
 *  1. Reuse a checkpointed WordPress media ID, or download and upload bytes.
 *  2. Persist a newly-created media ID before setting featured media so a
 *     retry skips the WordPress upload.
 *  3. POST the media ID to WP as the post's featured_media.
 *  4. Atomically mark this request submitted/featured, clear the prior
 *     featured marker, and write the audit row.
 *
 * A short database lease prevents duplicate concurrent WordPress uploads.
 * Failures release that lease while preserving both the private version and
 * any successfully-created WP media ID for an idempotent retry.
 */

export type SubmitResult =
  | { ok: true; wp_media_id: number }
  | {
      ok: false;
      kind: "not_found" | "forbidden" | "conflict" | "upstream" | "database";
      error: string;
    };

export async function submitGraphicRequest(
  viewer: CurrentUser,
  requestId: string,
): Promise<SubmitResult> {
  const supabase = getSupabaseAdmin();

  // Load enough request context to enforce the site-scoped authorization
  // boundary before acquiring the submission lease.
  const { data: req } = await supabase
    .from("graphic_requests")
    .select("id, entry_id, review_submitted_at")
    .eq("id", requestId)
    .maybeSingle();

  if (!req) return { ok: false, kind: "not_found", error: "Request not found" };
  const authorization = await loadEntryAuthorizationContext(
    req.entry_id as string,
  );
  if (
    !authorization ||
    !canFlagGraphicResource(viewer, authorization)
  ) {
    return {
      ok: false,
      kind: "forbidden",
      error: "An entry participant or manager must approve this graphic",
    };
  }
  if (!req.review_submitted_at) {
    return {
      ok: false,
      kind: "conflict",
      error: "The graphics worker must submit a version for review first",
    };
  }

  const { data: lease, error: leaseError } = await supabase
    .rpc("begin_graphic_submission", {
      p_actor_id: viewer.id,
      p_request_id: requestId,
      p_allow_override: true,
    })
    .single();
  if (leaseError || !lease) {
    if (leaseError?.code === "P0002") {
      return { ok: false, kind: "not_found", error: "Request not found" };
    }
    if (leaseError?.code === "42501") {
      return {
        ok: false,
        kind: "forbidden",
        error: "An entry participant or manager must approve this graphic",
      };
    }
    if (leaseError?.code === "P0001") {
      return {
        ok: false,
        kind: "conflict",
        error: "This graphic is not ready to submit or is already being submitted",
      };
    }
    return {
      ok: false,
      kind: "database",
      error: "Could not start graphic submission",
    };
  }

  const releaseLease = async () => {
    await supabase.rpc("release_graphic_submission", {
      p_request_id: requestId,
      p_submission_token: lease.lease_token,
    });
  };

  const { data: entry } = await supabase
    .from("entries")
    .select("id, site, wp_post_id, wp_post_url")
    .eq("id", lease.leased_entry_id)
    .maybeSingle();
  if (!entry) {
    await releaseLease();
    return { ok: false, kind: "not_found", error: "Parent entry not found" };
  }
  if (!entry.wp_post_id) {
    await releaseLease();
    return {
      ok: false,
      kind: "conflict",
      error:
        "The parent entry has no WordPress draft yet. Approve a writer claim first so the draft gets created.",
    };
  }

  const site = (entry.site as WpSiteKey) ?? "pl";

  let mediaId = lease.existing_wp_media_id;
  if (!mediaId) {
    const download = await downloadGraphicBytes(lease.leased_storage_path);
    if (!download.ok) {
      await releaseLease();
      return {
        ok: false,
        kind: "upstream",
        error: `Download failed: ${download.error}`,
      };
    }

    const upload = await uploadMediaToWp(site, {
      fileName: lease.leased_file_name,
      mimeType: lease.leased_mime_type,
      bytes: download.bytes,
    });
    if (!upload.ok) {
      await writeAuditRow(
        lease.leased_entry_id,
        viewer.id,
        "graphic_update",
        "wp_media_upload_error",
        null,
        upload.error,
      );
      await releaseLease();
      return { ok: false, kind: "upstream", error: upload.error };
    }
    mediaId = upload.media.mediaId;

    const { error: recordError } = await supabase.rpc(
      "record_graphic_wp_media",
      {
        p_request_id: requestId,
        p_submission_token: lease.lease_token,
        p_wp_media_id: mediaId,
      },
    );
    if (recordError) {
      await releaseLease();
      return {
        ok: false,
        kind: "database",
        error: "Failed to save WordPress media state",
      };
    }
  }

  // 4. Set as featured media on the post.
  const featured = await setFeaturedMedia(
    site,
    entry.wp_post_id as number,
    mediaId,
  );
  if (!featured.ok) {
    await writeAuditRow(
      lease.leased_entry_id,
      viewer.id,
      "graphic_update",
      "wp_featured_set_error",
      null,
      featured.error,
    );
    await releaseLease();
    return { ok: false, kind: "upstream", error: featured.error };
  }

  const { data: completedMediaId, error: completeError } = await supabase.rpc(
    "complete_graphic_submission",
    {
      p_actor_id: viewer.id,
      p_request_id: requestId,
      p_submission_token: lease.lease_token,
    },
  );
  if (completeError || !completedMediaId) {
    await releaseLease();
    return {
      ok: false,
      kind: "database",
      error: "DB update failed after WordPress push",
    };
  }

  // Notify the writer + entry creator that the graphic is live.
  const { data: parentEntry } = await supabase
    .from("entries")
    .select("title")
    .eq("id", lease.leased_entry_id)
    .maybeSingle();
  await triggerGraphicSubmitted(
    viewer,
    lease.leased_entry_id,
    (parentEntry?.title as string | undefined) ?? "an entry",
    lease.graphic_title,
  );

  return { ok: true, wp_media_id: completedMediaId };
}
