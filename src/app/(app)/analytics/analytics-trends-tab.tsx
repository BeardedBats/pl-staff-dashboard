"use client";

import * as React from "react";
import { TrendingUp } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type {
  AnalyticsArticleRow,
  AnalyticsOverview,
} from "@/lib/analytics/queries";

type Props = { query: string };

/**
 * Trends tab — pulls both overview (daily series) and articles (for tier
 * comparison) to render time-series and tier-breakdown charts.
 */
export function AnalyticsTrendsTab({ query }: Props) {
  const [overview, setOverview] = React.useState<AnalyticsOverview | null>(null);
  const [articles, setArticles] = React.useState<AnalyticsArticleRow[] | null>(
    null,
  );
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      fetch(`/api/analytics/overview?${query}`).then((r) => r.json()),
      fetch(`/api/analytics/articles?${query}`).then((r) => r.json()),
    ])
      .then(([ov, art]: [
        { overview: AnalyticsOverview },
        { rows: AnalyticsArticleRow[] },
      ]) => {
        if (cancelled) return;
        setOverview(ov.overview);
        setArticles(art.rows);
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

  if (loading && !overview) {
    return (
      <div className="space-y-4">
        <div className="h-64 animate-pulse rounded-md border border-border bg-card/60" />
        <div className="h-64 animate-pulse rounded-md border border-border bg-card/60" />
      </div>
    );
  }
  if (error) {
    return (
      <EmptyState
        icon={<TrendingUp className="h-5 w-5" />}
        title="Failed to load trends"
        description={error}
      />
    );
  }
  if (!overview || !articles) return null;

  // Build tier rollup
  const tierAgg = new Map<
    string,
    { pageviews: number; earnings: number; articles: number }
  >();
  for (const r of articles) {
    const cur = tierAgg.get(r.tier_name) ?? {
      pageviews: 0,
      earnings: 0,
      articles: 0,
    };
    cur.pageviews += r.pageviews;
    cur.earnings += r.earnings;
    cur.articles += 1;
    tierAgg.set(r.tier_name, cur);
  }
  const tierData = Array.from(tierAgg.entries())
    .map(([tier, v]) => ({ tier, ...v }))
    .sort((a, b) => b.earnings - a.earnings);

  const hasDaily = overview.daily.length > 0;
  const hasTier = tierData.length > 0;

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Pageviews & revenue over time</CardTitle>
          <CardDescription>
            Daily totals across every article in range.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hasDaily ? (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={overview.daily}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="date" stroke="var(--color-text-muted)" fontSize={11} />
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
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Line
                    yAxisId="left"
                    type="monotone"
                    dataKey="pageviews"
                    stroke="var(--color-cyan)"
                    strokeWidth={2}
                    dot={false}
                    name="Pageviews"
                  />
                  <Line
                    yAxisId="right"
                    type="monotone"
                    dataKey="earnings"
                    stroke="var(--color-amber)"
                    strokeWidth={2}
                    dot={false}
                    name="Earnings"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              icon={<TrendingUp className="h-5 w-5" />}
              title="No daily data yet"
              description="Come back after a Raptive upload or GA4 sync."
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Revenue by tier</CardTitle>
          <CardDescription>
            Which tiers actually move the needle.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {hasTier ? (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={tierData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="tier" stroke="var(--color-text-muted)" fontSize={11} />
                  <YAxis
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
                    formatter={(v) => [`$${Number(v ?? 0).toFixed(2)}`, "Earnings"]}
                  />
                  <Bar dataKey="earnings" fill="var(--color-amber)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              icon={<TrendingUp className="h-5 w-5" />}
              title="No tier data yet"
              description="Tiers appear once articles have revenue attached."
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pageviews by tier</CardTitle>
          <CardDescription>Traffic distribution across content types.</CardDescription>
        </CardHeader>
        <CardContent>
          {hasTier ? (
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={tierData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="tier" stroke="var(--color-text-muted)" fontSize={11} />
                  <YAxis stroke="var(--color-cyan)" fontSize={11} />
                  <Tooltip
                    contentStyle={{
                      background: "var(--color-card)",
                      border: "1px solid var(--color-border)",
                      fontSize: 12,
                    }}
                    formatter={(v) => [Number(v ?? 0).toLocaleString(), "Pageviews"]}
                  />
                  <Bar dataKey="pageviews" fill="var(--color-cyan)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              icon={<TrendingUp className="h-5 w-5" />}
              title="No tier data yet"
              description="Upload data to populate tier comparisons."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
