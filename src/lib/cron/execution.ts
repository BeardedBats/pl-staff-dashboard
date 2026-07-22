import "server-only";

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import {
  recordOperationalAlert,
  resolveOperationalAlert,
} from "@/lib/observability/alerts";
import { emitStructuredLog, safeErrorCode } from "@/lib/observability/structured-log";
import type { Json } from "@/types/database";
import type { CronInvocationSource } from "./authorization";
import { CRON_JOBS } from "./jobs";

export type CronJobDefinition = {
  name: string;
  intervalSeconds: number;
  leaseSeconds?: number;
};

type ClaimRow = {
  run_id: string | null;
  claim_status: "claimed" | "duplicate" | "overlap" | "exhausted";
  attempt: number | null;
};

type CronAdminClient = ReturnType<typeof getSupabaseAdmin>;

function alertDetails(definition: CronJobDefinition) {
  const registered = Object.values(CRON_JOBS).find(
    ({ execution }) => execution.name === definition.name,
  );
  return {
    summary: registered
      ? `${registered.label} failed.`
      : `Scheduled job ${definition.name} failed.`,
    remediation:
      registered?.remediation ??
      "Inspect the latest cron run in Settings > Sync and retry the job after correcting its dependency.",
  };
}

async function recordCronAlert(
  definition: CronJobDefinition,
  kind: "control" | "task",
  errorCode: string,
  source: CronInvocationSource,
  error?: unknown,
) {
  const details = alertDetails(definition);
  return recordOperationalAlert(
    {
      fingerprint: `cron:${definition.name}:${kind}`,
      severity: kind === "control" ? "critical" : "warning",
      component: "cron",
      eventName: kind === "control" ? "cron.control_failed" : "cron.task_failed",
      errorCode,
      summary: details.summary,
      remediation: details.remediation,
      metadata: { job: definition.name, source },
    },
    error,
  );
}

function scheduledRunKey(now: Date, intervalSeconds: number): string {
  return String(Math.floor(now.getTime() / 1000 / intervalSeconds));
}

async function finishCronRun(
  supabase: CronAdminClient,
  params: {
    p_run_id: string;
    p_succeeded: boolean;
    p_summary: Json;
    p_error_code?: string;
  },
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("finish_cron_run", params);
    return !error && data === true;
  } catch {
    return false;
  }
}

export async function executeCronJob(
  source: CronInvocationSource,
  definition: CronJobDefinition,
  task: () => Promise<Response>,
): Promise<Response> {
  const startedAt = performance.now();
  const supabase = getSupabaseAdmin();
  const runKey =
    source === "vercel"
      ? scheduledRunKey(new Date(), definition.intervalSeconds)
      : crypto.randomUUID();
  let claimResult: Awaited<ReturnType<typeof supabase.rpc>>;
  try {
    claimResult = await supabase.rpc("claim_cron_run", {
      p_job_name: definition.name,
      p_run_key: runKey,
      p_source: source,
      p_lease_seconds: definition.leaseSeconds ?? 900,
    });
  } catch (claimError) {
    const errorId = await recordCronAlert(
      definition,
      "control",
      safeErrorCode(claimError, "claim_transport_failed"),
      source,
      claimError,
    );
    return NextResponse.json(
      { error: "Cron execution control is unavailable", errorId },
      { status: 503 },
    );
  }
  const { data, error } = claimResult;
  const claim = (data as ClaimRow[] | null)?.[0];

  if (error || !claim) {
    const errorId = await recordCronAlert(
      definition,
      "control",
      safeErrorCode(error, "claim_unavailable"),
      source,
      error,
    );
    return NextResponse.json(
      { error: "Cron execution control is unavailable", errorId },
      { status: 503 },
    );
  }
  if (claim.claim_status !== "claimed" || !claim.run_id) {
    emitStructuredLog({
      level: "info",
      component: "cron",
      event: "cron.skipped",
      attributes: {
        job: definition.name,
        source,
        reason: claim.claim_status,
        attempt: claim.attempt,
      },
    });
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: claim.claim_status,
      attempt: claim.attempt,
    });
  }

  let response: Response;
  try {
    response = await task();
  } catch (taskError) {
    const errorId = await recordCronAlert(
      definition,
      "task",
      safeErrorCode(taskError, "unhandled_exception"),
      source,
      taskError,
    );
    const finished = await finishCronRun(supabase, {
      p_run_id: claim.run_id,
      p_succeeded: false,
      p_summary: null,
      p_error_code: "unhandled_exception",
    });
    if (!finished) {
      const controlErrorId = await recordCronAlert(
        definition,
        "control",
        "finish_unavailable",
        source,
      );
      return NextResponse.json(
        { error: "Cron outcome could not be recorded", errorId: controlErrorId },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: "Cron job failed", errorId },
      { status: 500 },
    );
  }

  let body: Json = null;
  try {
    body = (await response.clone().json()) as Json;
  } catch {
    // Non-JSON and already-consumed responses still have a durable status;
    // only their optional summary is omitted from the run ledger.
  }
  const succeeded = response.ok;
  const finished = await finishCronRun(supabase, {
    p_run_id: claim.run_id,
    p_succeeded: succeeded,
    p_summary: body,
    ...(succeeded ? {} : { p_error_code: `http_${response.status}` }),
  });
  if (!finished) {
    const errorId = await recordCronAlert(
      definition,
      "control",
      "finish_unavailable",
      source,
    );
    return NextResponse.json(
      { error: "Cron outcome could not be recorded", errorId },
      { status: 503 },
    );
  }
  if (succeeded) {
    await Promise.all([
      resolveOperationalAlert(`cron:${definition.name}:control`, "cron"),
      resolveOperationalAlert(`cron:${definition.name}:task`, "cron"),
    ]);
    emitStructuredLog({
      level: "info",
      component: "cron",
      event: "cron.completed",
      attributes: {
        job: definition.name,
        source,
        run_id: claim.run_id,
        attempt: claim.attempt,
        duration_ms: Math.round(performance.now() - startedAt),
      },
    });
  } else {
    await recordCronAlert(
      definition,
      "task",
      `http_${response.status}`,
      source,
    );
  }
  return response;
}
