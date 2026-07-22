import "server-only";

import { getGa4Status } from "@/lib/analytics/ga4";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { emitStructuredLog, safeErrorCode } from "./structured-log";
import {
  evaluateCronHealth,
  evaluateTimestampFreshness,
  type CronRunHealthInput,
  type HealthLevel,
} from "./health-model";

export type IntegrationHealthItem = {
  key: string;
  label: string;
  level: HealthLevel;
  detail: string;
  lastSuccessAt: string | null;
  remediation: string;
};

export type OperationalAlertView = {
  id: string;
  severity: "warning" | "critical";
  component: string;
  summary: string;
  remediation: string;
  errorCode: string;
  occurrenceCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
};

export type ImportHealthSummary = {
  level: HealthLevel;
  detail: string;
  latestRunAt: string | null;
  latestStatus: "running" | "succeeded" | "failed" | null;
  runningCount: number;
  recentFailedCount: number;
};

export type NotificationDeliveryHealth = {
  level: HealthLevel;
  detail: string;
  scheduledCount: number;
  activeFailureCount: number;
  remediation: string;
};

export type OperationalHealthSnapshot = {
  generatedAt: string;
  overall: "healthy" | "warning" | "critical";
  cron: ReturnType<typeof evaluateCronHealth>;
  integrations: IntegrationHealthItem[];
  imports: ImportHealthSummary;
  notifications: NotificationDeliveryHealth;
  alerts: OperationalAlertView[];
  probeErrors: string[];
};

type SettingRow = { key: string; value: unknown };

function settingValue(rows: SettingRow[], key: string): string | null {
  const value = rows.find((row) => row.key === key)?.value;
  return typeof value === "string" && value.length > 0 ? value : null;
}

function overallLevel(levels: HealthLevel[]): "healthy" | "warning" | "critical" {
  if (levels.includes("critical") || levels.includes("unknown")) return "critical";
  if (levels.includes("warning") || levels.includes("not_configured")) return "warning";
  return "healthy";
}

