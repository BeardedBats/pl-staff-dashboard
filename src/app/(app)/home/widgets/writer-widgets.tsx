import {
  CalendarClock,
  CheckCircle2,
  FilePlus,
  Hourglass,
  ListTodo,
} from "lucide-react";
import { WidgetShell } from "./widget-shell";
import { EntryList } from "./entry-list";
import type { HomeEntryCard } from "@/lib/home/widgets";

export function MyActiveClaimsWidget({
  entries,
}: {
  entries: HomeEntryCard[];
}) {
  return (
    <WidgetShell
      title="My active claims"
      description="Entries you've claimed and still owe."
      icon={<ListTodo className="h-4 w-4 text-cyan" />}
      count={entries.length}
      seeMoreHref="/my-tasks"
    >
      <EntryList
        entries={entries}
        flagOverdue
        emptyIcon={<CheckCircle2 className="h-5 w-5" />}
        emptyTitle="Nothing on your plate"
        emptyDescription="Claim a writer slot when a new tier opens up."
      />
    </WidgetShell>
  );
}

export function MyUpcomingDeadlinesWidget({
  entries,
}: {
  entries: HomeEntryCard[];
}) {
  return (
    <WidgetShell
      title="Upcoming publish dates"
      description="Next 14 days where you're the primary author."
      icon={<CalendarClock className="h-4 w-4 text-cyan" />}
      count={entries.length}
      seeMoreHref="/calendar"
    >
      <EntryList
        entries={entries}
        emptyIcon={<CalendarClock className="h-5 w-5" />}
        emptyTitle="No upcoming deadlines"
      />
    </WidgetShell>
  );
}

export function MyDraftsToApproveWidget({
  entries,
}: {
  entries: HomeEntryCard[];
}) {
  if (entries.length === 0) return null;
  return (
    <WidgetShell
      title="Drafts to approve"
      description="WP drafts matched to you. Approve or discard to bring them into the pipeline."
      icon={<FilePlus className="h-4 w-4 text-amber" />}
      count={entries.length}
      seeMoreHref="/my-tasks"
    >
      <EntryList
        entries={entries}
        emptyIcon={<FilePlus className="h-5 w-5" />}
        emptyTitle="No drafts waiting"
      />
    </WidgetShell>
  );
}

export function MySubmittedInFlightWidget({
  entries,
}: {
  entries: HomeEntryCard[];
}) {
  if (entries.length === 0) return null;
  return (
    <WidgetShell
      title="Submitted — in editing"
      description="Your articles currently with an editor."
      icon={<Hourglass className="h-4 w-4 text-text-muted" />}
      count={entries.length}
    >
      <EntryList
        entries={entries}
        emptyIcon={<Hourglass className="h-5 w-5" />}
        emptyTitle="Nothing in flight"
      />
    </WidgetShell>
  );
}

export function UnclaimedSlotsWidget({
  entries,
}: {
  entries: HomeEntryCard[];
}) {
  return (
    <WidgetShell
      title="Open writer slots"
      description="Tiers and entries looking for a writer."
      icon={<ListTodo className="h-4 w-4 text-cyan" />}
      count={entries.length}
      seeMoreHref="/content?status=writer_needed"
      seeMoreLabel="Browse"
    >
      <EntryList
        entries={entries}
        emptyIcon={<CheckCircle2 className="h-5 w-5" />}
        emptyTitle="All slots filled"
        emptyDescription="Nothing is waiting for a writer right now — come back tomorrow."
      />
    </WidgetShell>
  );
}
