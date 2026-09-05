import Link from "next/link";
import { getDataCoverage } from "@/lib/analytics/coverage";

export async function DataCoverage() {
  const { ga4, revenue } = await getDataCoverage();
  const incomplete = !ga4 || ga4.missingDays > 0 || revenue.error || revenue.missing.length > 0;
  return <section aria-label="Analytics data coverage" className={`rounded-lg border p-4 text-sm ${incomplete ? "border-amber/40 bg-amber/5" : "border-border bg-card"}`}>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="font-semibold text-text-cell">{incomplete ? "Data needs attention" : "Recent date coverage checked"}</h2>
      <Link href="/connections" className="text-cyan underline underline-offset-4">Review connections</Link>
    </div>
    <p className="mt-2 text-text-team">{ga4 ? `GA4: ${ga4.missingDays} missing days in the last 90 days. Latest traffic: ${ga4.latestDataDate ?? "none"}.` : "GA4 coverage is unavailable."}</p>
    <p className="mt-1 text-text-team">{revenue.error ? "Revenue coverage is unavailable." : `Raptive: ${revenue.missing.length} missing days from ${revenue.from} to ${revenue.to}.`}</p>
    {incomplete && <p className="mt-2 font-medium text-amber">Totals are incomplete. Missing dates are not zero activity. Do not use these reports for final accounting.</p>}
  </section>;
}
