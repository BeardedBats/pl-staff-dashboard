import Link from "next/link";
import { AlertTriangle, Calendar, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";
import type { HomeEntryCard } from "@/lib/home/widgets";

type Props = {
  entries: HomeEntryCard[];
  emptyIcon?: React.ReactNode;
  emptyTitle: string;
  emptyDescription?: string;
  /** If true, show a red "overdue" flag on past-due rows. */
  flagOverdue?: boolean;
};

/**
 * Compact list of entries used by every home widget that shows a list.
 * Clicking an entry jumps to its detail view via query param.
 */
export function EntryList({
  entries,
  emptyIcon,
  emptyTitle,
  emptyDescription,
  flagOverdue = false,
}: Props) {
  if (entries.length === 0) {
    return (
      <EmptyState
        icon={emptyIcon}
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }

  const now = new Date();

  return (
    <ul className="space-y-1.5">
      {entries.map((e) => {
        const pub = e.publish_date ? new Date(e.publish_date) : null;
        const overdue =
          flagOverdue && pub !== null && pub.getTime() < now.getTime();

        return (
          <li key={e.id}>
            <Link
              href={`/content?entry=${e.id}`}
              className="flex items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-xs hover:border-border hover:bg-surface-3/30"
            >
              <span className="flex-1 truncate font-medium text-text-cell">
                {e.priority ? (
                  <span className="mr-1 text-amber">★</span>
                ) : null}
                {e.title}
              </span>
              <Badge variant="outline" className="font-data text-[9px]">
                {e.site.toUpperCase()}
              </Badge>
              <span className="hidden shrink-0 font-data text-[10px] text-text-zero sm:inline">
                {e.tier_name}
              </span>
              {pub ? (
                <span
                  className={
                    overdue
                      ? "flex shrink-0 items-center gap-0.5 text-[10px] font-semibold text-destructive"
                      : "flex shrink-0 items-center gap-0.5 text-[10px] text-text-zero"
                  }
                >
                  {overdue ? (
                    <AlertTriangle className="h-2.5 w-2.5" />
                  ) : (
                    <Calendar className="h-2.5 w-2.5" />
                  )}
                  {formatDate(e.publish_date)}
                </span>
              ) : (
                <span className="flex shrink-0 items-center gap-0.5 text-[10px] text-text-zero">
                  <Clock className="h-2.5 w-2.5" />
                  loose
                </span>
              )}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
