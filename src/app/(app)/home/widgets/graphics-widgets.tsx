import Link from "next/link";
import { Palette } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";
import { WidgetShell } from "./widget-shell";
import type { HomeGraphicCard } from "@/lib/home/widgets";

function GraphicList({
  items,
  emptyTitle,
  emptyDescription,
}: {
  items: HomeGraphicCard[];
  emptyTitle: string;
  emptyDescription?: string;
}) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<Palette className="h-5 w-5" />}
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }
  return (
    <ul className="space-y-1.5">
      {items.map((g) => (
        <li key={g.id}>
          <Link
            href={`/graphics?request=${g.id}`}
            className="flex items-center gap-2 rounded-md border border-transparent px-2 py-1.5 text-xs hover:border-border hover:bg-navy-3/30"
          >
            <span className="flex-1 truncate">
              <span className="font-medium text-text-primary">{g.title}</span>
              <span className="mx-1 text-text-muted">·</span>
              <span className="text-text-secondary">{g.entry_title}</span>
            </span>
            <Badge
              variant="outline"
              className={
                g.graphic_status === "flagged"
                  ? "border-destructive/40 text-destructive text-[9px]"
                  : "text-[9px]"
              }
            >
              {g.graphic_status}
            </Badge>
            <span className="text-[10px] text-text-muted">
              {formatDate(g.created_at)}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function OpenGraphicRequestsWidget({
  items,
}: {
  items: HomeGraphicCard[];
}) {
  return (
    <WidgetShell
      title="Open graphic requests"
      description="Needed or flagged — ready to claim."
      icon={<Palette className="h-4 w-4 text-cyan" />}
      count={items.length}
      seeMoreHref="/graphics"
    >
      <GraphicList
        items={items}
        emptyTitle="Nothing in the queue"
        emptyDescription="Every graphic is either claimed or already delivered."
      />
    </WidgetShell>
  );
}

export function MyActiveGraphicsWidget({
  items,
}: {
  items: HomeGraphicCard[];
}) {
  if (items.length === 0) return null;
  return (
    <WidgetShell
      title="My graphics in progress"
      description="Requests you've claimed."
      icon={<Palette className="h-4 w-4 text-cyan" />}
      count={items.length}
      seeMoreHref="/graphics"
    >
      <GraphicList
        items={items}
        emptyTitle="Nothing claimed"
        emptyDescription="Pick something from the open queue."
      />
    </WidgetShell>
  );
}
