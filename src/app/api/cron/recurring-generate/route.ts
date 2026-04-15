import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { getCurrentUser, isAdminPlus } from "@/lib/auth/current-user";
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
export async function POST(request: Request) {
  const authorized = await authorize(request);
  if (!authorized.ok) {
    return NextResponse.json({ error: authorized.error }, { status: 401 });
  }

  const report = await runGenerator();
  return NextResponse.json({ ok: true, report });
}

async function authorize(
  request: Request,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const authHeader = request.headers.get("authorization");
  if (authHeader === `Bearer ${env.CRON_SECRET}`) {
    return { ok: true };
  }
  const viewer = await getCurrentUser();
  if (viewer && isAdminPlus(viewer)) {
    return { ok: true };
  }
  return { ok: false, error: "Not authorized" };
}
