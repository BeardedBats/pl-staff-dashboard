"use client";

import * as React from "react";
import { Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { EmptyState } from "@/components/ui/empty-state";
import type { AnalyticsWriterRow } from "@/lib/analytics/queries";

type Props = { query: string };

export function AnalyticsWritersTab({ query }: Props) {
  const [rows, setRows] = React.useState<AnalyticsWriterRow[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/analytics/writers?${query}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json: { rows: AnalyticsWriterRow[] }) => {
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

  if (loading && !rows) {
    return (
      <div className="h-96 animate-pulse rounded-md border border-border bg-card/60" />
    );
  }
  if (error) {
    return (
      <EmptyState
        icon={<Users className="h-5 w-5" />}
        title="Failed to load writers"
        description={error}
      />
    );
  }
  if (!rows || rows.length === 0) {
    return (
      <EmptyState
        icon={<Users className="h-5 w-5" />}
        title="No writer data in this range"
        description="Writer rollups appear once articles have tracked pageviews or revenue."
      />
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-card text-[10px] uppercase tracking-wide text-text-muted">
              <tr className="border-b border-border">
                <th className="px-3 py-2 text-left">Writer</th>
                <th className="px-3 py-2 text-right">Articles</th>
                <th className="px-3 py-2 text-right">Pageviews</th>
                <th className="px-3 py-2 text-right">Revenue</th>
                <th className="px-3 py-2 text-right">Revenue / Word</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.user_id}
                  className="border-b border-border/50 hover:bg-navy-3/20"
                >
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={r.avatar_url ?? undefined} alt={r.display_name} />
                        <AvatarFallback className="text-[10px]">
                          {r.display_name.slice(0, 2).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                      <span className="font-medium text-text-primary">
                        {r.display_name}
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.articles.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.pageviews.toLocaleString()}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums font-medium text-amber">
                    ${r.earnings.toFixed(2)}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-text-secondary">
                    ${r.revenue_per_word.toFixed(4)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}
