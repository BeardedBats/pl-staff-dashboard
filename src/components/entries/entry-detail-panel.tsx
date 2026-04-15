"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Archive,
  CheckCircle2,
  Circle,
  Clock,
  Edit3,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Loader2,
  Pencil,
  X,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { UserAvatar } from "@/components/users/user-avatar";
import {
  ContentStatusBadge,
  EditorStatusBadge,
  GraphicStatusBadge,
} from "./status-badges";
import type { EntryDetail } from "@/lib/entries/queries";

type EntryDetailPanelProps = {
  entryId: string;
  onClose: () => void;
  onChanged: () => void;
};

export function EntryDetailPanel({
  entryId,
  onClose,
  onChanged,
}: EntryDetailPanelProps) {
  const [entry, setEntry] = React.useState<EntryDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Fetch full detail when the row expands.
  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/entries/${entryId}`)
      .then((r) => r.json())
      .then((data: { entry?: EntryDetail; error?: string }) => {
        if (cancelled) return;
        if (data.entry) {
          setEntry(data.entry);
        } else {
          setError(data.error ?? "Failed to load entry");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [entryId]);

  if (loading && !entry) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-text-muted" />
      </div>
    );
  }

  if (error || !entry) {
    return (
      <div className="flex items-center justify-between px-6 py-4 text-sm text-destructive">
        <span>{error ?? "Entry not found"}</span>
        <Button variant="ghost" size="sm" onClick={onClose}>
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="px-6 py-5">
      {/* Top bar */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {entry.priority ? (
            <Badge variant="amber">
              <AlertTriangle className="h-2.5 w-2.5" />
              Priority
            </Badge>
          ) : null}
          <Badge variant="outline">{entry.tier.name} — {entry.tier.label}</Badge>
          <Badge variant="outline">{entry.site.toUpperCase()}</Badge>
          {entry.category ? (
            <Badge variant="outline">{entry.category.name}</Badge>
          ) : null}
          {entry.series ? (
            <Badge variant="cyan">Series: {entry.series.title_pattern}</Badge>
          ) : null}
          {entry.is_archived ? (
            <Badge variant="danger">
              <Archive className="h-2.5 w-2.5" />
              Archived
            </Badge>
          ) : null}
        </div>

        <div className="flex items-center gap-1">
          {entry.wp_post_url ? (
            <Button variant="outline" size="sm" asChild>
              <Link
                href={entry.wp_post_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Edit in WordPress
              </Link>
            </Button>
          ) : null}
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
        {/* Left: tracks + description + checklist */}
        <div className="space-y-5">
          {/* Three status tracks row */}
          <div className="rounded-md border border-border bg-card p-4">
            <h4 className="mb-3 font-mono text-[10px] font-medium uppercase tracking-wider text-text-muted">
              Pipeline
            </h4>
            <div className="grid gap-3 sm:grid-cols-3">
              <TrackSummary
                label="Content"
                badge={<ContentStatusBadge status={entry.content_status} />}
                people={entry.authors.map((a) => ({
                  name: a.display_name,
                  avatar: a.avatar_url,
                  role: a.role === "primary" ? "Primary" : "Co-author",
                }))}
                emptyText="No writer yet"
              />
              <TrackSummary
                label="Editor"
                badge={<EditorStatusBadge status={entry.editor_status} />}
                people={entry.editors.map((e) => ({
                  name: e.display_name,
                  avatar: e.avatar_url,
                  role: "Editor",
                }))}
                emptyText={
                  entry.content_status === "submitted"
                    ? "Waiting for editor"
                    : "Not in editing queue yet"
                }
              />
              <TrackSummary
                label="Graphics"
                badge={
                  entry.graphic_requests.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {entry.graphic_requests.map((g) => (
                        <GraphicStatusBadge
                          key={g.id}
                          status={g.graphic_status}
                        />
                      ))}
                    </div>
                  ) : (
                    <Badge variant="outline">—</Badge>
                  )
                }
                people={[]}
                emptyText={
                  entry.graphic_requests.length === 0
                    ? "No graphic requests"
                    : `${entry.graphic_requests.length} ${entry.graphic_requests.length === 1 ? "request" : "requests"}`
                }
              />
            </div>
            <p className="mt-3 text-[11px] italic text-text-muted">
              Status transitions (claim, submit, send to polishing, schedule)
              are wired in Step 4. This view is read-only for now.
            </p>
          </div>

          {/* Description */}
          {entry.description ? (
            <section>
              <h4 className="mb-2 font-mono text-[10px] font-medium uppercase tracking-wider text-text-muted">
                Brief
              </h4>
              <p className="whitespace-pre-wrap rounded-md border border-border bg-navy-3/40 p-3 text-sm text-text-secondary">
                {entry.description}
              </p>
            </section>
          ) : null}

          {/* Checklist */}
          {entry.checklist.length > 0 ? (
            <section>
              <h4 className="mb-2 font-mono text-[10px] font-medium uppercase tracking-wider text-text-muted">
                Pre-submission checklist ({
                  entry.checklist.filter((c) => c.is_completed).length
                }
                /{entry.checklist.length})
              </h4>
              <ul className="space-y-1">
                {entry.checklist.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center gap-2 rounded-sm border border-border bg-card px-3 py-2 text-sm"
                  >
                    {item.is_completed ? (
                      <CheckCircle2 className="h-4 w-4 text-success" />
                    ) : (
                      <Circle className="h-4 w-4 text-text-muted" />
                    )}
                    <span
                      className={
                        item.is_completed
                          ? "text-text-muted line-through"
                          : "text-text-secondary"
                      }
                    >
                      {item.label}
                    </span>
                    {item.is_required ? (
                      <Badge variant="outline" className="ml-auto">
                        Required
                      </Badge>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        {/* Right: meta + actions */}
        <div className="space-y-4">
          <section className="rounded-md border border-border bg-card p-4">
            <h4 className="mb-3 font-mono text-[10px] font-medium uppercase tracking-wider text-text-muted">
              Meta
            </h4>
            <dl className="space-y-2 text-xs">
              <MetaRow
                icon={<Clock className="h-3 w-3" />}
                label="Publish"
                value={
                  entry.publish_date
                    ? formatDate(entry.publish_date, {
                        dateStyle: "medium",
                        timeStyle:
                          entry.publish_date_precision === "exact" ||
                          entry.publish_date_precision === "loose_time"
                            ? "short"
                            : undefined,
                      })
                    : "Unscheduled"
                }
              />
              <MetaRow
                icon={<FileText className="h-3 w-3" />}
                label="Words"
                value={
                  entry.word_count > 0
                    ? entry.word_count.toLocaleString()
                    : "—"
                }
              />
              <MetaRow
                icon={<Edit3 className="h-3 w-3" />}
                label="Updated"
                value={formatDate(entry.updated_at, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              />
              {entry.creator ? (
                <div className="flex items-center justify-between gap-2 text-text-secondary">
                  <div className="flex items-center gap-1 text-text-muted">
                    <Pencil className="h-3 w-3" />
                    <span className="uppercase tracking-wider">Created by</span>
                  </div>
                  <Link
                    href={`/staff/${entry.creator.id}`}
                    className="flex items-center gap-1.5 text-text-secondary hover:text-cyan"
                  >
                    <UserAvatar
                      displayName={entry.creator.display_name}
                      avatarUrl={entry.creator.avatar_url}
                      size="xs"
                    />
                    {entry.creator.display_name}
                  </Link>
                </div>
              ) : null}
            </dl>
          </section>

          {/* Graphic requests */}
          {entry.graphic_requests.length > 0 ? (
            <section>
              <h4 className="mb-2 font-mono text-[10px] font-medium uppercase tracking-wider text-text-muted">
                Graphic requests
              </h4>
              <ul className="space-y-1">
                {entry.graphic_requests.map((g) => (
                  <li
                    key={g.id}
                    className="rounded-sm border border-border bg-card px-3 py-2 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 font-medium text-text-primary">
                        <ImageIcon className="h-3 w-3" />
                        {g.title}
                      </span>
                      <GraphicStatusBadge status={g.graphic_status} />
                    </div>
                    {g.flag_reason ? (
                      <p className="mt-1 text-destructive">
                        Flagged: {g.flag_reason}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          {/* Step 4 placeholders */}
          <section className="rounded-md border border-dashed border-border bg-navy-3/30 p-3 text-xs text-text-muted">
            <p className="font-semibold uppercase tracking-wider text-text-muted">
              Coming in Step 4
            </p>
            <ul className="mt-1 list-disc pl-4">
              <li>Claim this entry (writer / editor)</li>
              <li>Submit / send back to polishing / mark edited</li>
              <li>Schedule to WordPress</li>
              <li>Comments + audit trail</li>
              <li>Request archive</li>
            </ul>
          </section>

          {/* Called out for onChanged usage — will trigger in Step 4 */}
          <button type="button" hidden onClick={onChanged} />
        </div>
      </div>

      <Separator className="mt-5" />
    </div>
  );
}

function TrackSummary({
  label,
  badge,
  people,
  emptyText,
}: {
  label: string;
  badge: React.ReactNode;
  people: Array<{ name: string; avatar: string | null; role: string }>;
  emptyText: string;
}) {
  return (
    <div>
      <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wider text-text-muted">
        {label}
      </p>
      <div className="mb-2">{badge}</div>
      {people.length > 0 ? (
        <ul className="space-y-1">
          {people.map((p) => (
            <li key={p.name} className="flex items-center gap-1.5 text-xs">
              <UserAvatar displayName={p.name} avatarUrl={p.avatar} size="xs" />
              <span className="text-text-secondary">{p.name}</span>
              <span className="font-mono text-[10px] text-text-muted">
                {p.role}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs italic text-text-muted">{emptyText}</p>
      )}
    </div>
  );
}

function MetaRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-text-secondary">
      <div className="flex items-center gap-1 text-text-muted">
        {icon}
        <span className="uppercase tracking-wider">{label}</span>
      </div>
      <span className="text-text-secondary">{value}</span>
    </div>
  );
}
