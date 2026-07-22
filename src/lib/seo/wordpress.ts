import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { writeAuditRow } from "@/lib/entries/status-transitions";
import { getWordPressSiteConfig, wordPressBasicAuth, type WpSiteKey } from "@/lib/wordpress/config";
import { analyzeSeoDocument, scoreTitle } from "./analysis";

type WpSeoPost = {
  id: number;
  title: { raw?: string; rendered?: string } | string;
  content: { raw?: string; rendered?: string } | string;
  excerpt?: { raw?: string; rendered?: string } | string;
  modified_gmt: string;
  meta?: Record<string, unknown>;
  yoast_head_json?: {
    title?: string;
    description?: string;
    canonical?: string;
    robots?: Record<string, string>;
  };
};

export type SeoWorkspaceData = {
  title: string;
  contentText: string;
  headings: string[];
  focusKeyphrase: string;
  metaDescription: string;
  wpModifiedAt: string;
  titleScore: ReturnType<typeof scoreTitle>;
  findings: ReturnType<typeof analyzeSeoDocument>;
  yoast: {
    title: string | null;
    description: string | null;
    canonical: string | null;
    robots: Record<string, string> | null;
    focusKeyphrase: string | null;
    writable: true;
  };
};

function text(value: { raw?: string; rendered?: string } | string | undefined): string {
  if (typeof value === "string") return value;
  return value?.raw || value?.rendered || "";
}

function plainText(html: string): string {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function headings(html: string): string[] {
  return Array.from(html.matchAll(/<h[2-4]\b[^>]*>([\s\S]*?)<\/h[2-4]>/gi))
    .map((match) => plainText(match[1]))
    .filter(Boolean);
}

async function loadEntry(entryId: string) {
  const { data } = await getSupabaseAdmin()
    .from("entries")
    .select("id, site, title, wp_post_id, wp_modified_at, wp_sync_status")
    .eq("id", entryId)
    .maybeSingle();
  return data;
}

async function fetchPost(site: WpSiteKey, postId: number): Promise<WpSeoPost | null> {
  const config = getWordPressSiteConfig(site);
  if (!config) return null;
  try {
    const response = await fetch(`${config.url}/wp-json/wp/v2/posts/${postId}?context=edit`, {
      headers: {
        Authorization: wordPressBasicAuth(config.appUsername, config.appPassword),
        Accept: "application/json",
      },
      cache: "no-store",
    });
    return response.ok ? (await response.json()) as WpSeoPost : null;
  } catch {
    return null;
  }
}

export async function getSeoWorkspace(entryId: string): Promise<SeoWorkspaceData | null> {
  const entry = await loadEntry(entryId);
  if (!entry?.wp_post_id) return null;
  const post = await fetchPost(entry.site as WpSiteKey, entry.wp_post_id);
  if (!post) return null;
  const postTitle = plainText(text(post.title));
  const html = text(post.content);
  const contentText = plainText(html);
  const focusKeyphrase = typeof post.meta?._yoast_wpseo_focuskw === "string"
    ? post.meta._yoast_wpseo_focuskw
    : "";
  const metaDescription = post.yoast_head_json?.description
    ?? (typeof post.meta?._yoast_wpseo_metadesc === "string" ? post.meta._yoast_wpseo_metadesc : plainText(text(post.excerpt)));
  const document = {
    title: postTitle,
    contentText,
    headings: headings(html),
    focusKeyphrase,
    metaDescription,
  };
  return {
    ...document,
    wpModifiedAt: `${post.modified_gmt}Z`,
    titleScore: scoreTitle(postTitle, focusKeyphrase),
    findings: analyzeSeoDocument(document),
    yoast: {
      title: post.yoast_head_json?.title ?? null,
      description: post.yoast_head_json?.description ?? null,
      canonical: post.yoast_head_json?.canonical ?? null,
      robots: post.yoast_head_json?.robots ?? null,
      focusKeyphrase: focusKeyphrase || null,
      writable: true,
    },
  };
}

export async function applyApprovedSeoTitle(
  entryId: string,
  actorId: string,
  input: {
    title: string;
    focusKeyphrase: string;
    metaDescription: string;
    expectedWpModifiedAt: string;
  },
): Promise<{ ok: true; modifiedAt: string } | { ok: false; error: string; conflict?: boolean }> {
  const entry = await loadEntry(entryId);
  if (!entry?.wp_post_id) return { ok: false, error: "Entry has no WordPress post" };
  if (entry.wp_modified_at !== input.expectedWpModifiedAt) {
    return { ok: false, error: "The saved WordPress revision changed. Refresh analysis.", conflict: true };
  }
  const site = entry.site as WpSiteKey;
  const post = await fetchPost(site, entry.wp_post_id);
  if (!post) return { ok: false, error: "Could not read WordPress" };
  const liveModified = `${post.modified_gmt}Z`;
  if (liveModified !== input.expectedWpModifiedAt) {
    return { ok: false, error: "WordPress changed after analysis. Refresh before applying.", conflict: true };
  }

  const supabase = getSupabaseAdmin();
  const { data: lease } = await supabase
    .from("entries")
    .update({ wp_sync_status: "pending", wp_last_sync_error: "Approved SEO title write in progress" })
    .eq("id", entryId)
    .eq("wp_modified_at", input.expectedWpModifiedAt)
    .neq("wp_sync_status", "pending")
    .select("id")
    .maybeSingle();
  if (!lease) return { ok: false, error: "Another WordPress update is in progress", conflict: true };

  const config = getWordPressSiteConfig(site)!;
  let response: Response;
  try {
    response = await fetch(`${config.url}/wp-json/wp/v2/posts/${entry.wp_post_id}`, {
      method: "POST",
      headers: {
        Authorization: wordPressBasicAuth(config.appUsername, config.appPassword),
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title: input.title,
        meta: {
          _yoast_wpseo_focuskw: input.focusKeyphrase,
          _yoast_wpseo_title: input.title,
          _yoast_wpseo_metadesc: input.metaDescription,
        },
      }),
      cache: "no-store",
    });
  } catch {
    await supabase.from("entries").update({ wp_sync_status: "error", wp_last_sync_error: "Could not reach WordPress" }).eq("id", entryId);
    return { ok: false, error: "Could not reach WordPress" };
  }
  if (!response.ok) {
    const error = `WordPress title update failed (${response.status})`;
    await supabase.from("entries").update({ wp_sync_status: "error", wp_last_sync_error: error }).eq("id", entryId);
    return { ok: false, error };
  }
  const updated = (await response.json()) as { modified_gmt?: string };
  const modifiedAt = updated.modified_gmt ? `${updated.modified_gmt}Z` : liveModified;
  await supabase.from("entries").update({
    title: input.title,
    wp_synced_title: input.title,
    wp_modified_at: modifiedAt,
    wp_sync_status: "synced",
    wp_last_synced_at: new Date().toISOString(),
    wp_last_sync_error: null,
  }).eq("id", entryId).eq("wp_sync_status", "pending");
  await writeAuditRow(entryId, actorId, "field_edit", "seo_title", text(post.title), input.title);
  return { ok: true, modifiedAt };
}
