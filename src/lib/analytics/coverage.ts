import "server-only";
import { cache } from "react";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export function utcDays(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let day = Date.parse(`${from}T00:00:00Z`); day <= Date.parse(`${to}T00:00:00Z`); day += 86_400_000) {
    dates.push(new Date(day).toISOString().slice(0, 10));
  }
  return dates;
}

/** Presence is separate from reconciliation. Never interpret a failed probe as zero revenue. */
export async function missingRaptiveDates(site: "pl" | "qb", from: string, to: string) {
  const db = getSupabaseAdmin();
  const days = utcDays(from, to);
  const missing: string[] = [];
  for (let offset = 0; offset < days.length; offset += 8) {
    const batch = await Promise.all(days.slice(offset, offset + 8).map(async (date) => {
      const [raw, compact] = await Promise.all([
        db.from("raptive_revenue").select("date").eq("wp_site", site).eq("date", date).limit(1),
        db.from("raptive_history_daily").select("date").eq("wp_site", site).eq("date", date).limit(1),
      ]);
      if (raw.error || compact.error) throw new Error("Revenue coverage could not be checked");
      return raw.data?.length || compact.data?.length ? null : date;
    }));
    missing.push(...batch.filter((date): date is string => date !== null));
  }
  return missing;
}

export const getDataCoverage = cache(async () => {
  const db = getSupabaseAdmin();
  const to = new Date(Date.now() - 3 * 86_400_000).toISOString().slice(0, 10);
  const from = new Date(Date.now() - 60 * 86_400_000).toISOString().slice(0, 10);
  const [ga4, revenue] = await Promise.all([
    db.rpc("get_ga4_coverage_health"),
    missingRaptiveDates("pl", from, to).then(
      (missing) => ({ missing, error: false }),
      () => ({ missing: [] as string[], error: true }),
    ),
  ]);
  return {
    ga4: ga4.error ? null : ga4.data as { missingDays: number; latestDataDate: string | null; firstMissingDate: string | null; lastMissingDate: string | null },
    revenue: { ...revenue, from, to },
  };
});