export async function getOperationalHealth(
  now = new Date(),
): Promise<OperationalHealthSnapshot> {
  const supabase = getSupabaseAdmin();
  const probeErrors: string[] = [];
  const [cronResult, settingsResult, alertResult, importResult, ga4Result, notificationResult] =
    await Promise.all([
      supabase
        .from("cron_runs")
        .select("job_name,status,started_at,finished_at,lease_expires_at,error_code,attempt")
        .eq("source", "vercel")
        .order("started_at", { ascending: false })
        .limit(200),
      supabase
        .from("global_settings")
        .select("key,value")
        .in("key", ["wp_last_sync_pl", "wp_last_sync_qb"]),
      supabase
        .from("operational_alerts")
        .select("id,severity,component,summary,remediation,error_code,occurrence_count,first_seen_at,last_seen_at")
        .is("resolved_at", null)
        .order("last_seen_at", { ascending: false })
        .limit(50),
      supabase
        .from("import_runs")
        .select("status,started_at,finished_at,error_code")
        .eq("import_type", "raptive")
        .order("started_at", { ascending: false })
        .limit(50),
      getGa4Status().then(
        (data) => ({ data, error: null }),
        (error: unknown) => ({ data: null, error }),
      ),
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .gt("available_at", now.toISOString()),
    ]);

  for (const [probe, error] of [
    ["cron", cronResult.error],
    ["wordpress", settingsResult.error],
    ["alerts", alertResult.error],
    ["imports", importResult.error],
    ["ga4", ga4Result.error],
    ["notification-delivery", notificationResult.error],
  ] as const) {
    if (!error) continue;
    probeErrors.push(probe);
    emitStructuredLog({
      level: "error",
      component: "health",
      event: "health.probe_failed",
      errorCode: safeErrorCode(error, "probe_failed"),
      attributes: { probe },
    });
  }

  const cron = evaluateCronHealth(
    (cronResult.data ?? []) as CronRunHealthInput[],
    now,
  );
  const settings = (settingsResult.data ?? []) as SettingRow[];
  const wpPl = evaluateTimestampFreshness(
    settingValue(settings, "wp_last_sync_pl"),
    15 * 60,
    now,
  );
  const wpQb = evaluateTimestampFreshness(
    settingValue(settings, "wp_last_sync_qb"),
    15 * 60,
    now,
  );
  const ga4 = ga4Result.data;
  const ga4Freshness = ga4?.connected
    ? evaluateTimestampFreshness(ga4.lastSyncedAt, 2 * 24 * 60 * 60, now)
    : null;
  const integrations: IntegrationHealthItem[] = [
    {
      key: "wordpress-pl",
      label: "Pitcher List WordPress",
      ...wpPl,
      lastSuccessAt: settingValue(settings, "wp_last_sync_pl"),
      remediation: "Open Settings > Sync and run Sync WordPress posts after checking Pitcher List connectivity.",
    },
    {
      key: "wordpress-qb",
      label: "QB List WordPress",
      ...wpQb,
      lastSuccessAt: settingValue(settings, "wp_last_sync_qb"),
      remediation: "Open Settings > Sync and run Sync WordPress posts after checking QB List connectivity.",
    },
    {
      key: "ga4",
      label: "Google Analytics 4",
      level: ga4Result.error
        ? "unknown"
        : !ga4?.configured
          ? "not_configured"
          : !ga4.connected
            ? "critical"
            : ga4Freshness!.level,
      detail: ga4Result.error
        ? "GA4 health could not be read."
        : !ga4?.configured
          ? "GA4 environment configuration is incomplete."
          : !ga4.connected
            ? "GA4 is configured but not authorized."
            : ga4Freshness!.detail,
      lastSuccessAt: ga4?.lastSyncedAt ?? null,
      remediation: "Open Settings > Analytics to configure, reconnect, or manually synchronize GA4.",
    },
  ];

  const importRows = (importResult.data ?? []) as Array<{
    status: "running" | "succeeded" | "failed";
    started_at: string;
    finished_at: string | null;
    error_code: string | null;
  }>;
  const staleRunning = importRows.filter(
    (row) =>
      row.status === "running" &&
      now.getTime() - new Date(row.started_at).getTime() > 5 * 60 * 1000,
  );
  const recentFailed = importRows.filter(
    (row) =>
      row.status === "failed" &&
      now.getTime() - new Date(row.finished_at ?? row.started_at).getTime() <
        7 * 24 * 60 * 60 * 1000,
  );
  const latestImport = importRows[0] ?? null;
  const imports: ImportHealthSummary = {
    level: importResult.error
      ? "unknown"
      : staleRunning.length > 0 || recentFailed.length > 0
        ? "critical"
        : latestImport?.status === "running"
          ? "running"
          : latestImport?.status === "succeeded"
            ? "healthy"
            : "not_configured",
    detail: importResult.error
      ? "Import health could not be read."
      : staleRunning.length > 0
        ? `${staleRunning.length} Raptive import run has exceeded the five-minute visibility window.`
        : recentFailed.length > 0
          ? `${recentFailed.length} Raptive import failed in the last seven days.`
          : latestImport?.status === "running"
            ? "A Raptive import is in progress."
            : latestImport?.status === "succeeded"
              ? "The latest Raptive import completed successfully."
              : "No Raptive import run has been recorded.",
    latestRunAt: latestImport?.started_at ?? null,
    latestStatus: latestImport?.status ?? null,
    runningCount: importRows.filter((row) => row.status === "running").length,
    recentFailedCount: recentFailed.length,
  };

  const alerts = ((alertResult.data ?? []) as Array<{
    id: string;
    severity: "warning" | "critical";
    component: string;
    summary: string;
    remediation: string;
    error_code: string;
    occurrence_count: number;
    first_seen_at: string;
    last_seen_at: string;
  }>).map((row) => ({
    id: row.id,
    severity: row.severity,
    component: row.component,
    summary: row.summary,
    remediation: row.remediation,
    errorCode: row.error_code,
    occurrenceCount: row.occurrence_count,
    firstSeenAt: row.first_seen_at,
    lastSeenAt: row.last_seen_at,
  }));
  const notificationFailureCount = alerts.filter(
    (alert) => alert.component === "notifications",
  ).length;
  const notifications: NotificationDeliveryHealth = {
    level: notificationResult.error
      ? "unknown"
      : notificationFailureCount > 0
        ? "warning"
        : "healthy",
    detail: notificationResult.error
      ? "Notification delivery health could not be read."
      : notificationFailureCount > 0
        ? `${notificationFailureCount} active delivery alert${notificationFailureCount === 1 ? " requires" : "s require"} attention.`
        : `${notificationResult.count ?? 0} notification${notificationResult.count === 1 ? " is" : "s are"} scheduled for a daily batch or quiet-hours release.`,
    scheduledCount: notificationResult.count ?? 0,
    activeFailureCount: notificationFailureCount,
    remediation:
      "Open Active alerts for the safe error code and retry the originating workflow after database connectivity recovers.",
  };

  return {
    generatedAt: now.toISOString(),
    overall: overallLevel([
      ...cron.map((item) => item.level),
      ...integrations.map((item) => item.level),
      imports.level,
      notifications.level,
      ...alerts.map((alert) => alert.severity),
      ...(probeErrors.length > 0 ? (["unknown"] as const) : []),
    ]),
    cron,
    integrations,
    imports,
    notifications,
    alerts,
    probeErrors,
  };
}
