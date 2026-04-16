"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, FileText } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { useIsMobile } from "@/lib/hooks/use-is-mobile";
import type { AnalyticsArticleRow } from "@/lib/analytics/queries";

type Props = { query: string };
type SortKey = keyof Pick<
  AnalyticsArticleRow,
  "pageviews" | "sessions" | "earnings" | "page_rpm" | "avg_time_on_page"
>;

export function AnalyticsArticlesTab({ query }: Props) {
  const isMobile = useIsMobile();
  const [rows, setRows] = React.useState<AnalyticsArticleRow[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [sortKey, setSortKey] = React.useState<SortKey>("earnings");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("desc");

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/analytics/articles?${query}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json: { rows: AnalyticsArticleRow[] }) => {
        if (cancelled) return;
        setRows(json.rows);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  const sorted = React.useMemo(() => {
    if (!rows) return [];
    const out = [...rows];
    out.sort((a, b) => {
      const av = a[sortKey] as number;
      const bv = b[sortKey] as number;
      return sortDir === "desc" ? bv - av : av - bv;
    });
    return out;
  }, [rows, sortKey, sortDir]);

  if (loading && !rows) {
    return (
      <div className="h-96 animate-pulse rounded-md border border-border bg-card/60" />
    );
  }
  if (error) {
    return (
      <EmptyState
        icon={<FileText className="h-5 w-5" />}
        title="Failed to load articles"
        description={error}
      />
    );
  }
  if (!rows || rows.length === 0) {
    return (
      <EmptyState
        icon={<FileText className="h-5 w-5" />}
        title="No articles with data in this range"
        description="Upload a Raptive sheet or connect GA4 to start seeing rows here."
      />
    );
  }

  const totalEarnings = rows.reduce((acc, r) => acc + r.earnings, 0);
  const totalPageviews = rows.reduce((acc, r) => acc + r.pageviews, 0);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  if (isMobile) {
    return (
      <div className="space-y-2">
        {sorted.map((r) => (
          <div
            key={r.entry_id}
            className="rounded-lg border border-border bg-card p-3"
          >
            <div className="mb-2">
              <div className="font-medium text-sm text-text-primary leading-snug">
                {r.title}
              </div>
              <div className="text-[10px] text-text-muted mt-0.5">{r.authors}</div>
              <div className="flex items-center gap-2 mt-1">
                <Badge variant="outline" className="text-[10px]">
                  {r.site.toUpperCase()}
                </Badge>
                {r.tier_name && (
                  <span className="text-[10px] text-text-secondary">{r.tier_name}</span>
                )}
                {r.publish_date && (
                  <span className="text-[10px] text-text-muted">
                    {new Date(r.publish_date).toLocaleDateString()}
                  </span>
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-text-muted">Pageviews</span>
                <span className="tabular-nums text-text-primary">
                  {r.pageviews.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Sessions</span>
                <span className="tabular-nums text-text-primary">
                  {r.sessions.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Revenue</span>
                <span className="tabular-nums font-medium text-amber">
                  ${r.earnings.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-text-muted">Page RPM</span>
                <span className="tabular-nums text-text-secondary">
                  ${r.page_rpm.toFixed(2)}
                </span>
              </div>
            </div>
          </div>
        ))}
        <div className="rounded-lg border border-border bg-navy-3/40 px-3 py-2 text-xs font-semibold flex justify-between">
          <span className="text-text-muted">
            {rows.length} article{rows.length === 1 ? "" : "s"}
          </span>
          <span className="tabular-nums text-amber">${totalEarnings.toFixed(2)}</span>
        </div>
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card text-[10px] uppercase tracking-wide text-text-muted">
              <tr className="border-b border-border">
                <th className="px-3 py-2 text-left">Article</th>
                <th className="px-3 py-2 text-left">Site</th>
                <th className="px-3 py-2 text-left">Tier</th>
                <th className="px-3 py-2 text-left">Published</th>
                <SortableTh
                  label="Pageviews"
                  active={sortKey === "pageviews"}
                  dir={sortDir}
                  onClick={() => toggleSort("pageviews")}
                />
                <SortableTh
                  label="Sessions"
                  active={sortKey === "sessions"}
                  dir={sortDir}
                  onClick={() => toggleSort("sessions")}
                />
                <SortableTh
                  label="Avg Time"
                  active={sortKey === "avg_time_on_page"}
                  dir={sortDir}
                  onClick={() => toggleSort("avg_time_on_page")}
                />
                <SortableTh
                  label="Revenue"
                  active={sortKey === "earnings"}
                  dir={sortDir}
                  onClick={() => toggleSort("earnings")}
                />
                <SortableTh
                  label="Page RPM"
                  active={sortKey === "page_rpm"}
                  dir={sortDir}
                  onClick={() => toggleSort("page_rpm")}
                />
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr
                  key={r.entry_id}
                  className="border-b border-border/50 hover:bg-navy-3/20"
                >
                  <td className="px-3 py-2">
                    <div className="font-medium text-text-primary">{r.title}</div>
                    <div className="text-[10px] text-text-muted">{r.authors}</div>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className="text-[10px]">
                      {r.site.toUpperCase()}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 text-text-secondary">{r.tier_name}</td>
                  <td className="px-3 py-2 text-[11px] text-text-muted">
                    {r.publish_date
                      ? new Date(r.publish_date).toLocaleDateString()
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.pageviews.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.sessions.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-text-secondary">
                    {r.avg_time_on_page > 0
                      ? `${r.avg_time_on_page.toFixed(0)}s`
                      : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium text-amber">
                    ${r.earnings.toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-text-secondary">
                    ${r.page_rpm.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="bg-navy-3/40 text-xs font-semibold">
              <tr>
                <td colSpan={4} className="px-3 py-2 text-text-muted">
                  Totals across {rows.length} article{rows.length === 1 ? "" : "s"}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {totalPageviews.toLocaleString()}
                </td>
                <td colSpan={2} />
                <td className="px-3 py-2 text-right tabular-nums text-amber">
                  ${totalEarnings.toFixed(2)}
                </td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function SortableTh({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: "asc" | "desc";
  onClick: () => void;
}) {
  return (
    <th className="px-3 py-2 text-right">
      <button
        type="button"
        onClick={onClick}
        className={
          active
            ? "flex items-center gap-1 text-right text-cyan"
            : "flex items-center gap-1 text-right text-text-muted hover:text-text-primary"
        }
      >
        {label}
        {active ? (
          dir === "desc" ? (
            <ArrowDown className="h-3 w-3" />
          ) : (
            <ArrowUp className="h-3 w-3" />
          )
        ) : null}
      </button>
    </th>
  );
}
