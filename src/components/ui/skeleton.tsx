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
      className={cn(
        "animate-pulse rounded-md bg-navy-3/60 dark:bg-navy-3/60",
        className,
      )}
      {...props}
    />
  );
}
