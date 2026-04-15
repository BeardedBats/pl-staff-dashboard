import { NextResponse } from "next/server";
import { getCurrentUser, isAdminPlus } from "@/lib/auth/current-user";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

/**
 * GET /api/settings/wp-sync-status
 *
 * Returns the last-sync timestamps for PL and QB WordPress polls.
 * Admin+ only. Used by the Sync tab in Settings.
 */
export async function GET() {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  if (!isAdminPlus(viewer)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = getSupabaseAdmin();
  const { data } = await supabase
    .from("global_settings")
    .select("key, value")
    .in("key", ["wp_last_sync_pl", "wp_last_sync_qb"]);

  const rows = (data ?? []) as Array<{ key: string; value: unknown }>;
  const pl = rows.find((r) => r.key === "wp_last_sync_pl");
  const qb = rows.find((r) => r.key === "wp_last_sync_qb");

  return NextResponse.json({
    lastSync: {
      pl: (pl?.value as string | null) ?? null,
      qb: (qb?.value as string | null) ?? null,
    },
  });
}
