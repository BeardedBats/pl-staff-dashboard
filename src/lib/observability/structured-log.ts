import { randomUUID } from "node:crypto";

export type LogLevel = "info" | "warning" | "error";
export type SafeLogValue = string | number | boolean | null;
export type SafeLogAttributes = Record<string, SafeLogValue>;

type StructuredLogInput = {
  level: LogLevel;
  component: string;
  event: string;
  errorId?: string;
  errorCode?: string;
  attributes?: SafeLogAttributes;
};

const forbiddenKey = /(authorization|cookie|credential|email|file|password|secret|token|url)/i;
const sensitiveValue = /(?:bearer\s+\S+|sb_secret_[a-z0-9_-]+|eyJ[a-z0-9_-]+\.[a-z0-9_-]+\.[a-z0-9_-]+|[^\s@]+@[^\s@]+\.[^\s@]+)/i;
const safeCode = /^[a-z0-9][a-z0-9._-]{0,99}$/;
const safeName = /^[a-z0-9][a-z0-9._-]{0,99}$/;

function normalizeName(value: string, fallback: string): string {
  const normalized = value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "_");
  return safeName.test(normalized) ? normalized : fallback;
}

function sanitizeValue(value: SafeLogValue): SafeLogValue {
  if (typeof value !== "string") return value;
  if (sensitiveValue.test(value)) return "[redacted]";
  return value.length > 160 ? `${value.slice(0, 157)}...` : value;
}

export function sanitizeLogAttributes(
  attributes: SafeLogAttributes = {},
): SafeLogAttributes {
  return Object.fromEntries(
    Object.entries(attributes)
      .filter(([key]) => !forbiddenKey.test(key))
      .slice(0, 20)
      .map(([key, value]) => [
        normalizeName(key, "field"),
        sanitizeValue(value),
      ]),
  );
}

export function safeErrorCode(error: unknown, fallback = "unknown"): string {
  if (error && typeof error === "object") {
    const candidate = "code" in error ? String(error.code) : "name" in error ? String(error.name) : "";
    const normalized = candidate
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "_");
    if (safeCode.test(normalized)) return normalized;
  }
  return safeCode.test(fallback) ? fallback : "unknown";
}

export function createErrorId(): string {
  return randomUUID();
}

export function emitStructuredLog(input: StructuredLogInput): string | null {
  const errorId = input.level === "error" ? input.errorId ?? createErrorId() : null;
  const payload = {
    timestamp: new Date().toISOString(),
    level: input.level,
    component: normalizeName(input.component, "application"),
    event: normalizeName(input.event, "application.event"),
    ...(errorId ? { error_id: errorId } : {}),
    ...(input.errorCode
      ? { error_code: safeErrorCode({ code: input.errorCode }) }
      : {}),
    ...sanitizeLogAttributes(input.attributes),
  };
  const line = JSON.stringify(payload);
  if (input.level === "error") console.error(line);
  else if (input.level === "warning") console.warn(line);
  else console.info(line);
  return errorId;
}
