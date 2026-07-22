import "server-only";

import { z } from "zod";
import { env } from "@/lib/env";
import { MAX_RAPTIVE_IMPORT_ROWS } from "@/lib/analytics/raptive-contract";

const TOKEN_URL = "https://publisher-api.raptive.com/oauth/token";
const API_BASE_URL = "https://publisher-api.raptive.com/creator-api/v1";
const REQUEST_TIMEOUT_MS = 15_000;
const PAGE_SIZE = 250;
const MAX_REQUEST_ATTEMPTS = 3;

const apiNumberSchema = z
  .union([
    z.number(),
    z.string().regex(/^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i),
  ])
  .transform(Number)
  .pipe(z.number().finite());
const apiNonnegativeIntegerSchema = apiNumberSchema.pipe(
  z.number().int().nonnegative(),
);
const apiPositiveIntegerSchema = apiNumberSchema.pipe(
  z.number().int().positive(),
);

const tokenSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.literal("Bearer"),
  expires_in: z.number().int().positive(),
});

const pageMetadataSchema = z.object({
  number: z.number().int().positive(),
  size: z.number().int().nonnegative(),
  prev: z.number().int().positive().nullable(),
  next: z.number().int().positive().nullable(),
  first: z.number().int().positive(),
  last: z.number().int().positive(),
});

const siteSchema = z.object({
  id: z.string().min(1).max(128),
  name: z.string().min(1).max(160),
  status: z.string().min(1),
  service: z.string().min(1),
  jw: z.boolean(),
  url: z.string().url().optional(),
});

const siteListSchema = z.object({
  data: z.array(siteSchema),
  meta: z.object({
    totalItemCount: z.number().int().nonnegative(),
    page: pageMetadataSchema,
  }),
});

const dateRangeSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
});

const dateRangeSuiteSchema = z.object({
  range: dateRangeSchema,
}).passthrough();

const dateBoundsSchema = z.object({
  data: z.object({
    analyticsDateBounds: dateRangeSuiteSchema,
    earningsDateBounds: dateRangeSuiteSchema,
  }),
});

const pagePerformanceRowSchema = z.object({
  // Creator API page-performance rows may contain either an absolute URL or
  // the hostless article path consumed by normalizeAnalyticsPath().
  pageUrl: z.string().trim().min(1).max(4096),
  earnings: apiNumberSchema,
  pageviews: apiNonnegativeIntegerSchema,
  // Raptive emits null/omits RPM for zero-traffic rows on some historical
  // dates. Canonicalization derives it from earnings/pageviews when possible.
  rpm: apiNumberSchema.nullish().transform((value) => value ?? null),
}).passthrough();

const pageTraversalMetadataSchema = z.object({
  number: apiPositiveIntegerSchema,
  next: apiPositiveIntegerSchema.nullish().transform((value) => value ?? null),
}).passthrough();

const pagePerformanceSchema = z.object({
  data: z.array(pagePerformanceRowSchema),
  meta: z.object({
    recordCount: apiNonnegativeIntegerSchema,
    page: pageTraversalMetadataSchema,
  }).passthrough(),
});

export type RaptiveSite = z.infer<typeof siteSchema>;
export type RaptiveDateBounds = z.infer<typeof dateBoundsSchema>["data"];
export type RaptivePagePerformanceRow = z.infer<
  typeof pagePerformanceRowSchema
>;

export class RaptiveApiError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number | null = null,
  ) {
    super("Raptive Creator API request failed");
    this.name = "RaptiveApiError";
  }
}

let cachedToken: { value: string; expiresAt: number } | null = null;

export function isRaptiveApiConfigured(): boolean {
  return Boolean(env.RAPTIVE_CLIENT_ID && env.RAPTIVE_CLIENT_SECRET);
}

function safeApiErrorCode(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "_");
  return /^[a-z0-9][a-z0-9._-]{0,99}$/.test(normalized)
    ? normalized
    : fallback;
}

function valueTypeAtPath(value: unknown, path: PropertyKey[]): string {
  let current = value;
  for (const part of path) {
    if (current === null || typeof current !== "object") return typeof current;
    current = (current as Record<PropertyKey, unknown>)[part];
  }
  if (current === null) return "null";
  if (Array.isArray(current)) return "array";
  return typeof current;
}

async function responseErrorCode(response: Response): Promise<string> {
  try {
    const body = (await response.clone().json()) as {
      internalCode?: unknown;
      code?: unknown;
    };
    return safeApiErrorCode(
      body.internalCode ?? body.code,
      `raptive_http_${response.status}`,
    );
  } catch {
    return `raptive_http_${response.status}`;
  }
}

function retryDelayMs(response: Response, attempt: number): number {
  const header = response.headers.get("retry-after");
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, 5_000);
    }
  }
  return Math.min(250 * 2 ** attempt + Math.floor(Math.random() * 100), 2_000);
}

