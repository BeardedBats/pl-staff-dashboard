"use client";

import * as React from "react";
import Link from "next/link";
import {
  Activity,
  AlertOctagon,
  Calendar,
  CheckCircle2,
  DollarSign,
  Eye,
  GitBranch,
  Hand,
  Inbox,
  Palette,
  Send,
  TriangleAlert,
} from "lucide-react";
import { Line, LineChart, ResponsiveContainer } from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { RESPONSIVE_CHART_INITIAL_DIMENSION } from "@/lib/design/chart";
import { WidgetShell } from "./widget-shell";
import { EntryList } from "./entry-list";
import type { HomeEntryCard, PipelineHealth, WpSyncHealth } from "@/lib/home/widgets";

type MiniAnalytics = {
  pageviews: number;
  revenue: number;
  daily: Array<{ date: string; pageviews: number; revenue: number }>;
};

export function PipelineHealthWidget({ health }: { health: PipelineHealth }) {
  const rows: Array<{
    label: string;
    count: number;
    icon: React.ReactNode;
    color: string;
    href?: string;
  }> = [
    {
      label: "Writer needed",
      count: health.writerNeeded,
      icon: <Hand className="h-3.5 w-3.5" />,
      color: "text-amber",
      href: "/content?status=writer_needed",
    },
    {
      label: "Claimed",
      count: health.claimed,
      icon: <Inbox className="h-3.5 w-3.5" />,
      color: "text-text-cell",
      href: "/content?status=claimed",
    },
    {
      label: "Ready for edit",
      count: health.readyForEdit,
      icon: <Send className="h-3.5 w-3.5" />,
      color: "text-cyan",
      href: "/editing-queue",
    },
    {
      label: "Polishing",
      count: health.polishing,
      icon: <Activity className="h-3.5 w-3.5" />,
      color: "text-amber",
      href: "/content?status=polishing",
    },
    {
      label: "Scheduled",
      count: health.scheduled,
      icon: <Calendar className="h-3.5 w-3.5" />,
      color: "text-cyan",
      href: "/calendar",
    },
    {
      label: "Published (7d)",
      count: health.publishedThisWeek,
      icon: <CheckCircle2 className="h-3.5 w-3.5" />,
      color: "text-cyan",
    },
  ];

  return (
    <WidgetShell
      title="Pipeline health"
      description="Live counts across every track."
      icon={<GitBranch className="h-4 w-4 text-cyan" />}
      seeMoreHref="/content"
    >
      <div className="grid gap-2 sm:grid-cols-2">
        {rows.map((r) => {
          const inner = (
            <div className="flex items-center gap-2 rounded-md border border-border bg-card/60 px-3 py-2 text-xs">
              <span className={r.color}>{r.icon}</span>
              <span className="flex-1 text-text-team">{r.label}</span>
              <span className="font-data font-semibold tabular-nums text-text-cell">
                {r.count}
              </span>
            </div>
          );
          return r.href ? (
            <Link key={r.label} href={r.href} className="hover:opacity-80">
              {inner}
            </Link>
          ) : (
            <div key={r.label}>{inner}</div>
          );
        })}
      </div>

      {(health.gateBlocked > 0 || health.drafted > 0) ? (
        <div className="mt-2 space-y-1.5">
          {health.gateBlocked > 0 ? (
            <Link
              href="/content?status=submitted"
              className="flex items-center gap-2 rounded-md border border-amber/40 bg-amber/5 px-3 py-2 text-xs text-amber hover:bg-amber/10"
            >
              <TriangleAlert className="h-3.5 w-3.5" />
              <span className="flex-1">
                {health.gateBlocked} edited but not scheduled
              </span>
              <span className="font-data font-semibold tabular-nums">
                {health.gateBlocked}
              </span>
            </Link>
          ) : null}
          {health.drafted > 0 ? (
            <Link
              href="/content?drafts=true"
              className="flex items-center gap-2 rounded-md border border-border bg-card/60 px-3 py-2 text-xs text-text-team hover:bg-surface-3/30"
            >
              <AlertOctagon className="h-3.5 w-3.5" />
              <span className="flex-1">
                {health.drafted} drafted entries waiting
              </span>
            </Link>
          ) : null}
        </div>
      ) : null}
    </WidgetShell>
  );
}

