import Link from "next/link";
import { AlertTriangle, CalendarDays, ClipboardCheck, Gauge } from "lucide-react";
import type { CapacitySummary, PipelineHealth } from "@/lib/home/widgets";
import type { ManagerSignals, WeeklyOperationalDigest } from "@/lib/home/manager-operations";
import { WidgetShell } from "./widget-shell";

export function ManagerControlCenter({
  health,
  signals,
  pendingApprovals,
  capacity,
}: {
  health: PipelineHealth;
  signals: ManagerSignals;
  pendingApprovals: number;
  capacity: CapacitySummary | null;
}) {
  const risks = [
    { label: "Pending decisions", count: pendingApprovals, href: "#manager-inbox" },
    { label: "Overdue", count: signals.overdue, href: "/content?sortBy=publish_date&sortDir=asc" },
    { label: "Writer gaps", count: health.writerNeeded, href: "/content?status=writer_needed" },
    { label: "Stale work", count: signals.stale, href: "/content?sortBy=updated_at&sortDir=asc" },
  ];

  return (
    <WidgetShell
      title="Manager control center"
      description="Decisions and delivery risks across your authorized sites."
      icon={<Gauge className="h-4 w-4 text-cyan" />}
    >
      <div className="grid gap-2 sm:grid-cols-2">
        {risks.map((risk) => (
          <Link
            key={risk.label}
            href={risk.href}
            className="flex items-center justify-between rounded-md border border-border bg-card/60 px-3 py-2 text-xs hover:bg-surface-3/30"
          >
            <span className="text-text-team">{risk.label}</span>
            <span className={risk.count > 0 ? "font-data font-semibold text-amber" : "font-data text-cyan"}>
              {risk.count}
            </span>
          </Link>
        ))}
      </div>
      {capacity ? (
        <div className="mt-2 rounded-md border border-border bg-card/60 px-3 py-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
            <span className="font-medium text-text-cell">Self-reported capacity</span>
            <span className="text-cyan">{capacity.available} available</span>
            <span className="text-amber">{capacity.limited} limited</span>
            <span className="text-text-zero">{capacity.unavailable} unavailable</span>
          </div>
          <p className="mt-1 text-[10px] text-text-zero">
            Staff choose these signals themselves; no productivity or activity score is used.
          </p>
        </div>
      ) : null}
    </WidgetShell>
  );
}

export function WeeklyDigestWidget({ digest }: { digest: WeeklyOperationalDigest }) {
  const metrics = [
    { label: "Published in 7 days", count: digest.delivered },
    { label: "Due in next 7 days", count: digest.committed },
    { label: "Decisions waiting", count: digest.decisions },
    { label: "Risk signals", count: digest.risks },
  ];
  return (
    <WidgetShell
      title="Weekly operations"
      description="A concise delivery digest, updated live."
      icon={<CalendarDays className="h-4 w-4 text-cyan" />}
    >
      <dl className="grid grid-cols-2 gap-2">
        {metrics.map((metric) => (
          <div key={metric.label} className="rounded-md border border-border bg-card/60 p-2">
            <dt className="text-[10px] text-text-zero">{metric.label}</dt>
            <dd className="font-data text-lg font-semibold tabular-nums text-text-cell">{metric.count}</dd>
          </div>
        ))}
      </dl>
      <Link
        href={digest.nextActionHref}
        className="flex items-center gap-2 rounded-md border border-cyan/30 bg-cyan-dim/20 px-3 py-2 text-xs text-cyan hover:brightness-110"
      >
        {digest.risks > 0 ? <AlertTriangle className="h-3.5 w-3.5" /> : <ClipboardCheck className="h-3.5 w-3.5" />}
        {digest.nextAction}
      </Link>
    </WidgetShell>
  );
}
