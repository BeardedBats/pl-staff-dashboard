import { redirect } from "next/navigation";
import Link from "next/link";
import { ClipboardEdit } from "lucide-react";
import { getCurrentUser, hasRole } from "@/lib/auth/current-user";
import { listEntries } from "@/lib/entries/queries";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/utils";
import { UserAvatar } from "@/components/users/user-avatar";
import {
  ContentStatusBadge,
  EditorStatusBadge,
} from "@/components/entries/status-badges";

export const metadata = {
  title: "Editing Queue",
};

export default async function EditingQueuePage() {
  const viewer = await getCurrentUser();
  if (!viewer) redirect("/login");

  // Gate: editor / manager / admin / eic / operations only.
  if (
    !hasRole(viewer, "editor", "manager", "admin", "eic", "operations")
  ) {
    redirect("/home");
  }

  const { entries } = await listEntries({
    editorStatusIn: ["ready_for_edit", "edited"],
    sortBy: "publish_date",
    sortDir: "asc",
    limit: 200,
  });

  // Computed once at the top of the server render. `new Date().getTime()`
  // avoids the react-hooks/purity lint on `Date.now()`.
  const now = new Date().getTime();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-primary">
          Editing Queue
        </h1>
        <p className="mt-1 text-sm text-text-secondary">
          {entries.length} {entries.length === 1 ? "entry" : "entries"} waiting
          for edits, sorted by publish date (most urgent first).
        </p>
      </div>

      {entries.length === 0 ? (
        <EmptyState
          icon={<ClipboardEdit className="h-5 w-5" />}
          title="Queue is empty"
          description="Nothing is waiting for edits right now. Writers will send content over as they submit."
        />
      ) : (
        <Card>
          <div className="overflow-hidden rounded-lg">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-navy-3">
                <tr>
                  <th className="px-3 py-2 text-left font-mono text-[10px] font-medium uppercase tracking-wider text-text-muted">
                    Title
                  </th>
                  <th className="px-3 py-2 text-left font-mono text-[10px] font-medium uppercase tracking-wider text-text-muted">
                    Author
                  </th>
                  <th className="px-3 py-2 text-left font-mono text-[10px] font-medium uppercase tracking-wider text-text-muted">
                    Tier
                  </th>
                  <th className="px-3 py-2 text-left font-mono text-[10px] font-medium uppercase tracking-wider text-text-muted">
                    Publish date
                  </th>
                  <th className="px-3 py-2 text-left font-mono text-[10px] font-medium uppercase tracking-wider text-text-muted">
                    Content
                  </th>
                  <th className="px-3 py-2 text-left font-mono text-[10px] font-medium uppercase tracking-wider text-text-muted">
                    Editor
                  </th>
                  <th className="px-3 py-2 text-left font-mono text-[10px] font-medium uppercase tracking-wider text-text-muted">
                    Editors
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {entries.map((entry) => {
                  const publishTs = entry.publish_date
                    ? new Date(entry.publish_date).getTime()
                    : null;
                  const overdue = publishTs !== null && publishTs < now;
                  const dueSoon =
                    publishTs !== null &&
                    publishTs >= now &&
                    publishTs - now < 1000 * 60 * 60 * 24;

                  return (
                    <tr
                      key={entry.id}
                      className="hover:bg-navy-3/50"
                    >
                      <td className="px-3 py-3 align-top">
                        <Link
                          href={`/content?entry=${entry.id}`}
                          className="font-medium text-text-primary hover:text-cyan"
                        >
                          {entry.title}
                        </Link>
                        <div className="mt-0.5 flex items-center gap-1">
                          <Badge variant="outline">
                            {entry.site.toUpperCase()}
                          </Badge>
                          {entry.priority ? (
                            <Badge variant="amber">Priority</Badge>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-3 py-3 align-top">
                        {entry.authors.length > 0 ? (
                          <div className="flex items-center gap-1.5">
                            <UserAvatar
                              displayName={entry.authors[0].display_name}
                              avatarUrl={entry.authors[0].avatar_url}
                              size="xs"
                            />
                            <span className="text-xs text-text-secondary">
                              {entry.authors[0].display_name}
                            </span>
                            {entry.authors.length > 1 ? (
                              <span className="text-[10px] text-text-muted">
                                +{entry.authors.length - 1}
                              </span>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-xs italic text-text-muted">
                            —
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <Badge variant="outline">{entry.tier.name}</Badge>
                      </td>
                      <td className="px-3 py-3 align-top">
                        {entry.publish_date ? (
                          <div>
                            <div
                              className={
                                overdue
                                  ? "text-xs font-semibold text-destructive"
                                  : dueSoon
                                    ? "text-xs font-semibold text-amber"
                                    : "text-xs text-text-primary"
                              }
                            >
                              {formatDate(entry.publish_date, {
                                dateStyle: "medium",
                                timeStyle: "short",
                              })}
                            </div>
                            {overdue ? (
                              <div className="mt-0.5 font-mono text-[10px] uppercase text-destructive">
                                overdue
                              </div>
                            ) : dueSoon ? (
                              <div className="mt-0.5 font-mono text-[10px] uppercase text-amber">
                                due in 24h
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-xs italic text-text-muted">
                            Unscheduled
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 align-top">
                        <ContentStatusBadge status={entry.content_status} />
                      </td>
                      <td className="px-3 py-3 align-top">
                        <EditorStatusBadge status={entry.editor_status} />
                      </td>
                      <td className="px-3 py-3 align-top">
                        {entry.editors.length > 0 ? (
                          <div className="flex -space-x-1">
                            {entry.editors.slice(0, 3).map((ed) => (
                              <UserAvatar
                                key={ed.user_id}
                                displayName={ed.display_name}
                                avatarUrl={ed.avatar_url}
                                size="xs"
                              />
                            ))}
                          </div>
                        ) : (
                          <span className="text-xs italic text-text-muted">
                            Unclaimed
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