export function WpSyncHealthWidget({ health }: { health: WpSyncHealth }) {
  const now = new Date();
  function staleness(iso: string | null): {
    label: string;
    kind: "fresh" | "aging" | "stale" | "unknown";
  } {
    if (!iso) return { label: "never", kind: "unknown" };
    const d = new Date(iso);
    const min = Math.round((now.getTime() - d.getTime()) / 60000);
    if (min < 10) return { label: `${min}m ago`, kind: "fresh" };
    if (min < 60) return { label: `${min}m ago`, kind: "aging" };
    if (min < 240) return { label: `${Math.round(min / 60)}h ago`, kind: "aging" };
    return {
      label: `${Math.round(min / 60)}h ago`,
      kind: "stale",
    };
  }
  const plS = staleness(health.pl);
  const qbS = staleness(health.qb);

  function badge(kind: ReturnType<typeof staleness>["kind"]) {
    if (kind === "fresh")
      return "border-cyan/40 text-cyan";
    if (kind === "aging") return "border-amber/40 text-amber";
    if (kind === "stale") return "border-destructive/40 text-destructive";
    return "";
  }

  return (
    <WidgetShell
      title="WordPress sync"
      description="Last poll from each WP site."
      icon={<Activity className="h-4 w-4 text-cyan" />}
    >
      <dl className="space-y-2 text-xs">
        <div className="flex items-center justify-between rounded-md border border-border bg-card/60 px-3 py-2">
          <dt className="text-text-zero">Pitcher List</dt>
          <dd>
            <Badge variant="outline" className={badge(plS.kind)}>
              {plS.label}
            </Badge>
          </dd>
        </div>
        <div className="flex items-center justify-between rounded-md border border-border bg-card/60 px-3 py-2">
          <dt className="text-text-zero">QB List</dt>
          <dd>
            <Badge variant="outline" className={badge(qbS.kind)}>
              {qbS.label}
            </Badge>
          </dd>
        </div>
      </dl>
    </WidgetShell>
  );
}

export function AnalyticsMiniWidget({ data }: { data: MiniAnalytics }) {
  const hasData = data.daily.length > 0;
  return (
    <WidgetShell
      title="Last 7 days"
      description="Pageviews and Raptive revenue across every article."
      icon={<Eye className="h-4 w-4 text-cyan" />}
      seeMoreHref="/analytics"
      seeMoreLabel="Full analytics"
    >
      {hasData ? (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <Card>
              <CardContent className="flex flex-col gap-0.5 py-3">
                <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-text-zero">
                  <Eye className="h-3 w-3" />
                  Pageviews
                </div>
                <div className="font-data text-lg font-semibold tabular-nums text-text-cell">
                  {data.pageviews.toLocaleString()}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="flex flex-col gap-0.5 py-3">
                <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-text-zero">
                  <DollarSign className="h-3 w-3" />
                  Revenue
                </div>
                <div className="font-data text-lg font-semibold tabular-nums text-text-cell">
                  ${data.revenue.toFixed(2)}
                </div>
              </CardContent>
            </Card>
          </div>
          <div className="h-16 w-full font-data">
            <ResponsiveContainer
              width="100%"
              height="100%"
              minWidth={0}
              initialDimension={RESPONSIVE_CHART_INITIAL_DIMENSION}
            >
              <LineChart data={data.daily}>
                <Line
                  type="monotone"
                  dataKey="pageviews"
                  stroke="var(--color-cyan)"
                  strokeWidth={2}
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      ) : (
        <EmptyState
          icon={<Eye className="h-5 w-5" />}
          title="No data yet"
          description="Upload a Raptive sheet or connect GA4 to populate this."
        />
      )}
    </WidgetShell>
  );
}

export function StaleEntriesWidget({
  entries,
}: {
  entries: HomeEntryCard[];
}) {
  if (entries.length === 0) return null;
  return (
    <WidgetShell
      title="Stale — no activity in 7 days"
      description="Might need a nudge or to be archived."
      icon={<Palette className="h-4 w-4 text-amber" />}
      count={entries.length}
    >
      <EntryList
        entries={entries}
        flagOverdue
        emptyIcon={<CheckCircle2 className="h-5 w-5" />}
        emptyTitle="Nothing stale"
      />
    </WidgetShell>
  );
}
