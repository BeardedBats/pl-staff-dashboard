"use client";

import * as React from "react";
import { Activity, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { HealthLevel } from "@/lib/observability/health-model";
import type { OperationalHealthSnapshot } from "@/lib/observability/health";

type Props = { initialHealth: OperationalHealthSnapshot };

const levelClass: Record<HealthLevel | "critical", string> = {
  healthy: "border-cyan/40 text-cyan",
  running: "border-blue-400/40 text-blue-300",
  warning: "border-amber/40 text-amber",
  critical: "border-destructive/40 text-destructive",
  not_configured: "border-amber/40 text-amber",
  unknown: "border-destructive/40 text-destructive",
};

function LevelBadge({ level }: { level: HealthLevel | "critical" }) {
  return (
    <Badge variant="outline" className={levelClass[level]}>
      {level.replace("_", " ")}
    </Badge>
  );
}

function when(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "Never";
}

export function OperationalHealthPanel({ initialHealth }: Props) {
  const [health, setHealth] = React.useState(initialHealth);
  const [refreshing, setRefreshing] = React.useState(false);
  const [refreshError, setRefreshError] = React.useState<string | null>(null);

  async function refresh() {
    setRefreshing(true);
    setRefreshError(null);
    try {
      const response = await fetch("/api/settings/operational-health");
      const data = (await response.json().catch(() => ({}))) as {
        health?: OperationalHealthSnapshot;
        errorId?: string;
      };
      if (!response.ok || !data.health) {
        setRefreshError(
          data.errorId
            ? `Health refresh failed (${data.errorId}).`
            : "Health refresh failed.",
        );
        return;
      }
      setHealth(data.health);
    } catch {
      setRefreshError("Health refresh failed because the network is unavailable.");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4" />
            System health
            <LevelBadge level={health.overall} />
          </CardTitle>
          <CardDescription>
            Cron, integration, import, and active-alert status as of{" "}
            {when(health.generatedAt)}.
          </CardDescription>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void refresh()}
          disabled={refreshing}
        >
          {refreshing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-5">
        {refreshError ? (
          <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {refreshError}
          </p>
        ) : null}

        {health.alerts.length > 0 ? (
          <section className="space-y-2" aria-label="Active operational alerts">
            <h3 className="flex items-center gap-2 text-sm font-medium text-text-cell">
              <TriangleAlert className="h-4 w-4 text-amber" />
              Active alerts ({health.alerts.length})
            </h3>
            <div className="grid gap-2 lg:grid-cols-2">
              {health.alerts.map((alert) => (
                <div
                  key={alert.id}
                  className="space-y-1 rounded-md border border-border bg-surface-3/30 p-3 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium text-text-cell">
                      {alert.summary}
                    </span>
                    <LevelBadge level={alert.severity} />
                  </div>
                  <p className="font-data text-[10px] text-text-zero">
                    {alert.component} · {alert.errorCode} · seen{" "}
                    {alert.occurrenceCount.toLocaleString()} time
                    {alert.occurrenceCount === 1 ? "" : "s"}
                  </p>
                  <p className="text-text-team">{alert.remediation}</p>
                  <p className="text-[10px] text-text-zero">
                    Last seen {when(alert.lastSeenAt)}
                  </p>
                </div>
              ))}
            </div>
          </section>
        ) : (
          <p className="rounded-md border border-cyan/30 bg-cyan-dim px-3 py-2 text-xs text-cyan">
            No active operational alerts.
          </p>
        )}

        <section className="space-y-2" aria-label="Integration health">
          <h3 className="text-sm font-medium text-text-cell">Integrations</h3>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
            {health.integrations.map((item) => (
              <HealthItem
                key={item.key}
                label={item.label}
                level={item.level}
                detail={item.detail}
                lastRunAt={item.lastSuccessAt}
                remediation={item.remediation}
              />
            ))}
            <HealthItem
              label="Raptive imports"
              level={health.imports.level}
              detail={health.imports.detail}
              lastRunAt={health.imports.latestRunAt}
              remediation="Open Settings > Analytics to inspect recent import attempts and retry the source workbook."
            />
          </div>
        </section>

        <section className="space-y-2" aria-label="Scheduled job health">
          <h3 className="text-sm font-medium text-text-cell">Scheduled jobs</h3>
          <div className="plpd-table-shell overflow-x-auto">
            <table className="plpd-table font-data">
              <thead className="bg-card text-[10px] uppercase tracking-wide text-text-zero">
                <tr className="border-b border-border">
                  <th className="px-3 py-2 text-left">Job</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Last run</th>
                  <th className="px-3 py-2 text-left">Detail</th>
                </tr>
              </thead>
              <tbody>
                {health.cron.map((job) => (
                  <tr key={job.key} className="border-b border-border/50 align-top">
                    <td className="px-3 py-2 font-medium text-text-cell">
                      {job.label}
                    </td>
                    <td className="px-3 py-2">
                      <LevelBadge level={job.level} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-text-zero">
                      {when(job.lastRunAt)}
                    </td>
                    <td className="max-w-xl px-3 py-2 text-text-team">
                      {job.detail}
                      {job.level !== "healthy" ? (
                        <span className="mt-1 block text-text-zero">
                          {job.remediation}
                        </span>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </CardContent>
    </Card>
  );
}

function HealthItem({
  label,
  level,
  detail,
  lastRunAt,
  remediation,
}: {
  label: string;
  level: HealthLevel;
  detail: string;
  lastRunAt: string | null;
  remediation: string;
}) {
  return (
    <div className="space-y-1 rounded-md border border-border bg-surface-3/30 p-3 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-text-cell">{label}</span>
        <LevelBadge level={level} />
      </div>
      <p className="text-text-team">{detail}</p>
      <p className="text-[10px] text-text-zero">Last success: {when(lastRunAt)}</p>
      {level !== "healthy" ? (
        <p className="text-[10px] text-text-zero">{remediation}</p>
      ) : null}
    </div>
  );
}
