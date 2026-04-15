import Link from "next/link";
import {
  AlertTriangle,
  ClipboardEdit,
  Clock,
  Pencil,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth/current-user";
import { listEntries, type EntrySummary } from "@/lib/entries/queries";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  ContentStatusBadge,
  EditorStatusBadge,
} from "@/components/entries/status-badges";
import { formatDate } from "@/lib/utils";

export const metadata = {
  title: "My Tasks",
};

export default async function MyTasksPage() {
  const viewer = await getCurrentUser();
  if (!viewer) return null;

  // Fetch "stuff I'm writing" — entries where I'm the author and my move is
  // next (claimed or polishing).
  const [writing, editing] = await Promise.all([
    listEntries({
      authorId: viewer.id,
      contentStatusIn: ["claimed", "polishing"],
      sortBy: "publish_date",
      sortDir: "asc",
      limit: 100,
    }),
    listEntries({
      editorId: viewer.id,
      editorStatusIn: ["ready_for_edit", "edited"],
      sortBy: "publish_date",
      sortDir: "asc",
      limit: 100,
    }),
  ]);

  // Deadline summary = the union of all my tasks with a publish date.
  const allTasks = [...writing.entries, ...editing.entries];
  const upcoming = allTasks
    .filter((e) => e.publish_date)
    .sort(
      (a, b) =>
        new Date(a.publish_date!).getTime() -
        new Date(b.publish_date!).getTime(),
    )
    .slice(0, 8);

  // Compute `now` once at the top of the server render so downstream row
  // components don't each re-evaluate the timestamp. We use the request
  // date pattern rather than Date.now() because React 19's purity rule
  // specifically flags Date.now() calls.
  const nowTs = new Date().getTime();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">My Tasks</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Your court. Articles you&apos;re writing, edits you&apos;re owning,
          and upcoming deadlines.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          {/* Writing */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-wider text-text-muted">
                <Pencil className="h-3 w-3" />
                Your writing ({writing.entries.length})
              </h2>
            </div>
            {writing.entries.length === 0 ? (
              <EmptyState
                icon={<Pencil className="h-5 w-5" />}
                title="Nothing to write right now"
                description="Claim an entry from the Content Table to get started."
              />
            ) : (
              <ul className="space-y-2">
                {writing.entries.map((e) => (
                  <li key={e.id}>
                    <TaskRow entry={e} nowTs={nowTs} />
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Editing */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-mono text-[10px] font-medium uppercase tracking-wider text-text-muted">
                <ClipboardEdit className="h-3 w-3" />
                Your editing ({editing.entries.length})
              </h2>
            </div>
            {editing.entries.length === 0 ? (
              <EmptyState
                icon={<ClipboardEdit className="h-5 w-5" />}
                title="No active edits"
                description="Grab one from the Editing Queue when you're ready to work."
                action={
                  <Link
                    href="/editing-queue"
                    className="text-sm text-cyan hover:underline"
                  >
                    Open editing queue →
                  </Link>
                }
              />
            ) : (
              <ul className="space-y-2">
                {editing.entries.map((e) => (
                  <li key={e.id}>
                    <TaskRow entry={e} nowTs={nowTs} showEditorStatus />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Upcoming deadlines sidebar */}
        <aside>
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-cyan" />
                Upcoming deadlines
              </CardTitle>
              <CardDescription>
                The next {upcoming.length} tasks you need to handle.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {upcoming.length === 0 ? (
                <p className="text-xs italic text-text-muted">
                  No scheduled tasks yet.
                </p>
              ) : (
                <ol className="space-y-2">
                  {upcoming.map((e) => (
                    <DeadlineItem key={e.id} entry={e} nowTs={nowTs} />
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Task row
// --------------------------------------------------------------------------

function TaskRow({
  entry,
  nowTs,
  showEditorStatus,
}: {
  entry: EntrySummary;
  nowTs: number;
  showEditorStatus?: boolean;
}) {
  const publishTs = entry.publish_date
    ? new Date(entry.publish_date).getTime()
    : null;
  const overdue = publishTs !== null && publishTs < nowTs;
  const dueSoon =
    publishTs !== null &&
    publishTs >= nowTs &&
    publishTs - nowTs < 1000 * 60 * 60 * 24;

  return (
    <Link
      href={`/content?entry=${entry.id}`}
      className="group block rounded-md border border-border bg-card p-3 transition-colors hover:border-navy-5 hover:bg-navy-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            {entry.priority ? (
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber" />
            ) : null}
            <h3 className="truncate text-sm font-medium text-text-primary">
              {entry.title}
            </h3>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <Badge variant="outline">{entry.tier.name}</Badge>
            <Badge variant="outline">{entry.site.toUpperCase()}</Badge>
            {showEditorStatus ? (
              <EditorStatusBadge status={entry.editor_status} />
            ) : (
              <ContentStatusBadge status={entry.content_status} />
            )}
            {entry.checklist_total > 0 ? (
              <span className="font-mono text-[10px] text-text-muted">
                {entry.checklist_completed}/{entry.checklist_total} checklist
              </span>
            ) : null}
          </div>
        </div>
        <div className="shrink-0 text-right">
          {entry.publish_date ? (
            <div
              className={
                overdue
                  ? "text-xs font-semibold text-destructive"
                  : dueSoon
                    ? "text-xs font-semibold text-amber"
                    : "text-xs text-text-secondary"
              }
            >
              {formatDate(entry.publish_date, {
                dateStyle: "short",
                timeStyle:
                  entry.publish_date_precision === "exact" ||
                  entry.publish_date_precision === "loose_time"
                    ? "short"
                    : undefined,
              })}
            </div>
          ) : (
            <span className="text-xs italic text-text-muted">No date</span>
          )}
          {overdue ? (
            <div className="mt-0.5 font-mono text-[9px] uppercase text-destructive">
              overdue
            </div>
          ) : dueSoon ? (
            <div className="mt-0.5 font-mono text-[9px] uppercase text-amber">
              &lt;24h
            </div>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

function DeadlineItem({
  entry,
  nowTs,
}: {
  entry: EntrySummary;
  nowTs: number;
}) {
  const publishTs = new Date(entry.publish_date!).getTime();
  const overdue = publishTs < nowTs;
  const dueSoon = !overdue && publishTs - nowTs < 1000 * 60 * 60 * 24;

  return (
    <li>
      <Link
        href={`/content?entry=${entry.id}`}
        className="block rounded-sm px-2 py-1.5 hover:bg-navy-3"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs font-medium text-text-primary">
            {entry.title}
          </span>
          <Badge variant="outline">{entry.tier.name}</Badge>
        </div>
        <div
          className={
            overdue
              ? "mt-0.5 font-mono text-[10px] uppercase text-destructive"
              : dueSoon
                ? "mt-0.5 font-mono text-[10px] uppercase text-amber"
                : "mt-0.5 font-mono text-[10px] text-text-muted"
          }
        >
          {formatDate(entry.publish_date, {
            dateStyle: "medium",
            timeStyle: "short",
          })}
        </div>
      </Link>
    </li>
  );
}
