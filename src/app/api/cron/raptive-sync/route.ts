import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/http";
import { authorizeCronRequest } from "@/lib/cron/authorization";
import { executeCronJob } from "@/lib/cron/execution";
import { CRON_JOBS } from "@/lib/cron/jobs";
import { syncEnabledRaptiveConnections } from "@/lib/analytics/raptive-live";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function handle(request: Request) {
  const authorized = await authorizeCronRequest(request);
  if (!authorized.ok) return errorResponse(401, authorized.error);

  return executeCronJob(authorized.source,
    CRON_JOBS["raptive-sync"].execution,
    async () => {
      const results = await syncEnabledRaptiveConnections();
      if (results.length === 0) {
        return NextResponse.json({
          ok: true,
          skipped: true,
          reason: "not_enabled",
        });
      }
      if (results.some((result) => !result.ok)) {
        return NextResponse.json(
          {
            error: "One or more Raptive sites failed to synchronize",
            results: results.map((result) => ({
              wpSite: result.wpSite,
              ok: result.ok,
              date: result.date,
              ...(!result.ok ? { errorCode: result.errorCode } : {}),
            })),
          },
          { status: 502 },
        );
      }
      return NextResponse.json({
        ok: true,
        results: results.map((result) => ({
          wpSite: result.wpSite,
          date: result.date,
          insertedRows: result.ok ? result.insertedRows : 0,
          matchedRows: result.ok ? result.matchedRows : 0,
          unmatchedRows: result.ok ? result.unmatchedRows : 0,
        })),
      });
    },
  );
}

export { handle as GET, handle as POST };
