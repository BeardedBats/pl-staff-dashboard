"use client";

import * as React from "react";

/**
 * Returns true when the viewport is narrower than `breakpoint` (default 768px,
 * matching Tailwind's `md:` breakpoint). SSR-safe — defaults to `false` on
 * the server and resolves on first client paint.
 */
export function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = React.useState(false);

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    setIsMobile(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [breakpoint]);

  return isMobile;
}
