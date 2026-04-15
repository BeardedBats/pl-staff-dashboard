import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { Database } from "@/types/database";

/**
 * Server-only Supabase client using the service_role key.
 *
 * ⚠️ NEVER expose this client to the browser. The service_role key bypasses
 * Row Level Security and has full read/write access to every table. Because
 * we don't enable RLS (enforcement happens in route handlers), using
 * service_role is the correct pattern — but it must stay server-side.
 *
 * The `server-only` import will throw at build time if this file is ever
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
