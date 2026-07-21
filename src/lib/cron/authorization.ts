import "server-only";

import { env } from "@/lib/env";
import { getCurrentUser } from "@/lib/auth/current-user";
import { isAdminPlusForScope } from "@/lib/auth/authorization";

export type CronInvocationSource = "vercel" | "manual";

export async function authorizeCronRequest(
  request: Request,
): Promise<
  | { ok: true; source: CronInvocationSource }
  | { ok: false; error: "Not authorized" }
> {
  if (request.headers.get("authorization") === `Bearer ${env.CRON_SECRET}`) {
    return { ok: true, source: "vercel" };
  }

  const viewer = await getCurrentUser();
  if (viewer && isAdminPlusForScope(viewer, "both")) {
    return { ok: true, source: "manual" };
  }

  return { ok: false, error: "Not authorized" };
}
