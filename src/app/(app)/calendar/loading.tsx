import { Skeleton } from "@/components/ui/skeleton";

/**
 * Calendar loading state. FullCalendar's first paint is heavy enough
 * that the spinner-only fallback felt janky — we mock the toolbar +
 * a 7×5 grid to keep the visual frame stable.
 */
export default function CalendarLoading() {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-80" />
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-8 w-20" />
        <Skeleton className="ml-auto h-8 w-40" />
      </div>

      {/* Day-of-week header */}
      <div className="grid grid-cols-7 gap-px">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-6 w-full" />
        ))}
      </div>

      {/* 5-week grid */}
      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-lg border border-border">
        {Array.from({ length: 35 }).map((_, i) => (
          <div key={i} className="aspect-square space-y-1 bg-card p-2">
            <Skeleton className="h-3 w-6" />
            {i % 3 === 0 ? <Skeleton className="h-3 w-full" /> : null}
            {i % 5 === 0 ? <Skeleton className="h-3 w-3/4" /> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
