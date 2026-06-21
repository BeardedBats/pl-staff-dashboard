"use client";

import * as React from "react";
import { DollarSign, Eye, FileText, Gauge, TrendingUp, Users } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { AnalyticsOverview } from "@/lib/analytics/queries";

type Props = { query: string };

export function AnalyticsOverviewTab({ query }: Props) {
  const [data, setData] = React.useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/analytics/overview?${query}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((json: { overview: AnalyticsOverview }) => {
        if (cancelled) return;
        setData(json.overview);
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

  if (loading && !data) {
    return <OverviewSkeleton />;
  }
  if (error) {
    return (
      <EmptyState
        icon={<TrendingUp className="h-5 w-5" />}
        title="Failed to load overview"
        description={error}
      />
    );
  }
  if (!data) return null;

  const hasData = data.articlesCount > 0 || data.daily.length > 0;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <MetricCard
          label="Articles"
          value={data.articlesCount.toLocaleString()}
          icon={<FileText className="h-4 w-4" />}
          hint="Entries with data in range"
        />
        <MetricCard
          label="Pageviews"
          value={data.totalPageviews.toLocaleString()}
          icon={<Eye className="h-4 w-4" />}
          hint="Total across all articles"
        />
        <MetricCard
          label="Sessions"
          value={data.totalSessions.toLocaleString()}
          icon={<Users className="h-4 w-4" />}
        />
        <MetricCard
          label="Revenue"
          value={`$${data.totalEarnings.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`}
          icon={<DollarSign className="h-4 w-4" />}
          hint="From Raptive"
        />
        <MetricCard
          label="Page RPM"
          value={`$${data.avgPageRpm.toFixed(2)}`}
          icon={<Gauge className="h-4 w-4" />}
          hint="Revenue per 1k pageviews"
        />
        <MetricCard
          label="Session RPM"
          value={`$${data.avgRpm.toFixed(2)}`}
          icon={<Gauge className="h-4 w-4" />}
          hint="Revenue per 1k sessions"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Daily trend</CardTitle>
        </CardHeader>
        <CardContent>
          {hasData ? (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.daily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="date" stroke="var(--color-text-zero)" fontSize={11} />
                  <YAxis
                    yAxisId="left"
                    stroke="var(--color-cyan)"
                    fontSize={11}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke="var(--color-amber)"
                    fontSize={11}
                    tickFormatter={(v) => `$${v}`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      fontSize: 12,
                    }}
                    formatter={(value, name) => {
                      const num = Number(value ?? 0);
                      if (name === "earnings")
                        return [`$${num.toFixed(2)}`, "Earnings"];
                      return [num.toLocaleString(), "Pageviews"];
                    }}
                  />
                  <Area
                    yAxisId="left"
                    type="monotone"
                    dataKey="pageviews"
                    stroke="var(--color-cyan)"
                    fill="var(--color-cyan)"
                    fillOpacity={0.15}
                  />
                  <Area
                    yAxisId="right"
                    type="monotone"
                    dataKey="earnings"
                    stroke="var(--color-amber)"
                    fill="var(--color-amber)"
                    fillOpacity={0.1}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              icon={<TrendingUp className="h-5 w-5" />}
              title="No data in this range"
              description="Upload a Raptive sheet or wait for tonight's GA4 sync."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon,
  hint,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  hint?: string;
}) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 py-4">
        <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-zero">
          {icon}
          {label}
        </div>
        <div className="text-xl font-semibold text-text-cell tabular-nums">
          {value}
        </div>
        {hint ? <div className="text-[10px] text-text-zero">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div
            key={i}
            className="h-20 animate-pulse rounded-md border border-border bg-card/60"
          />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-md border border-border bg-card/60" />
    </div>
  );
}
