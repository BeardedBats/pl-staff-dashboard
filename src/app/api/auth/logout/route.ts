import { NextResponse } from "next/server";
import {
  clearAuthCookies,
  readAccessTokenFromCookies,
  verifyAccessToken,
} from "@/lib/auth/session";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST() {
  // Best-effort session row deletion. Cookie clearing is what actually
  // logs the user out.
  const token = await readAccessTokenFromCookies();
  const payload = token ? verifyAccessToken(token) : null;

  if (payload?.sid) {
    const supabase = getSupabaseAdmin();
    await supabase.from("sessions").delete().eq("id", payload.sid);
  }

  await clearAuthCookies();

  return NextResponse.json({ ok: true });
}