async function delay(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestToken(force = false): Promise<string> {
  if (!isRaptiveApiConfigured()) {
    throw new RaptiveApiError("raptive_not_configured");
  }
  if (!force && cachedToken && cachedToken.expiresAt > Date.now() + 30_000) {
    return cachedToken.value;
  }

  const basic = Buffer.from(
    `${env.RAPTIVE_CLIENT_ID}:${env.RAPTIVE_CLIENT_SECRET}`,
  ).toString("base64");
  let response: Response;
  try {
    response = await fetch(TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
      cache: "no-store",
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch {
    throw new RaptiveApiError("raptive_token_unavailable");
  }
  if (!response.ok) {
    throw new RaptiveApiError(await responseErrorCode(response), response.status);
  }

  let parsed: z.infer<typeof tokenSchema>;
  try {
    parsed = tokenSchema.parse(await response.json());
  } catch {
    throw new RaptiveApiError("raptive_token_schema_invalid", response.status);
  }
  cachedToken = {
    value: parsed.access_token,
    expiresAt: Date.now() + parsed.expires_in * 1000,
  };
  return parsed.access_token;
}

async function requestJson<T>(
  path: string,
  schema: z.ZodType<T>,
  schemaErrorCode: string,
): Promise<T> {
  let refreshedAfterUnauthorized = false;
  let forceTokenRefresh = false;
  for (let attempt = 0; attempt < MAX_REQUEST_ATTEMPTS; attempt += 1) {
    const token = await requestToken(forceTokenRefresh);
    forceTokenRefresh = false;
    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}${path}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
    } catch {
      if (attempt + 1 < MAX_REQUEST_ATTEMPTS) {
        await delay(retryDelayMs(new Response(null), attempt));
        continue;
      }
      throw new RaptiveApiError("raptive_network_unavailable");
    }

    if (response.status === 401 && !refreshedAfterUnauthorized) {
      cachedToken = null;
      refreshedAfterUnauthorized = true;
      forceTokenRefresh = true;
      continue;
    }
    if (
      (response.status === 429 || response.status >= 500) &&
      attempt + 1 < MAX_REQUEST_ATTEMPTS
    ) {
      await delay(retryDelayMs(response, attempt));
      continue;
    }
    if (!response.ok) {
      throw new RaptiveApiError(await responseErrorCode(response), response.status);
    }
    const body = await response.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      console.error(
        JSON.stringify({
          timestamp: new Date().toISOString(),
          level: "error",
          component: "raptive",
          event: "raptive.response_schema_invalid",
          error_code: schemaErrorCode,
          issues: parsed.error.issues.slice(0, 20).map((issue) => ({
            path: issue.path.map(String).join("."),
            code: issue.code,
            actual_type: valueTypeAtPath(body, issue.path),
          })),
        }),
      );
      throw new RaptiveApiError(schemaErrorCode, response.status);
    }
    return parsed.data;
  }
  throw new RaptiveApiError("raptive_retry_exhausted");
}

export async function listRaptiveSites(): Promise<RaptiveSite[]> {
  const response = await requestJson(
    "/sites?page%5Bsize%5D=0",
    siteListSchema,
    "raptive_site_list_schema_invalid",
  );
  if (response.data.length !== response.meta.totalItemCount) {
    throw new RaptiveApiError("raptive_site_list_incomplete");
  }
  return response.data;
}

export async function getRaptiveDateBounds(
  siteId: string,
): Promise<RaptiveDateBounds> {
  const response = await requestJson(
    `/sites/${encodeURIComponent(siteId)}/date-bounds`,
    dateBoundsSchema,
    "raptive_date_bounds_schema_invalid",
  );
  return response.data;
}

export async function getRaptivePagePerformance(
  siteId: string,
  date: string,
): Promise<RaptivePagePerformanceRow[]> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new RaptiveApiError("raptive_date_invalid");
  }
  const rows: RaptivePagePerformanceRow[] = [];
  const seenPages = new Set<number>();
  let page = 1;
  let expectedRecordCount: number | null = null;

  while (true) {
    if (seenPages.has(page)) {
      throw new RaptiveApiError("raptive_pagination_cycle");
    }
    seenPages.add(page);
    const params = new URLSearchParams({
      startDate: date,
      endDate: date,
      "page[number]": String(page),
      "page[size]": String(PAGE_SIZE),
      sort: "-pageviews",
    });
    const response = await requestJson(
      `/sites/${encodeURIComponent(siteId)}/pages/performance?${params}`,
      pagePerformanceSchema,
      "raptive_page_performance_schema_invalid",
    );
    expectedRecordCount ??= response.meta.recordCount;
    if (response.meta.recordCount !== expectedRecordCount) {
      throw new RaptiveApiError("raptive_record_count_changed");
    }
    rows.push(...response.data);
    if (rows.length > MAX_RAPTIVE_IMPORT_ROWS) {
      throw new RaptiveApiError("raptive_row_limit_exceeded");
    }
    const next = response.meta.page.next;
    if (next === null) break;
    if (next <= page) {
      throw new RaptiveApiError("raptive_pagination_invalid");
    }
    page = next;
  }

  if (rows.length !== expectedRecordCount) {
    throw new RaptiveApiError("raptive_page_count_mismatch");
  }
  return rows;
}

export function resetRaptiveTokenCacheForTests(): void {
  cachedToken = null;
}
