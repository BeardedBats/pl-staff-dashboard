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
  DayOfWeekHeatPoint,
  PublishToPeakPoint,
} from "@/lib/analytics/queries";

type Props = { query: string };

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * Trends tab — pulls both overview (daily series) and articles (for tier
 * comparison) to render time-series and tier-breakdown charts.
 */
export function AnalyticsTrendsTab({ query }: Props) {
  const [overview, setOverview] = React.useState<AnalyticsOverview | null>(null);
  const [articles, setArticles] = React.useState<AnalyticsArticleRow[] | null>(
    null,
  );
  const [curve, setCurve] = React.useState<PublishToPeakPoint[] | null>(null);
  const [heat, setHeat] = React.useState<DayOfWeekHeatPoint[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      fetch(`/api/analytics/overview?${query}`).then((r) => r.json()),
      fetch(`/api/analytics/articles?${query}`).then((r) => r.json()),
      fetch(`/api/analytics/publish-to-peak?${query}`).then((r) => r.json()),
    ])
      .then(([ov, art, ptp]: [
        { overview: AnalyticsOverview },
        { rows: AnalyticsArticleRow[] },
        { curve: PublishToPeakPoint[]; heat: DayOfWeekHeatPoint[] },
      ]) => {
        if (cancelled) return;
        setOverview(ov.overview);
        setArticles(art.rows);
        setCurve(ptp.curve);
        setHeat(ptp.heat);
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
            <div className="h-64 w-full font-data">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={overview.daily}>
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
            <div className="h-64 w-full font-data">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={tierData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="tier" stroke="var(--color-text-zero)" fontSize={11} />
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
            <div className="h-64 w-full font-data">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={tierData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="tier" stroke="var(--color-text-zero)" fontSize={11} />
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

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Publish-to-peak curve</CardTitle>
          <CardDescription>
            Average pageviews per article on each day after publish.
            Reveals the natural decay shape across the filtered set.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PublishToPeakChart curve={curve} />
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>Pageviews heatmap</CardTitle>
          <CardDescription>
            Pageviews bucketed by week × day-of-week. Spot weekday vs
            weekend patterns. Darker cyan = more traffic.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <DayOfWeekHeatmap heat={heat} />
        </CardContent>
      </Card>
    </div>
  );
}

// --------------------------------------------------------------------------
// Publish-to-peak chart
// --------------------------------------------------------------------------

function PublishToPeakChart({ curve }: { curve: PublishToPeakPoint[] | null }) {
  if (!curve || curve.length === 0 || curve.every((p) => p.avgPageviews === 0)) {
    return (
      <EmptyState
        icon={<TrendingUp className="h-5 w-5" />}
        title="No curve data"
        description="Need articles with both a publish_date and GA4 pageviews to populate this."
      />
    );
  }
  return (
    <div className="h-72 w-full font-data">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={curve}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
          <XAxis
            dataKey="day"
            stroke="var(--color-text-zero)"
            fontSize={11}
            label={{
              value: "Days since publish",
              position: "insideBottom",
              offset: -5,
              fill: "var(--color-text-zero)",
              fontSize: 10,
            }}
          />
          <YAxis stroke="var(--color-cyan)" fontSize={11} />
          <Tooltip
            contentStyle={{
              background: "var(--color-card)",
              border: "1px solid var(--color-border)",
              fontSize: 12,
            }}
            formatter={(value, _name, item) => {
              const v = Number(value ?? 0);
              const articleCount = (
                item as { payload?: { articleCount?: number } }
              )?.payload?.articleCount;
              return [
                `${v.toFixed(0)} avg (${articleCount ?? 0} articles)`,
                "Pageviews",
              ];
            }}
            labelFormatter={(label) => `Day ${label}`}
          />
          <Line
            type="monotone"
            dataKey="avgPageviews"
            stroke="var(--color-cyan)"
            strokeWidth={2}
            dot={false}
            name="Avg pageviews"
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// --------------------------------------------------------------------------
// Day-of-week heatmap (CSS grid, no Recharts)
// --------------------------------------------------------------------------

function DayOfWeekHeatmap({ heat }: { heat: DayOfWeekHeatPoint[] | null }) {
  if (!heat || heat.length === 0) {
    return (
      <EmptyState
        icon={<TrendingUp className="h-5 w-5" />}
        title="No heatmap data"
        description="Come back after a GA4 sync — daily pageviews drive this grid."
      />
    );
  }

  // Group by week
  const byWeek = new Map<string, Map<number, number>>(); // weekStart → dow → pageviews
  let maxPv = 0;
  for (const p of heat) {
    const row = byWeek.get(p.weekStart) ?? new Map<number, number>();
    row.set(p.dayOfWeek, p.pageviews);
    byWeek.set(p.weekStart, row);
    if (p.pageviews > maxPv) maxPv = p.pageviews;
  }
  const weeks = Array.from(byWeek.entries()).sort(([a], [b]) =>
    a.localeCompare(b),
  );

  // Helper: interpolate cyan opacity by relative intensity
  function cellStyle(
    pv: number,
  ): React.CSSProperties & { "--plpd-heat-opacity"?: string } {
    if (pv === 0 || maxPv === 0) {
      return {};
    }
    const t = pv / maxPv;
    // Min 0.1 so non-zero cells are visibly different from zero
    const opacity = 0.1 + t * 0.9;
    return {
      "--plpd-heat-opacity": opacity.toFixed(3),
      color: t > 0.6 ? "var(--color-surface-1)" : "var(--color-text-team)",
    };
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[480px]">
        {/* Header row */}
        <div className="grid grid-cols-[80px_repeat(7,_minmax(0,_1fr))] gap-1 font-data text-[10px] uppercase tracking-wide text-text-zero">
          <div />
          {DOW_LABELS.map((d) => (
            <div key={d} className="px-1 py-0.5 text-center">
              {d}
            </div>
          ))}
        </div>
        {/* Body rows */}
        <div className="mt-1 space-y-1">
          {weeks.map(([weekStart, row]) => {
            const label = new Date(`${weekStart}T00:00:00Z`).toLocaleDateString(
              undefined,
              { month: "short", day: "numeric" },
            );
            return (
              <div
                key={weekStart}
                className="grid grid-cols-[80px_repeat(7,_minmax(0,_1fr))] gap-1"
              >
                <div className="px-1 py-1.5 text-[10px] text-text-zero">
                  Wk of {label}
                </div>
                {Array.from({ length: 7 }).map((_, dow) => {
                  const pv = row.get(dow) ?? 0;
                  return (
                    <div
                      key={dow}
                      className="plpd-heat-cell flex h-7 items-center justify-center rounded font-data text-[10px] tabular-nums"
                      data-has-value={pv > 0 && maxPv > 0}
                      style={cellStyle(pv)}
                      title={`${DOW_LABELS[dow]}: ${pv.toLocaleString()} pageviews`}
                    >
                      {pv > 0 ? pv.toLocaleString() : "—"}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
