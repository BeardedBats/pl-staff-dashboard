import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * Server-only Supabase client using the service_role key.
 *
 * ⚠️ NEVER expose this client to the browser. The service_role key bypasses
 * Row Level Security and has full read/write access to every table.
 *
 * Security model (as of migration 0007):
 *   - RLS is ENABLED on every public table.
 *   - No permissive policies exist, so anon + authenticated roles get
 *     default-deny on every table via PostgREST.
 *   - anon + authenticated also have their table privileges REVOKE'd as
 *     defense-in-depth.
 *   - The service_role (used by this client) bypasses RLS by design, so
 *     server-side queries keep working.
 *   - All authorization enforcement — who can claim, who can publish, who
 *     can view analytics — happens in Next.js API route handlers by
 *     reading the custom JWT cookie. Never trust the request body.
 *
 * The `server-only` import throws at build time if this file is ever
 * imported into a client component.
 */
let cached: SupabaseClient<Database> | null = null;

export function getSupabaseAdmin(): SupabaseClient<Database> {
  if (cached) return cached;

  cached = createClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
      db: {
        schema: "public",
      },
    },
  );

  return cached;
}
