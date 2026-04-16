import { CheckCircle2, ClipboardEdit, Inbox } from "lucide-react";
import { WidgetShell } from "./widget-shell";
import { EntryList } from "./entry-list";
import type { HomeEntryCard } from "@/lib/home/widgets";

export function EditorQueueWidget({ entries }: { entries: HomeEntryCard[] }) {
  return (
    <WidgetShell
      title="Editing queue"
      description="Submitted articles waiting for a first-pass edit."
      icon={<Inbox className="h-4 w-4 text-cyan" />}
      count={entries.length}
      seeMoreHref="/editing-queue"
    >
      <EntryList
        entries={entries}
        flagOverdue
        emptyIcon={<CheckCircle2 className="h-5 w-5" />}
        emptyTitle="Queue is empty"
        emptyDescription="Every submitted article has an editor on it."
      />
    </WidgetShell>
  );
}

export function MyActiveEditsWidget({ entries }: { entries: HomeEntryCard[] }) {
  if (entries.length === 0) return null;
  return (
    <WidgetShell
      title="My active edits"
      description="Articles currently assigned to you."
      icon={<ClipboardEdit className="h-4 w-4 text-cyan" />}
      count={entries.length}
      seeMoreHref="/editing-queue"
    >
      <EntryList
        entries={entries}
        flagOverdue
        emptyIcon={<ClipboardEdit className="h-5 w-5" />}
        emptyTitle="Nothing assigned to you"
      />
    </WidgetShell>
  );
}
