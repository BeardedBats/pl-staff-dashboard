import { z } from "zod";

/**
 * Runtime-validated environment schema.
 *
 * We split env vars into three groups:
 *   1. `core` — required for the app to boot (Supabase, JWT, WP-PL, app URL).
 *   2. `optional` — integrations added in later steps. Missing values throw
 *       only when the feature is actually used.
 *   3. `public` — client-safe values prefixed with `NEXT_PUBLIC_`.
 *
 * Usage:
 *   import { env } from "@/lib/env";
 *   const url = env.NEXT_PUBLIC_SUPABASE_URL;
 */

const coreSchema = z.object({
  // Supabase
  NEXT_PUBLIC_SUPABASE_URL: z.string().url("NEXT_PUBLIC_SUPABASE_URL must be a valid URL"),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is required"),

  // JWT
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_REFRESH_SECRET: z.string().min(32, "JWT_REFRESH_SECRET must be at least 32 characters"),

  // WordPress — Pitcher List
  WP_PL_URL: z.string().url("WP_PL_URL must be a valid URL"),
  WP_PL_USERNAME: z.string().min(1, "WP_PL_USERNAME is required"),
  WP_PL_APP_PASSWORD: z.string().min(1, "WP_PL_APP_PASSWORD is required"),

  // App
  NEXT_PUBLIC_APP_URL: z.string().url("NEXT_PUBLIC_APP_URL must be a valid URL"),

  // Cron
  CRON_SECRET: z.string().min(16, "CRON_SECRET must be at least 16 characters"),
});

const optionalSchema = z.object({
  // WordPress — QB List
  WP_QB_URL: z.string().url().optional().or(z.literal("")),
  WP_QB_USERNAME: z.string().optional().or(z.literal("")),
  WP_QB_APP_PASSWORD: z.string().optional().or(z.literal("")),

  // Discord
  DISCORD_BOT_TOKEN: z.string().optional().or(z.literal("")),
  DISCORD_GUILD_ID: z.string().optional().or(z.literal("")),

  // Resend
  RESEND_API_KEY: z.string().optional().or(z.literal("")),
  EMAIL_FROM: z.string().optional().or(z.literal("")),

  // Google Analytics 4
  GA4_CLIENT_ID: z.string().optional().or(z.literal("")),
  GA4_CLIENT_SECRET: z.string().optional().or(z.literal("")),
  GA4_PROPERTY_ID: z.string().optional().or(z.literal("")),
});

const envSchema = coreSchema.merge(optionalSchema);

function loadEnv(): z.infer<typeof envSchema> {
  const parsed = envSchema.safeParse(process.env);

  if (!parsed.success) {
    const tree = z.treeifyError(parsed.error);
    console.error("❌ Invalid environment variables:");
    console.error(JSON.stringify(tree, null, 2));
    throw new Error(
      "Environment validation failed. Check .env.local against .env.example.",
    );
  }

  return parsed.data;
}

/**
 * Validated, typed environment. Read-only.
 *
 * In Next.js App Router, this is evaluated at module-load time on the server.
 * Client components will only see `NEXT_PUBLIC_*` vars through `process.env`.
 */
export const env = loadEnv();

/**
 * True when the app is running in a Node.js runtime (as opposed to edge).
 * Next.js route handlers default to Node unless `export const runtime = "edge"`.
 */
export const isNodeRuntime = typeof process !== "undefined" && !!process.versions?.node;
