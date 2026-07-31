"use client";

import * as React from "react";

/**
 * Returns true when the viewport is narrower than `breakpoint` (default 768px,
 * matching Tailwind's `md:` breakpoint). SSR-safe — defaults to `false` on
 * the server and resolves on first client paint.
 */
export function useIsMobile(breakpoint = 768): boolean {
  const query = `(max-width: ${breakpoint - 1}px)`;
  return React.useSyncExternalStore(
    React.useCallback((onChange) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    }, [query]),
    React.useCallback(() => window.matchMedia(query).matches, [query]),
    () => false,
  );
}
