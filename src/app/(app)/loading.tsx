import { Skeleton } from "@/components/ui/skeleton";

export default function AppLoading() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading page">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-5 w-full max-w-xl" />
      </div>
      <Skeleton className="h-32 w-full rounded-plpd-card" />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-56 w-full rounded-plpd-card" />
        <Skeleton className="h-56 w-full rounded-plpd-card" />
        <Skeleton className="h-56 w-full rounded-plpd-card" />
      </div>
      <span className="sr-only">Loading dashboard content…</span>
    </div>
  );
}
