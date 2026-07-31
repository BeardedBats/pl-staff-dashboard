"use client";

import * as React from "react";
import {
  DollarSign,
  Eye,
  FileText,
  TrendingUp,
  Users,
} from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import type { AnalyticsOverview } from "@/lib/analytics/queries";
import { RESPONSIVE_CHART_INITIAL_DIMENSION } from "@/lib/design/chart";

type Props = { query: string };

export function AnalyticsOverviewTab({ query }: Props) {
  const [data, setData] = React.useState<AnalyticsOverview | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [reloadKey, setReloadKey] = React.useState(0);

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
  }, [query, reloadKey]);

  if (loading && !data) {
    return <OverviewSkeleton />;
  }
  if (error) {
    return (
      <EmptyState
        icon={<TrendingUp className="h-5 w-5" />}
        title="Failed to load overview"
        description={error}
        action={
          <Button size="sm" onClick={() => setReloadKey((key) => key + 1)}>
            Retry
          </Button>
        }
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
          label="Site revenue"
          value={`$${data.totalEarnings.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`}
          icon={<DollarSign className="h-4 w-4" />}
          hint="All Raptive URLs"
        />
        <MetricCard
          label="Attributed revenue"
          value={`$${data.attributedEarnings.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 2 })}`}
          icon={<DollarSign className="h-4 w-4" />}
          hint="Matched to filtered entries"
        />
        <MetricCard
          label="Attribution"
          value={`${(data.attributionRate * 100).toFixed(1)}%`}
          icon={<TrendingUp className="h-4 w-4" />}
          hint={`$${data.unattributedEarnings.toFixed(2)} not attributed`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Daily trend</CardTitle>
        </CardHeader>
        <CardContent>
          {hasData ? (
            <div
              className="h-64 w-full font-data"
              role="img"
              aria-label="Daily pageviews and actual total Raptive site revenue"
            >
              <ResponsiveContainer
                width="100%"
                height="100%"
                minWidth={0}
                initialDimension={RESPONSIVE_CHART_INITIAL_DIMENSION}
              >
                <AreaChart data={data.daily}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--color-border)"
                  />
                  <XAxis
                    dataKey="date"
                    stroke="var(--color-text-zero)"
                    fontSize={14}
                  />
                  <YAxis
                    yAxisId="left"
                    stroke="var(--color-cyan)"
                    fontSize={14}
                  />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    stroke="var(--color-amber)"
                    fontSize={14}
                    tickFormatter={(v) => `$${v}`}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      fontSize: 14,
                    }}
                    formatter={(value, name) => {
                      const num = Number(value ?? 0);
                      if (name === "siteEarnings")
                        return [`$${num.toFixed(2)}`, "Site revenue"];
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
                    dataKey="siteEarnings"
                    stroke="var(--color-amber)"
                    fill="var(--color-amber)"
                    fillOpacity={0.1}
                  />
                </AreaChart>
              </ResponsiveContainer>
              <dl className="sr-only">
                {data.daily.map((point) => (
                  <div key={point.date}>
                    <dt>{point.date}</dt>
                    <dd>
                      {point.pageviews} pageviews; ${point.siteEarnings.toFixed(2)} site
                      revenue; ${point.earnings.toFixed(2)} attributed revenue
                    </dd>
                  </div>
                ))}
              </dl>
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
        <div className="font-data text-xl font-semibold text-text-cell tabular-nums">
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
