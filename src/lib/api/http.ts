import "server-only";

import { NextResponse } from "next/server";
import type { ZodType } from "zod";

export type ApiErrorCode =
  | "INVALID_JSON"
  | "VALIDATION_ERROR"
  | "BAD_REQUEST"
  | "NOT_AUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UPSTREAM_ERROR"
  | "INTERNAL_ERROR";

export type ApiValidationIssue = {
  path: string;
  message: string;
};

export function apiError(
  status: number,
  code: ApiErrorCode,
  message: string,
  issues?: ApiValidationIssue[],
): NextResponse {
  return NextResponse.json(
    {
      error: message,
      code,
      ...(issues && issues.length > 0 ? { issues } : {}),
    },
    { status },
  );
}

export function errorResponse(
  status: number,
  message: string,
): NextResponse {
  const code: ApiErrorCode =
    status === 400
      ? "BAD_REQUEST"
      : status === 401
        ? "NOT_AUTHENTICATED"
        : status === 403
          ? "FORBIDDEN"
          : status === 404
            ? "NOT_FOUND"
            : status === 409
              ? "CONFLICT"
              : status === 502
                ? "UPSTREAM_ERROR"
                : "INTERNAL_ERROR";
  return apiError(status, code, message);
}

export async function parseJsonBody<T>(
  request: Request,
  schema: ZodType<T>,
  options?: { allowEmpty?: boolean },
): Promise<
  | { ok: true; data: T }
  | { ok: false; response: NextResponse }
> {
  const bodyResult = await readJsonBody(request, options);
  if (!bodyResult.ok) return bodyResult;
  return validateData(bodyResult.data, schema);
}

export async function readJsonBody(
  request: Request,
  options?: { allowEmpty?: boolean },
): Promise<
  | { ok: true; data: unknown }
  | { ok: false; response: NextResponse }
> {
  try {
    const text = await request.text();
    if (text.trim() === "" && options?.allowEmpty) {
      return { ok: true, data: {} };
    }
    return { ok: true, data: JSON.parse(text) as unknown };
  } catch {
    return {
      ok: false,
      response: apiError(400, "INVALID_JSON", "Invalid JSON body"),
    };
  }
}

export function validateData<T>(
  value: unknown,
  schema: ZodType<T>,
):
  | { ok: true; data: T }
  | { ok: false; response: NextResponse } {
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    return {
      ok: false,
      response: apiError(
        400,
        "VALIDATION_ERROR",
        "Validation failed",
        parsed.error.issues.map((issue) => ({
          path: issue.path.map(String).join("."),
          message: issue.message,
        })),
      ),
    };
  }

  return { ok: true, data: parsed.data };
}

export function parseSearchParams<T>(
  request: Request,
  schema: ZodType<T>,
):
  | { ok: true; data: T }
  | { ok: false; response: NextResponse } {
  const url = new URL(request.url);
  return validateData(Object.fromEntries(url.searchParams), schema);
}

export const notAuthenticated = () =>
  apiError(401, "NOT_AUTHENTICATED", "Not authenticated");

export const forbidden = () => apiError(403, "FORBIDDEN", "Forbidden");

export function notFound(message = "Not found") {
  return apiError(404, "NOT_FOUND", message);
}

export function internalError(message = "Request failed") {
  return apiError(500, "INTERNAL_ERROR", message);
}

export function upstreamError(message = "Upstream service failed") {
  return apiError(502, "UPSTREAM_ERROR", message);
}
