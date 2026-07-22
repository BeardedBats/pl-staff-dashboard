import { NextResponse } from "next/server";
import { apiError } from "@/lib/api/http";
import { env } from "@/lib/env";
import { findSystemUserId } from "@/lib/recurring-templates/generator";
import {
  beginWordPressSyncEvent,
  finishWordPressSyncEvent,
} from "@/lib/wp-sync/events";
import { syncWpPostsForSite } from "@/lib/wp-sync/posts";
import {
  verifyWordPressWebhookSignature,
  wordpressWebhookSchema,
} from "@/lib/wp-sync/webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const secret = env.WP_WEBHOOK_SECRET ?? "";
  if (!secret) {
    return apiError(503, "INTERNAL_ERROR", "WordPress webhook is not configured");
  }

  const rawBody = await request.text();
  if (rawBody.length > 8192) {
    return apiError(413, "BAD_REQUEST", "Webhook body is too large");
  }
  if (
    !verifyWordPressWebhookSignature(
      rawBody,
      request.headers.get("x-pl-signature"),
      secret,
    )
  ) {
    return apiError(401, "NOT_AUTHENTICATED", "Invalid webhook signature");
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody) as unknown;
  } catch {
    return apiError(400, "INVALID_JSON", "Invalid JSON body");
  }
  const parsed = wordpressWebhookSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, "VALIDATION_ERROR", "Invalid webhook payload");
  }

  const event = await beginWordPressSyncEvent({
    site: parsed.data.site,
    wpPostId: parsed.data.post_id,
    eventKey: parsed.data.event_id,
    source: "webhook",
  });
  if (!event.ok) return apiError(500, "INTERNAL_ERROR", event.error);
  if (!event.shouldProcess) {
    return NextResponse.json({
      ok: true,
      deduplicated: true,
      attempts: event.attemptCount,
    });
  }

  const systemUserId = await findSystemUserId();
  if (!systemUserId) {
    await finishWordPressSyncEvent(event.eventId, false, "No system user available");
    return apiError(500, "INTERNAL_ERROR", "WordPress sync is unavailable");
  }

  const report = await syncWpPostsForSite(parsed.data.site, systemUserId);
  const succeeded = report.errors.length === 0;
  const errorMessage = report.errors.map((item) => item.message).join("; ");
  const recorded = await finishWordPressSyncEvent(
    event.eventId,
    succeeded,
    succeeded ? undefined : errorMessage,
  );
  if (!recorded) {
    return apiError(500, "INTERNAL_ERROR", "Could not finish sync attempt");
  }
  if (!succeeded) {
    return apiError(502, "UPSTREAM_ERROR", "WordPress sync incomplete");
  }

  return NextResponse.json({
    ok: true,
    deduplicated: false,
    attempts: event.attemptCount,
    report,
  });
}
