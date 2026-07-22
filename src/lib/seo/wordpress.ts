import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getWordPressSiteConfig, wordPressBasicAuth, type WpSiteKey } from "@/lib/wordpress/config";
import { analyzeSeoDocument, scoreTitle } from "./analysis";

type WpSeoPost = {
  id: number;
  title: { raw?: string; rendered?: string } | string;
  content: { raw?: string; rendered?: string } | string;
  excerpt?: { raw?: string; rendered?: string } | string;
  modified_gmt: string;
  slug?: string;
  author?: number;
  categories?: number[];
  featured_media?: number;
  status?: string;
  date_gmt?: string | null;
  _embedded?: { author?: Array<{ name?: string }> };
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
  slug: string;
  imageAlts: string[];
  paragraphWordCounts: number[];
  wpModifiedAt: string;
  titleScore: ReturnType<typeof scoreTitle>;
  findings: ReturnType<typeof analyzeSeoDocument>;
  yoast: {
    title: string | null;
    description: string | null;
    canonical: string | null;
    robots: Record<string, string> | null;
    focusKeyphrase: string | null;
    writable: false;
  };
  readiness: Array<{ label: string; ready: boolean; detail: string }>;
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

function imageAlts(html: string): string[] {
  return Array.from(html.matchAll(/<img\b[^>]*>/gi)).map((match) =>
    match[0].match(/\balt=["']([^"']*)["']/i)?.[1] ?? "",
  );
}

function paragraphWordCounts(html: string): number[] {
  return Array.from(html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)).map(
    (match) => plainText(match[1]).split(/\s+/).filter(Boolean).length,
  );
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
    const response = await fetch(`${config.url}/wp-json/wp/v2/posts/${postId}?context=edit&_embed=author`, {
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
    slug: post.slug ?? "",
    imageAlts: imageAlts(html),
    paragraphWordCounts: paragraphWordCounts(html),
  };
  const scheduled = post.status === "future";
  const seoAvailable = Boolean(post.yoast_head_json || focusKeyphrase || metaDescription);
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
      writable: false,
    },
    readiness: [
      { label: "Author", ready: Boolean(post.author), detail: post._embedded?.author?.[0]?.name || (post.author ? `Assigned in WordPress (#${post.author})` : "Author missing") },
      { label: "Category", ready: Boolean(post.categories?.length), detail: post.categories?.length ? `${post.categories.length} assigned` : "Category missing" },
      { label: "Slug", ready: Boolean(post.slug), detail: post.slug || "Slug missing" },
      { label: "Excerpt", ready: Boolean(plainText(text(post.excerpt))), detail: plainText(text(post.excerpt)) ? "Present" : "Excerpt missing" },
      { label: "Featured image", ready: Boolean(post.featured_media), detail: post.featured_media ? "Assigned" : "Featured image missing" },
      { label: "Scheduled time", ready: !scheduled || Boolean(post.date_gmt), detail: scheduled ? (post.date_gmt ? `${post.date_gmt}Z` : "Scheduled time missing") : "Not a scheduled post" },
      { label: "Content", ready: contentText.split(/\s+/).filter(Boolean).length >= 100, detail: `${contentText.split(/\s+/).filter(Boolean).length} words available` },
      { label: "SEO data", ready: seoAvailable, detail: seoAvailable ? "Yoast data available" : "Yoast data unavailable" },
    ],
  };
}
