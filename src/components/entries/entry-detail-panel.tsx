"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Archive,
  ArchiveRestore,
  BarChart3,
  CheckCircle2,
  Circle,
  Clock,
  DollarSign,
  Edit3,
  ExternalLink,
  Eye,
  FileText,
  Image as ImageIcon,
  Loader2,
  Pencil,
  RefreshCw,
  Send,
  Undo2,
  UserCheck,
  X,
  Hand,
  History,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UserAvatar } from "@/components/users/user-avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  ContentStatusBadge,
  EditorStatusBadge,
  GraphicStatusBadge,
} from "./status-badges";
import { CreateGraphicRequestDialog } from "@/components/graphics/create-graphic-request-dialog";
import { GraphicRequestCard } from "@/components/graphics/graphic-request-card";
import { CommentThread } from "@/components/comments/comment-thread";
import type { EntryDetail } from "@/lib/entries/queries";
import type { GraphicRequestRecord } from "@/lib/graphics/data";

type EntryDetailPanelProps = {
  entryId: string;
  onClose: () => void;
  onChanged: () => void;
};

type AuditEvent = {
  id: string;
  action: string;
  field_name: string | null;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
  actor: { id: string; display_name: string; avatar_url: string | null } | null;
};

export function EntryDetailPanel({
  entryId,
  onClose,
  onChanged,
}: EntryDetailPanelProps) {
  const [entry, setEntry] = React.useState<EntryDetail | null>(null);
  const [graphicRequests, setGraphicRequests] = React.useState<
    GraphicRequestRecord[]
  >([]);
  const [me, setMe] = React.useState<{
    id: string;
    roles: string[];
    can_publish: boolean;
  } | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);
  const [busyAction, setBusyAction] = React.useState<string | null>(null);

  const [polishDialogOpen, setPolishDialogOpen] = React.useState(false);
  const [archiveDialogOpen, setArchiveDialogOpen] = React.useState(false);
  const [createGraphicOpen, setCreateGraphicOpen] = React.useState(false);

  const reload = React.useCallback(async () => {
    const [entryRes, graphicsRes] = await Promise.all([
      fetch(`/api/entries/${entryId}`).then((r) => r.json()),
      fetch(`/api/graphic-requests?entryId=${entryId}`).then((r) => r.json()),
    ]);
    if (entryRes.entry) setEntry(entryRes.entry);
    else setError(entryRes.error ?? "Failed to load");
    setGraphicRequests(graphicsRes.requests ?? []);
  }, [entryId]);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    Promise.all([
      fetch(`/api/entries/${entryId}`).then((r) => r.json()),
      fetch(`/api/graphic-requests?entryId=${entryId}`).then((r) => r.json()),
      fetch(`/api/auth/me`).then((r) => r.json()),
    ])
      .then(([entryRes, graphicsRes, meRes]) => {
        if (cancelled) return;
        if (entryRes.entry) setEntry(entryRes.entry);
        else setError(entryRes.error ?? "Failed to load");
        setGraphicRequests(graphicsRes.requests ?? []);
        if (meRes.user) {
          setMe({
            id: meRes.user.id,
            roles: meRes.user.roles ?? [],
            can_publish: Boolean(meRes.user.can_publish),
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [entryId]);

  async function runAction(
    key: string,
    fn: () => Promise<Response>,
  ): Promise<boolean> {
    setBusyAction(key);
    setActionError(null);
    try {
      const res = await fn();
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setActionError(data.error ?? "Action failed");
        return false;
      }
      await reload();
      onChanged();
      return true;
    } catch {
      setActionError("Network error");
      return false;
    } finally {
      setBusyAction(null);
    }
  }

  async function handleClaim() {
    await runAction("claim", () =>
      fetch(`/api/entries/${entryId}/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role_type: "writer" }),
      }),
    );
  }

  async function handleSubmit() {
    await runAction("submit", () =>
      fetch(`/api/entries/${entryId}/content-status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "submit" }),
      }),
    );
  }

  async function handleSendToPolishing(reason: string) {
    const ok = await runAction("polish", () =>
      fetch(`/api/entries/${entryId}/content-status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send_to_polishing", reason }),
      }),
    );
    if (ok) setPolishDialogOpen(false);
  }

  async function handleClaimEdit() {
    await runAction("claim-edit", () =>
      fetch(`/api/entries/${entryId}/editor-status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "claim" }),
      }),
    );
  }

  async function handleMarkEdited() {
    await runAction("mark-edited", () =>
      fetch(`/api/entries/${entryId}/editor-status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_edited" }),
      }),
    );
  }

  async function handleWpRefresh() {
    await runAction("wp-refresh", () =>
      fetch(`/api/entries/${entryId}/wp-refresh`, { method: "POST" }),
    );
  }

  async function handleArchive(reason: string) {
    const ok = await runAction("archive", () =>
      fetch(`/api/entries/${entryId}/archive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      }),
    );
    if (ok) setArchiveDialogOpen(false);
  }

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

  // Compute which actions the viewer can take.
  const isEditorLike =
    me?.roles.some((r) =>
      ["editor", "manager", "admin", "eic", "operations"].includes(r),
    ) ?? false;
  const isAdminLike =
    me?.roles.some((r) => ["admin", "eic", "operations"].includes(r)) ??
    false;
  const isAuthor = entry.authors.some((a) => a.user_id === me?.id);
  const canEditChecklist = isAuthor || isEditorLike || isAdminLike;
  const missingRequired = entry.checklist.filter(
    (c) => c.is_required && !c.is_completed,
  );
  const submitGateBlocked = missingRequired.length > 0;
  const isClaimableContent = entry.content_status === "writer_needed";
  const canSubmit =
    isAuthor &&
    (entry.content_status === "claimed" || entry.content_status === "polishing");
  const canSendToPolishing =
    isEditorLike && entry.content_status === "submitted";
  const canClaimEdit =
    isEditorLike &&
    entry.editor_status === "ready_for_edit" &&
    !entry.editors.some((e) => e.user_id === me?.id);
  const canMarkEdited =
    isEditorLike &&
    entry.content_status === "submitted" &&
    (entry.editor_status === "ready_for_edit" || entry.editor_status === "edited");
  const canWpRefresh = Boolean(entry.wp_post_id);
  const canArchive = !entry.is_archived;

  return (
    <div className="px-6 py-5">
      <EntryTopBar
        entry={entry}
        onClose={onClose}
        onWpRefresh={canWpRefresh ? handleWpRefresh : undefined}
        wpRefreshing={busyAction === "wp-refresh"}
      />

      {/* Action bar */}
      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-md border border-border bg-navy-3/40 p-3">
        {isClaimableContent ? (
          <Button
            size="sm"
            onClick={handleClaim}
            disabled={busyAction === "claim"}
          >
            {busyAction === "claim" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Hand className="h-3.5 w-3.5" />
            )}
            Claim to write
          </Button>
        ) : null}

        {canSubmit ? (
          <Button
            size="sm"
            onClick={handleSubmit}
            disabled={busyAction === "submit" || submitGateBlocked}
            title={
              submitGateBlocked
                ? `Checklist incomplete (${missingRequired.length} required): ${missingRequired
                    .map((m) => m.label)
                    .join(", ")}`
                : undefined
            }
          >
            {busyAction === "submit" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            Submit
            {submitGateBlocked ? (
              <span className="ml-1 font-mono text-[10px] opacity-70">
                ({missingRequired.length} to check)
              </span>
            ) : null}
          </Button>
        ) : null}

        {canSendToPolishing ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setPolishDialogOpen(true)}
            disabled={busyAction === "polish"}
          >
            <Undo2 className="h-3.5 w-3.5" />
            Send to polishing
          </Button>
        ) : null}

        {canClaimEdit ? (
          <Button
            size="sm"
            variant="amber"
            onClick={handleClaimEdit}
            disabled={busyAction === "claim-edit"}
          >
            {busyAction === "claim-edit" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <UserCheck className="h-3.5 w-3.5" />
            )}
            Claim edit
          </Button>
        ) : null}

        {canMarkEdited ? (
          <Button
            size="sm"
            variant="amber"
            onClick={handleMarkEdited}
            disabled={busyAction === "mark-edited"}
            title="Marks the editor track as edited. Scheduling happens in WordPress."
          >
            {busyAction === "mark-edited" ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            Mark edited
          </Button>
        ) : null}

        <div className="ml-auto flex items-center gap-1">
          {canArchive ? (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setArchiveDialogOpen(true)}
              className="text-destructive hover:bg-destructive/10"
            >
              <Archive className="h-3.5 w-3.5" />
              Archive…
            </Button>
          ) : (
            <Badge variant="danger">
              <ArchiveRestore className="h-2.5 w-2.5" />
              Archived
            </Badge>
          )}
        </div>
      </div>

      {actionError ? (
        <p className="mt-2 rounded-sm border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {actionError}
        </p>
      ) : null}

      <Tabs defaultValue="pipeline" className="mt-5">
        <TabsList>
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="comments">Comments</TabsTrigger>
          <TabsTrigger value="audit">
            <History className="mr-1 h-3 w-3" />
            Audit
          </TabsTrigger>
          {isAdminLike ? (
            <TabsTrigger value="analytics">
              <BarChart3 className="mr-1 h-3 w-3" />
              Analytics
            </TabsTrigger>
          ) : null}
        </TabsList>

        <TabsContent value="pipeline">
          <PipelineTab
            entry={entry}
            graphicRequests={graphicRequests}
            currentUserId={me?.id ?? ""}
            canEditChecklist={canEditChecklist}
            onGraphicsChanged={() => {
              void reload();
              onChanged();
            }}
            onCreateGraphic={() => setCreateGraphicOpen(true)}
            onChecklistToggle={async (itemId, nextCompleted) => {
              const res = await fetch(
                `/api/entries/${entryId}/checklist/${itemId}`,
                {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ is_completed: nextCompleted }),
                },
              );
              if (res.ok) {
                await reload();
              }
            }}
          />
        </TabsContent>

        <TabsContent value="comments">
          <CommentThread
            entryId={entryId}
            currentUserId={me?.id ?? ""}
            isAdmin={
              me?.roles.some((r) =>
                ["admin", "eic", "operations"].includes(r),
              ) ?? false
            }
          />
        </TabsContent>

        <TabsContent value="audit">
          <AuditTab entryId={entryId} />
        </TabsContent>
        {isAdminLike ? (
          <TabsContent value="analytics">
            <EntryAnalyticsMini entryId={entryId} />
          </TabsContent>
        ) : null}
      </Tabs>

      {/* Modals */}
      <PolishingDialog
        open={polishDialogOpen}
        onOpenChange={setPolishDialogOpen}
        onConfirm={handleSendToPolishing}
        busy={busyAction === "polish"}
      />
      <ArchiveDialog
        open={archiveDialogOpen}
        onOpenChange={setArchiveDialogOpen}
        onConfirm={handleArchive}
        busy={busyAction === "archive"}
      />
      <CreateGraphicRequestDialog
        open={createGraphicOpen}
        onOpenChange={setCreateGraphicOpen}
        entryId={entryId}
        onCreated={() => {
          setCreateGraphicOpen(false);
          void reload();
          onChanged();
        }}
      />
    </div>
  );
}

