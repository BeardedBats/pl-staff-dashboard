import "server-only";

import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Supabase Storage helpers for graphics.
 *
 * Bucket name is hardcoded as `graphics`. The bucket is PRIVATE — reads
 * happen via short-lived signed URLs generated server-side by the data
 * fetchers. We never expose `getPublicUrl` results to the browser.
 *
 * Naming convention: {entryId}/{timestamp}-{uuid}-{sanitized-filename}
 * This lets us find all graphics for a given entry by prefix and avoid
 * collisions when the same filename is uploaded twice.
 */

export const GRAPHICS_BUCKET = "graphics";

/** Signed-URL TTL — long enough for a page session, short enough to limit blast radius if leaked. */
export const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

export const ALLOWED_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/gif",
]);

export function normalizeSignedUrlTtl(ttl: number): number {
  if (!Number.isFinite(ttl)) return SIGNED_URL_TTL_SECONDS;
  return Math.min(SIGNED_URL_TTL_SECONDS, Math.max(1, Math.floor(ttl)));
}

// --------------------------------------------------------------------------
// Validation
// --------------------------------------------------------------------------

export type UploadValidationError =
  | { kind: "too_large"; message: string }
  | { kind: "bad_mime"; message: string }
  | { kind: "empty_file"; message: string }
  | { kind: "content_mismatch"; message: string };

export function validateUpload(
  fileSize: number,
  mimeType: string,
): UploadValidationError | null {
  if (fileSize <= 0) {
    return { kind: "empty_file", message: "Upload is empty." };
  }
  if (fileSize > MAX_UPLOAD_BYTES) {
    return {
      kind: "too_large",
      message: `File is too large (${Math.round(fileSize / 1024 / 1024)}MB). Max ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)}MB.`,
    };
  }
  if (!ALLOWED_MIME_TYPES.has(mimeType.toLowerCase())) {
    return {
      kind: "bad_mime",
      message: `Unsupported file type (${mimeType}). Upload a PNG, JPEG, WebP, or GIF.`,
    };
  }
  return null;
}

