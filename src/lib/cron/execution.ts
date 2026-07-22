import "server-only";

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { CronInvocationSource } from "./authorization";

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

function scheduledRunKey(now: Date, intervalSeconds: number): string {
  return String(Math.floor(now.getTime() / 1000 / intervalSeconds));
}

export async function executeCronJob(
  source: CronInvocationSource,
  definition: CronJobDefinition,
  task: () => Promise<Response>,
): Promise<Response> {
  const supabase = getSupabaseAdmin();
  const runKey =
    source === "vercel"
      ? scheduledRunKey(new Date(), definition.intervalSeconds)
      : crypto.randomUUID();
  const { data, error } = await supabase.rpc("claim_cron_run", {
    p_job_name: definition.name,
    p_run_key: runKey,
    p_source: source,
    p_lease_seconds: definition.leaseSeconds ?? 900,
  });
  const claim = (data as ClaimRow[] | null)?.[0];

  if (error || !claim) {
    return NextResponse.json(
      { error: "Cron execution control is unavailable" },
      { status: 503 },
    );
  }
  if (claim.claim_status !== "claimed" || !claim.run_id) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: claim.claim_status,
      attempt: claim.attempt,
    });
  }

  try {
    const response = await task();
    const body = await response.clone().json().catch(() => null);
    const succeeded = response.ok;
    const { data: finished, error: finishError } = await supabase.rpc("finish_cron_run", {
      p_run_id: claim.run_id,
      p_succeeded: succeeded,
      p_summary: body,
      ...(succeeded ? {} : { p_error_code: `http_${response.status}` }),
    });
    if (finishError || !finished) {
      return NextResponse.json(
        { error: "Cron outcome could not be recorded" },
        { status: 503 },
      );
    }
    return response;
  } catch {
    const { data: finished } = await supabase.rpc("finish_cron_run", {
      p_run_id: claim.run_id,
      p_succeeded: false,
      p_summary: null,
      p_error_code: "unhandled_exception",
    });
    if (!finished) {
      return NextResponse.json(
        { error: "Cron outcome could not be recorded" },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: "Cron job failed" }, { status: 500 });
  }
}
