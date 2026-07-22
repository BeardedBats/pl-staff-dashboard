import "server-only";

import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";
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

type CronAdminClient = ReturnType<typeof getSupabaseAdmin>;

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
  } catch {
    return NextResponse.json(
      { error: "Cron execution control is unavailable" },
      { status: 503 },
    );
  }
  const { data, error } = claimResult;
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

  let response: Response;
  try {
    response = await task();
  } catch {
    const finished = await finishCronRun(supabase, {
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
    return NextResponse.json(
      { error: "Cron outcome could not be recorded" },
      { status: 503 },
    );
  }
  return response;
}