// --------------------------------------------------------------------------
// Top bar
// --------------------------------------------------------------------------

function EntryTopBar({
  entry,
  onClose,
  onWpRefresh,
  wpRefreshing,
}: {
  entry: EntryDetail;
  onClose: () => void;
  onWpRefresh: (() => Promise<void>) | undefined;
  wpRefreshing: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex flex-wrap items-center gap-2">
        {entry.priority ? (
          <Badge variant="amber">
            <AlertTriangle className="h-2.5 w-2.5" />
            Priority
          </Badge>
        ) : null}
        <Badge variant="outline">
          {entry.tier.name} — {entry.tier.label}
        </Badge>
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
        {onWpRefresh ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => void onWpRefresh()}
            disabled={wpRefreshing}
            title="Refresh status from WordPress"
          >
            {wpRefreshing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Refresh WP
          </Button>
        ) : null}
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close">
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Pipeline tab
// --------------------------------------------------------------------------

function PipelineTab({
  entry,
  graphicRequests,
  currentUserId,
  canEditChecklist,
  onGraphicsChanged,
  onCreateGraphic,
  onChecklistToggle,
}: {
  entry: EntryDetail;
  graphicRequests: GraphicRequestRecord[];
  currentUserId: string;
  canEditChecklist: boolean;
  onGraphicsChanged: () => void;
  onCreateGraphic: () => void;
  onChecklistToggle: (itemId: string, nextCompleted: boolean) => Promise<void>;
}) {
  return (
    <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
      <div className="space-y-5">
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
                graphicRequests.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {graphicRequests.map((g) => (
                      <GraphicStatusBadge key={g.id} status={g.graphic_status} />
                    ))}
                  </div>
                ) : (
                  <Badge variant="outline">—</Badge>
                )
              }
              people={[]}
              emptyText={
                graphicRequests.length === 0
                  ? "No graphic requests"
                  : `${graphicRequests.length} ${graphicRequests.length === 1 ? "request" : "requests"}`
              }
            />
          </div>
          {entry.editor_status === "edited" ? (
            <p className="mt-3 rounded-sm border border-cyan/30 bg-cyan-dim px-3 py-2 text-xs text-cyan">
              Content is finalized. Next: schedule the post in WordPress. The
              dashboard will automatically flip to &quot;Scheduled&quot; (and
              eventually &quot;Published&quot;) the next time you hit Refresh
              WP, or when the Step 10 sync cron runs.
            </p>
          ) : null}
        </div>

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

        {entry.checklist.length > 0 ? (
          <section>
            <h4 className="mb-2 font-mono text-[10px] font-medium uppercase tracking-wider text-text-muted">
              Pre-submission checklist (
              {entry.checklist.filter((c) => c.is_completed).length}/
              {entry.checklist.length})
            </h4>
            <ul className="space-y-1">
              {entry.checklist.map((item) => (
                <li key={item.id}>
                  <ChecklistItemRow
                    item={item}
                    canEdit={canEditChecklist}
                    onToggle={onChecklistToggle}
                  />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

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
                entry.word_count > 0 ? entry.word_count.toLocaleString() : "—"
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

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="flex items-center gap-1.5 font-mono text-[10px] font-medium uppercase tracking-wider text-text-muted">
              <ImageIcon className="h-3 w-3" />
              Graphics ({graphicRequests.length})
            </h4>
            <Button size="sm" variant="outline" onClick={onCreateGraphic}>
              <ImageIcon className="h-3 w-3" />
              Request
            </Button>
          </div>
          {graphicRequests.length === 0 ? (
            <p className="rounded-md border border-dashed border-border bg-card/50 p-3 text-center text-xs italic text-text-muted">
              No graphic requests yet. Click &quot;Request&quot; to add one.
            </p>
          ) : (
            <div className="space-y-2">
              {graphicRequests.map((g) => (
                <GraphicRequestCard
                  key={g.id}
                  request={g}
                  currentUserId={currentUserId}
                  onChanged={onGraphicsChanged}
                />
              ))}
            </div>
          )}
        </section>

        <section className="rounded-md border border-dashed border-border bg-navy-3/30 p-3 text-xs text-text-muted">
          <p className="font-semibold uppercase tracking-wider text-text-muted">
            Coming in later steps
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4">
            <li>Comments thread + @mentions → Step 6</li>
            <li>Discord + email notifications → Step 7</li>
            <li>Full WP sync cron → Step 10</li>
          </ul>
        </section>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Audit tab
// --------------------------------------------------------------------------

function AuditTab({ entryId }: { entryId: string }) {
  const [events, setEvents] = React.useState<AuditEvent[] | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    fetch(`/api/entries/${entryId}/audit`)
      .then((r) => r.json())
      .then((data: { events: AuditEvent[] }) => {
        if (!cancelled) setEvents(data.events ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [entryId]);

  if (events === null) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-text-muted" />
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border bg-card/50 p-6 text-center text-sm text-text-muted">
        No audit events yet.
      </p>
    );
  }

  return (
    <ol className="relative space-y-3 border-l border-border pl-6">
      {events.map((evt) => (
        <li key={evt.id} className="relative">
          <span className="absolute -left-[31px] top-1 h-2 w-2 rounded-full border border-cyan bg-card" />
          <div className="flex items-center gap-2 text-sm">
            {evt.actor ? (
              <UserAvatar
                displayName={evt.actor.display_name}
                avatarUrl={evt.actor.avatar_url}
                size="xs"
              />
            ) : null}
            <span className="font-medium text-text-primary">
              {evt.actor?.display_name ?? "System"}
            </span>
            <Badge variant="outline">{evt.action}</Badge>
            <span className="text-xs text-text-muted">
              {formatDate(evt.created_at, {
                dateStyle: "short",
                timeStyle: "short",
              })}
            </span>
          </div>
          {evt.field_name ? (
            <p className="mt-1 font-mono text-xs text-text-secondary">
              <span className="text-text-muted">{evt.field_name}:</span>{" "}
              {evt.old_value ? (
                <>
                  <span className="line-through opacity-60">{evt.old_value}</span>
                  {" → "}
                </>
              ) : null}
              <span>{evt.new_value ?? "—"}</span>
            </p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

// --------------------------------------------------------------------------
// Polishing dialog
// --------------------------------------------------------------------------

function PolishingDialog({
  open,
  onOpenChange,
  onConfirm,
  busy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
  busy: boolean;
}) {
  const [reason, setReason] = React.useState("");

  React.useEffect(() => {
    if (!open) setReason("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send back for polishing</DialogTitle>
          <DialogDescription>
            Leave a note for the writer explaining what needs to change. The
            entry will return to the writer&apos;s queue.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="polishing-reason">What needs fixing?</Label>
          <Textarea
            id="polishing-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            placeholder="Be specific — the writer uses this to know what to revise."
          />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            onClick={() => onConfirm(reason.trim())}
            disabled={busy || !reason.trim()}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Send back
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --------------------------------------------------------------------------
// Archive dialog
// --------------------------------------------------------------------------

function ArchiveDialog({
  open,
  onOpenChange,
  onConfirm,
  busy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: string) => void;
  busy: boolean;
}) {
  const [reason, setReason] = React.useState("");

  React.useEffect(() => {
    if (!open) setReason("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Archive entry</DialogTitle>
          <DialogDescription>
            Archived entries are hidden from the main table but never deleted.
            Admins archive directly; other staff file a pending request.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="archive-reason">Why archive?</Label>
          <Textarea
            id="archive-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            placeholder="e.g. Duplicate of another entry; no longer relevant; scope changed"
          />
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => onConfirm(reason.trim())}
            disabled={busy || !reason.trim()}
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
            Archive
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --------------------------------------------------------------------------
// Small shared components
// --------------------------------------------------------------------------

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

// --------------------------------------------------------------------------
// Interactive checklist item row
// --------------------------------------------------------------------------

function ChecklistItemRow({
  item,
  canEdit,
  onToggle,
}: {
  item: {
    id: string;
    label: string;
    is_completed: boolean;
    is_required: boolean;
  };
  canEdit: boolean;
  onToggle: (itemId: string, nextCompleted: boolean) => Promise<void>;
}) {
  const [busy, setBusy] = React.useState(false);

  async function handleClick() {
    if (!canEdit || busy) return;
    setBusy(true);
    try {
      await onToggle(item.id, !item.is_completed);
    } finally {
      setBusy(false);
    }
  }

  const Wrapper = canEdit ? "button" : "div";

  return (
    <Wrapper
      type={canEdit ? "button" : undefined}
      onClick={canEdit ? handleClick : undefined}
      disabled={canEdit && busy ? true : undefined}
      className={cn(
        "flex w-full items-center gap-2 rounded-sm border border-border bg-card px-3 py-2 text-left text-sm",
        canEdit && !busy && "cursor-pointer hover:bg-navy-3",
        busy && "opacity-60",
      )}
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin text-text-muted" />
      ) : item.is_completed ? (
        <CheckCircle2 className="h-4 w-4 text-success" />
      ) : (
        <Circle className="h-4 w-4 text-text-muted" />
      )}
      <span
        className={
          item.is_completed
            ? "text-text-muted line-through"
            : item.is_required
              ? "text-text-secondary"
              : "text-text-muted"
        }
      >
        {item.label}
      </span>
      {item.is_required ? (
        <Badge variant="outline" className="ml-auto">
          Required
        </Badge>
      ) : null}
    </Wrapper>
  );
}

// --------------------------------------------------------------------------
// Per-entry analytics mini — EIC/Ops only
// --------------------------------------------------------------------------

type MiniStats = {
  totalPageviews: number;
  totalSessions: number;
  totalEarnings: number;
  pageRpm: number;
  days: Array<{ date: string; pageviews: number }>;
};

function EntryAnalyticsMini({ entryId }: { entryId: string }) {
  const [data, setData] = React.useState<MiniStats | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);

    // Fetch last 30 days of this entry's GA4 + Raptive data
    Promise.all([
      fetch(
        `/api/analytics/articles?dateFrom=${thirtyDaysAgo()}&dateTo=${today()}`,
      ).then((r) => r.json()),
    ])
      .then(([articlesRes]: [{ rows?: Array<{
        entry_id: string;
        pageviews: number;
        sessions: number;
        earnings: number;
        page_rpm: number;
      }> }]) => {
        if (cancelled) return;
        const row = (articlesRes.rows ?? []).find(
          (r) => r.entry_id === entryId,
        );
        if (row) {
          setData({
            totalPageviews: row.pageviews,
            totalSessions: row.sessions,
            totalEarnings: row.earnings,
            pageRpm: row.page_rpm,
            days: [],
          });
        } else {
          setData(null);
        }
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [entryId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-text-muted" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="py-6 text-center text-xs text-text-muted">
        No analytics data for this entry in the last 30 days.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 py-2 sm:grid-cols-4">
      <MiniMetric
        label="Pageviews"
        value={data.totalPageviews.toLocaleString()}
        icon={<Eye className="h-3 w-3" />}
      />
      <MiniMetric
        label="Sessions"
        value={data.totalSessions.toLocaleString()}
        icon={<BarChart3 className="h-3 w-3" />}
      />
      <MiniMetric
        label="Revenue"
        value={`$${data.totalEarnings.toFixed(2)}`}
        icon={<DollarSign className="h-3 w-3" />}
        highlight
      />
      <MiniMetric
        label="Page RPM"
        value={`$${data.pageRpm.toFixed(2)}`}
        icon={<BarChart3 className="h-3 w-3" />}
      />
    </div>
  );
}

function MiniMetric({
  label,
  value,
  icon,
  highlight,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-md border border-border bg-navy-3/40 p-2">
      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-text-muted">
        {icon}
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 text-base font-semibold tabular-nums",
          highlight ? "text-amber" : "text-text-primary",
        )}
      >
        {value}
      </div>
    </div>
  );
}

function thirtyDaysAgo(): string {
  const d = new Date();
  d.setDate(d.getDate() - 29);
  return d.toISOString().slice(0, 10);
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
