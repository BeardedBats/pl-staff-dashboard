import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listTiers } from "@/lib/entries/queries";

export const dynamic = "force-dynamic";

export async function GET() {
  const viewer = await getCurrentUser();
  if (!viewer) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }
  const tiers = await listTiers();
  return NextResponse.json({ tiers });
}
