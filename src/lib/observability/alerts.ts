import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { Json } from "@/types/database";
import {
  emitStructuredLog,
  safeErrorCode,
  sanitizeLogAttributes,
  type SafeLogAttributes,
} from "./structured-log";

export type OperationalAlertInput = {
  fingerprint: string;
  severity: "warning" | "critical";
  component: string;
  eventName: string;
  errorCode?: string;
  summary: string;
  remediation: string;
  metadata?: SafeLogAttributes;
};

export async function recordOperationalAlert(
  input: OperationalAlertInput,
  error?: unknown,
): Promise<string> {
  const errorCode = input.errorCode ?? safeErrorCode(error);
  const metadata = sanitizeLogAttributes(input.metadata);
  const errorId = emitStructuredLog({
    level: "error",
    component: input.component,
    event: input.eventName,
    errorCode,
    attributes: metadata,
  })!;

  try {
    const supabase = getSupabaseAdmin();
    const { error: persistenceError } = await supabase.rpc(
      "record_operational_alert",
      {
        p_fingerprint: input.fingerprint,
        p_severity: input.severity,
        p_component: input.component,
        p_event_name: input.eventName,
        p_error_code: errorCode,
        p_summary: input.summary,
        p_remediation: input.remediation,
        p_metadata: { ...metadata, error_id: errorId } as Json,
      },
    );
    if (persistenceError) {
      emitStructuredLog({
        level: "warning",
        component: "observability",
        event: "alert.persistence_failed",
        errorCode: safeErrorCode(persistenceError, "persistence_failed"),
        attributes: { source_component: input.component, error_id: errorId },
      });
    }
  } catch (persistenceError) {
    emitStructuredLog({
      level: "warning",
      component: "observability",
      event: "alert.persistence_failed",
      errorCode: safeErrorCode(persistenceError, "persistence_failed"),
      attributes: { source_component: input.component, error_id: errorId },
    });
  }

  return errorId;
}

export async function resolveOperationalAlert(
  fingerprint: string,
  component: string,
): Promise<void> {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase.rpc("resolve_operational_alert", {
      p_fingerprint: fingerprint,
    });
    if (!error && data) {
      emitStructuredLog({
        level: "info",
        component,
        event: "operational_alert.resolved",
        attributes: { fingerprint },
      });
    }
  } catch {
    // Recovery logging must never turn a successful product operation into a
    // failure or recursively attempt to persist another alert.
  }
}
