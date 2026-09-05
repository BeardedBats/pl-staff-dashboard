import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/current-user";
import { hasRoleForSite } from "@/lib/auth/authorization";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getGa4Status } from "@/lib/analytics/ga4";
import { getRaptiveLiveStatus } from "@/lib/analytics/raptive-live";
import { listRaptiveImportRuns, listRaptiveUploads } from "@/lib/analytics/raptive";
import { DataCoverage } from "@/components/analytics/data-coverage";
import { AdminAnalyticsPanel } from "../settings/admin-analytics-panel";
import { RecoveryActions } from "./recovery-actions";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableCaption } from "@/components/ui/table";

export const metadata = { title: "Connections" };

export default async function ConnectionsPage() {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login");
  if (!hasRoleForSite(viewer, "pl", "admin", "eic", "operations")) redirect("/my-tasks");
  const operations = hasRoleForSite(viewer, "pl", "operations");
  const analytics = hasRoleForSite(viewer, "pl", "eic", "operations");
  const db = getSupabaseAdmin();
  const backlog = await db.from("wp_sync_backlog")
    .select("wp_post_id,wp_author_id,first_seen_at,attempt_count", { count: "exact" })
    .eq("site", "pl").order("first_seen_at").limit(50);
  const [ga4, raptive, uploads, imports] = analytics ? await Promise.all([
    getGa4Status(), getRaptiveLiveStatus(), listRaptiveUploads(), listRaptiveImportRuns(),
  ]) : [null, null, [], []];
  return <div className="space-y-6">
    <header><h1 className="text-2xl font-semibold text-text-cell">Connections</h1>
      <p className="mt-1 max-w-2xl text-sm text-text-team">Check data coverage, repair missing articles, and manage Pitcher List analytics. A successful job does not guarantee complete data.</p></header>
    {analytics && <DataCoverage />}
    <section className="rounded-lg border border-border bg-card p-5" aria-labelledby="wp-recovery">
      <h2 id="wp-recovery" className="text-lg font-semibold text-text-cell">WordPress recovery</h2>
      <p className="mt-2 text-sm text-text-team">{backlog.error ? "The recovery queue could not load. Refresh to retry." : backlog.count === 0 ? "No posts are waiting for author mapping." : `${backlog.count ?? 0} ${backlog.count === 1 ? "post needs" : "posts need"} author mapping. Import the correct author account, then retry synchronization.`}</p>
      <Link href="/settings?tab=users" className="mt-3 inline-block text-sm text-cyan underline underline-offset-4">Manage staff and author accounts</Link>
      {operations && <RecoveryActions />}
      {!!backlog.data?.length && <div className="mt-4"><Table>
        <TableCaption>Oldest unresolved records. Showing up to 50.</TableCaption>
        <TableHeader><TableRow><TableHead>Post</TableHead><TableHead>WordPress author</TableHead><TableHead>Waiting since</TableHead><TableHead>Attempts</TableHead></TableRow></TableHeader>
        <TableBody>{backlog.data.map((row) => <TableRow key={row.wp_post_id}>
          <TableCell><a className="text-cyan underline" href={`https://pitcherlist.com/wp-admin/post.php?post=${row.wp_post_id}&action=edit`} target="_blank" rel="noreferrer">{row.wp_post_id}</a></TableCell>
          <TableCell>{row.wp_author_id}</TableCell><TableCell>{row.first_seen_at.slice(0, 10)}</TableCell><TableCell>{row.attempt_count.toLocaleString()}</TableCell>
        </TableRow>)}</TableBody></Table></div>}
    </section>
    {ga4 && raptive && <AdminAnalyticsPanel initialGa4Status={ga4}
      initialRaptiveStatus={{ ...raptive, connections: raptive.connections.filter((item) => item.wpSite === "pl") }}
      initialUploads={uploads} initialImportRuns={imports} initialOperationalHealth={null}
      canConnectGa4={operations} canManageRaptive={operations} />}
  </div>;
}
