import "server-only";

import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * Supabase Storage helpers for graphics.
 *
 * Bucket name is hardcoded as `graphics`. The bucket is PRIVATE — reads
 * happen via short-lived signed URLs generated server-side by the data
 * fetchers. We never expose `getPublicUrl` results to the browser.
 *
 * Naming convention: {entryId}/{timestamp}-{sanitized-filename}
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

// --------------------------------------------------------------------------
// Validation
// --------------------------------------------------------------------------

export type UploadValidationError =
  | { kind: "too_large"; message: string }
  | { kind: "bad_mime"; message: string }
  | { kind: "empty_file"; message: string };

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
  const ts = Date.now();
  return `${entryId}/${ts}-${safe}`;
}

// --------------------------------------------------------------------------
// Upload
// --------------------------------------------------------------------------

export type UploadedFile = {
  storagePath: string;
  /**
   * Signed URL valid for SIGNED_URL_TTL_SECONDS. The bucket is private,
   * so this URL is the only way to read the object — and it expires.
   * Read-paths should always regenerate, not trust persisted URLs.
   */
  signedUrl: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
};

/**
 * Upload a file buffer to the `graphics` bucket.
 * Returns the storage path + resolved public URL.
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

  const supabase = getSupabaseAdmin();
  const storagePath = buildStoragePath(entryId, fileName);
  const cleanName = sanitizeFilename(fileName);

  const { error } = await supabase.storage
    .from(GRAPHICS_BUCKET)
    .upload(storagePath, data, {
      contentType: mimeType,
      upsert: false,
      cacheControl: "31536000", // 1 year; filename is timestamped so uniqueness is guaranteed
    });

  if (error) {
    return { ok: false, error: `Storage upload failed: ${error.message}` };
  }

  // Return a signed URL so the upload response can preview immediately.
  const { data: signed, error: signError } = await supabase.storage
    .from(GRAPHICS_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SECONDS);

  if (signError || !signed) {
    return { ok: false, error: `Failed to sign URL: ${signError?.message ?? "unknown"}` };
  }

  return {
    ok: true,
    file: {
      storagePath,
      signedUrl: signed.signedUrl,
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
    .createSignedUrl(storagePath, ttl);
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
    .createSignedUrls(valid, ttl);

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
  const supabase = getSupabaseAdmin();
  const { error } = await supabase.storage
    .from(GRAPHICS_BUCKET)
    .remove([storagePath]);

  if (error) return { ok: false, error: error.message };
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
    return { ok: false, error: error?.message ?? "Download failed" };
  }

  const bytes = await data.arrayBuffer();
  return { ok: true, bytes };
}
