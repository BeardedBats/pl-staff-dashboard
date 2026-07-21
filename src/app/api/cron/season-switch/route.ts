import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/http";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { authorizeCronRequest } from "@/lib/cron/authorization";
import { executeCronJob } from "@/lib/cron/execution";
import { CRON_JOBS } from "@/lib/cron/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SeasonModeRow = {
  id: string;
  name: string;
  is_active: boolean;
  auto_switch_start: string | null;
  auto_switch_end: string | null;
};

/**
 * GET (Vercel) / POST (manual) /api/cron/season-switch
 *
 * Evaluates each season_mode row against today's UTC date and flips
 * `is_active` so the mode whose `[auto_switch_start, auto_switch_end]`
 * window contains today becomes active. Modes without auto-switch dates
 * are left alone — manual selections are preserved.
 */
async function handle(request: Request) {
  const authorized = await authorizeCronRequest(request);
  if (!authorized.ok) {
    return errorResponse(401, authorized.error);
  }

  return executeCronJob(authorized.source, CRON_JOBS["season-switch"].execution, async () => {

  const supabase = getSupabaseAdmin();

  const { data: modeRows } = await supabase
    .from("season_modes")
    .select("id, name, is_active, auto_switch_start, auto_switch_end");
  const modes = ((modeRows ?? []) as SeasonModeRow[]).map((m) => ({
    ...m,
    is_active: Boolean(m.is_active),
  }));

  const today = new Date().toISOString().slice(0, 10);

  let switched = 0;
  let activeName: string | null = null;

  const inRange = modes.find(
    (m) =>
      m.auto_switch_start &&
      m.auto_switch_end &&
      today >= m.auto_switch_start &&
      today <= m.auto_switch_end,
  );

  if (inRange) {
    if (!inRange.is_active) {
      const { data: activated, error } = await supabase.rpc(
        "activate_season_mode",
        { p_mode_id: inRange.id },
      );
      if (!error && activated) switched++;
    }
    activeName = inRange.name;
  } else {
    for (const mode of modes) {
      if (!mode.auto_switch_start || !mode.auto_switch_end) continue;
      if (!mode.is_active) continue;
      if (today < mode.auto_switch_start || today > mode.auto_switch_end) {
        const { error } = await supabase
          .from("season_modes")
          .update({ is_active: false })
          .eq("id", mode.id);
        if (!error) switched++;
      }
    }
    const stillActive = modes.find((m) => {
      const flipped =
        m.auto_switch_start &&
        m.auto_switch_end &&
        (today < m.auto_switch_start || today > m.auto_switch_end);
      return m.is_active && !flipped;
    });
    activeName = stillActive?.name ?? null;
  }

  return NextResponse.json({
    ok: true,
    checked: modes.length,
    switched,
    activeMode: activeName,
  });
  });
}

export { handle as GET, handle as POST };
