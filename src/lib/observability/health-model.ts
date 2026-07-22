import { CRON_JOBS } from "@/lib/cron/jobs";

export type HealthLevel =
  | "healthy"
  | "running"
  | "warning"
  | "critical"
  | "not_configured"
  | "unknown";

export type CronRunHealthInput = {
  job_name: string;
  status: "running" | "succeeded" | "failed";
  started_at: string;
  finished_at: string | null;
  lease_expires_at: string;
  error_code: string | null;
  attempt: number;
};

export type CronHealthItem = {
  key: string;
  label: string;
  level: HealthLevel;
  detail: string;
  lastRunAt: string | null;
  errorCode: string | null;
  remediation: string;
};

export function evaluateCronHealth(
  runs: CronRunHealthInput[],
  now = new Date(),
): CronHealthItem[] {
  const latest = new Map<string, CronRunHealthInput>();
  for (const run of runs) {
    if (!latest.has(run.job_name)) latest.set(run.job_name, run);
  }

  return Object.entries(CRON_JOBS).map(([key, definition]) => {
    const run = latest.get(definition.execution.name);
    const common = {
      key,
      label: definition.label,
      lastRunAt: run?.started_at ?? null,
      errorCode: run?.error_code ?? null,
      remediation: definition.remediation,
    };
    if (!run) {
      return {
        ...common,
        level: "warning" as const,
        detail: "No scheduled run has been recorded.",
      };
    }
    if (run.status === "failed") {
      return {
        ...common,
        level: "critical" as const,
        detail: `Latest scheduled run failed${run.error_code ? ` (${run.error_code})` : ""}.`,
      };
    }
    if (run.status === "running") {
      const expired = new Date(run.lease_expires_at).getTime() <= now.getTime();
      return {
        ...common,
        level: expired ? ("critical" as const) : ("running" as const),
        detail: expired
          ? "Run exceeded its execution lease and may be stuck."
          : "Run is currently in progress.",
      };
    }

    const ageSeconds =
      (now.getTime() - new Date(run.finished_at ?? run.started_at).getTime()) /
      1000;
    if (!Number.isFinite(ageSeconds) || ageSeconds > definition.staleAfterSeconds) {
      return {
        ...common,
        level: "warning" as const,
        detail: "Latest successful run is older than its freshness window.",
      };
    }
    return {
      ...common,
      level: "healthy" as const,
      detail: "Latest scheduled run succeeded within its freshness window.",
    };
  });
}

export function evaluateTimestampFreshness(
  timestamp: string | null,
  staleAfterSeconds: number,
  now = new Date(),
): { level: HealthLevel; detail: string } {
  if (!timestamp) {
    return { level: "warning", detail: "No successful synchronization is recorded." };
  }
  const ageSeconds = (now.getTime() - new Date(timestamp).getTime()) / 1000;
  if (!Number.isFinite(ageSeconds)) {
    return { level: "critical", detail: "The recorded synchronization timestamp is invalid." };
  }
  if (ageSeconds > staleAfterSeconds) {
    return { level: "warning", detail: "The latest synchronization is stale." };
  }
  return { level: "healthy", detail: "Synchronization is current." };
}
