import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

export type EvergreenCandidate = {
  id: string;
  title: string;
  site: "pl" | "qb";
  wpPostUrl: string | null;
  publishedAt: string;
  wpModifiedAt: string;
};

export async function listEvergreenCandidates(
  now = new Date(),
  limit = 8,
): Promise<EvergreenCandidate[]> {
  const publishedBefore = new Date(now);
  publishedBefore.setUTCDate(publishedBefore.getUTCDate() - 365);
  const modifiedBefore = new Date(now);
  modifiedBefore.setUTCDate(modifiedBefore.getUTCDate() - 180);

  const { data, error } = await getSupabaseAdmin()
    .from("entries")
    .select("id, title, site, wp_post_url, published_at, wp_modified_at")
    .eq("is_archived", false)
    .not("wp_post_id", "is", null)
    .not("published_at", "is", null)
    .not("wp_modified_at", "is", null)
    .lte("published_at", publishedBefore.toISOString())
    .lte("wp_modified_at", modifiedBefore.toISOString())
    .order("wp_modified_at", { ascending: true })
    .limit(Math.max(1, Math.min(limit, 25)));
  if (error) return [];
  return (data ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    site: row.site as "pl" | "qb",
    wpPostUrl: row.wp_post_url,
    publishedAt: row.published_at!,
    wpModifiedAt: row.wp_modified_at!,
  }));
}
