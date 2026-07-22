import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Minimal skeleton primitive. Renders a pulsing rounded div in the
 * surface tone so layouts don't shift when async data loads.
 *
 * Example:
 *   <Skeleton className="h-4 w-32" />
 *   <Skeleton className="aspect-square w-full" />
 */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      data-plpd-state="loading"
      className={cn(
        "plpd-state-frame animate-pulse rounded-sm border border-border-row",
        className,
      )}
      {...props}
    />
  );
}