export function validateImageBytes(
  data: ArrayBuffer,
  mimeType: string,
): UploadValidationError | null {
  const bytes = new Uint8Array(data);
  const mime = mimeType.toLowerCase();
  const startsWith = (signature: number[], offset = 0) =>
    signature.every((value, index) => bytes[offset + index] === value);

  const matches =
    (mime === "image/png" &&
      startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ||
    ((mime === "image/jpeg" || mime === "image/jpg") &&
      startsWith([0xff, 0xd8, 0xff])) ||
    (mime === "image/gif" &&
      (startsWith([0x47, 0x49, 0x46, 0x38, 0x37, 0x61]) ||
        startsWith([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))) ||
    (mime === "image/webp" &&
      startsWith([0x52, 0x49, 0x46, 0x46]) &&
      startsWith([0x57, 0x45, 0x42, 0x50], 8));

  if (!matches) {
    return {
      kind: "content_mismatch",
      message: "File contents do not match the declared image type.",
    };
  }
  return null;
}

// --------------------------------------------------------------------------
// Path generation
// --------------------------------------------------------------------------

/**
 * Sanitize a filename so it's safe for Supabase Storage + URLs.
 * Strips diacritics, spaces, and non-ASCII characters.
 */
export function sanitizeFilename(name: string): string {
  const fallback = "file";
  if (!name) return fallback;

  // Drop directory components, then normalize + strip.
  const base = name.split(/[\\/]/).pop() ?? fallback;
  const clean = base
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // combining accents
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);

  return clean || fallback;
}

export function buildStoragePath(entryId: string, fileName: string): string {
  const safe = sanitizeFilename(fileName);
  return `${entryId}/${Date.now()}-${randomUUID()}-${safe}`;
}

// --------------------------------------------------------------------------
// Upload
// --------------------------------------------------------------------------

export type UploadedFile = {
  storagePath: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
};

/**
 * Upload a file buffer to the `graphics` bucket.
 * Returns durable storage metadata. Authorized read paths sign on demand.
 */
export async function uploadGraphicFile(
  entryId: string,
  fileName: string,
  mimeType: string,
  data: ArrayBuffer,
): Promise<{ ok: true; file: UploadedFile } | { ok: false; error: string }> {
  const validation = validateUpload(data.byteLength, mimeType);
  if (validation) {
    return { ok: false, error: validation.message };
  }
  const signatureError = validateImageBytes(data, mimeType);
  if (signatureError) {
    return {
      ok: false,
      error: "File contents do not match the declared image type.",
    };
  }

  const supabase = getSupabaseAdmin();
  const storagePath = buildStoragePath(entryId, fileName);
  const cleanName = sanitizeFilename(fileName);

  const { error } = await supabase.storage
    .from(GRAPHICS_BUCKET)
    .upload(storagePath, data, {
      contentType: mimeType,
      upsert: false,
      cacheControl: "31536000", // 1 year; UUID-backed paths are immutable
    });

  if (error) {
    return { ok: false, error: "Storage upload failed" };
  }

  return {
    ok: true,
    file: {
      storagePath,
      fileName: cleanName,
      fileSize: data.byteLength,
      mimeType,
    },
  };
}

// --------------------------------------------------------------------------
// Signed URL helpers — used by read paths
// --------------------------------------------------------------------------

/**
 * Generate a signed URL for a single storage path. Returns null if signing
 * fails (e.g. the object was deleted) — callers should treat null as
 * "no preview available."
 */
export async function getSignedGraphicUrl(
  storagePath: string,
  ttl: number = SIGNED_URL_TTL_SECONDS,
): Promise<string | null> {
  if (!storagePath) return null;
  const supabase = getSupabaseAdmin();
  const { data } = await supabase.storage
    .from(GRAPHICS_BUCKET)
    .createSignedUrl(storagePath, normalizeSignedUrlTtl(ttl));
  return data?.signedUrl ?? null;
}

/**
 * Batch-sign multiple storage paths in one call. Order is preserved.
 * Used by listGraphicRequests + listEntries to avoid N round-trips.
 */
export async function getSignedGraphicUrls(
  storagePaths: string[],
  ttl: number = SIGNED_URL_TTL_SECONDS,
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const valid = storagePaths.filter((p): p is string => Boolean(p));
  if (valid.length === 0) return out;

  const supabase = getSupabaseAdmin();
  const { data } = await supabase.storage
    .from(GRAPHICS_BUCKET)
    .createSignedUrls(valid, normalizeSignedUrlTtl(ttl));

  if (!data) return out;
  for (const entry of data) {
    if (entry.path && entry.signedUrl) {
      out.set(entry.path, entry.signedUrl);
    }
  }
  return out;
}

// --------------------------------------------------------------------------
// Delete
// --------------------------------------------------------------------------

/** Delete a stored object. Idempotent — missing files return ok. */
export async function deleteStoredGraphic(
  storagePath: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  return deleteStoredGraphics([storagePath]);
}

export async function deleteStoredGraphics(
  storagePaths: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const uniquePaths = Array.from(new Set(storagePaths.filter(Boolean)));
  if (uniquePaths.length === 0) return { ok: true };
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.storage
    .from(GRAPHICS_BUCKET)
    .remove(uniquePaths);

  if (error) return { ok: false, error: "Stored graphic deletion failed" };
  return { ok: true };
}

// --------------------------------------------------------------------------
// Fetch raw bytes (used by the WP media upload path)
// --------------------------------------------------------------------------

/**
 * Download a previously-uploaded graphic as raw bytes. Used when we need to
 * re-post the file to the WordPress media library.
 */
export async function downloadGraphicBytes(
  storagePath: string,
): Promise<{ ok: true; bytes: ArrayBuffer } | { ok: false; error: string }> {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.storage
    .from(GRAPHICS_BUCKET)
    .download(storagePath);

  if (error || !data) {
    return { ok: false, error: "Stored graphic download failed" };
  }

  const bytes = await data.arrayBuffer();
  return { ok: true, bytes };
}
