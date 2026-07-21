import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/http";
import { authorizeCronRequest } from "@/lib/cron/authorization";
import { executeCronJob } from "@/lib/cron/execution";
import { runGenerator } from "@/lib/recurring-templates/generator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/cron/recurring-generate
 *
 * Runs the recurring entry generator. Two ways in:
 *   1. Vercel Cron: header `Authorization: Bearer $CRON_SECRET`
 *   2. Admin manual trigger: a logged-in admin+ user hits this endpoint
 *      from the Settings → Templates panel.
 *
 * Returns a small report describing what was created / skipped / failed.
 */
async function handle(request: Request) {
  const authorized = await authorizeCronRequest(request);
  if (!authorized.ok) {
    return errorResponse(401, authorized.error);
  }

  return executeCronJob(authorized.source, {
    name: "recurring-generate",
    intervalSeconds: 24 * 60 * 60,
  }, async () => {
    const report = await runGenerator();
    return NextResponse.json({ ok: true, report });
  });
}

export { handle as GET, handle as POST };
