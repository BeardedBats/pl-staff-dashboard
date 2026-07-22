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
import type { AppRole, AppSite } from "@/lib/auth/current-user";
import { readApiError } from "@/lib/api/client";

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

const POLISHING_TEMPLATES = [
  {
    label: "Editor comments",
    text: "Address the editor comments and resubmit with the requested revisions.",
  },
  {
    label: "Opening",
    text: "Strengthen the opening and make the main takeaway clear earlier.",
  },
  {
    label: "Fact check",
    text: "Verify the facts, links, names, and statistics called out in the draft.",
  },
  {
    label: "Structure",
    text: "Tighten the structure, remove repetition, and clarify the conclusion.",
  },
] as const;

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
    roles: AppRole[];
    role_rows: Array<{ role: AppRole; site: AppSite }>;
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
            role_rows: meRes.user.role_rows ?? [],
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
      if (!res.ok) {
        setActionError(await readApiError(res, "Action failed"));
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
        <Loader2 className="h-4 w-4 animate-spin text-text-zero" />
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
  const hasSiteRole = (...roles: AppRole[]) =>
    me?.role_rows.some(
      (row) =>
        roles.includes(row.role) &&
        (row.site === "both" || row.site === entry.site),
    ) ?? false;
  const isEditorLike = hasSiteRole(
    "editor",
    "manager",
    "admin",
    "eic",
    "operations",
  );
  const isAdminLike = hasSiteRole("admin", "eic", "operations");
  const canViewAnalytics = hasSiteRole("eic", "operations");
  const isAuthor = entry.authors.some((a) => a.user_id === me?.id);
  const isAssignedEditor = entry.editors.some((e) => e.user_id === me?.id);
  const isParticipant =
    entry.created_by === me?.id || isAuthor || isAssignedEditor;
  const isManagerLike = hasSiteRole(
    "manager",
    "admin",
    "eic",
    "operations",
  );
  const canEditChecklist = isAuthor || isAssignedEditor || isAdminLike;
  const canClaimWriter = hasSiteRole(
    "writer",
    "manager",
    "admin",
    "eic",
    "operations",
  );
  const canCreateGraphic = isParticipant || isManagerLike;
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
    entry.content_status === "submitted" &&
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
      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-md border border-border bg-surface-3/40 p-3">
        {isClaimableContent && canClaimWriter ? (
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
              <span className="ml-1 font-data text-[10px] opacity-70">
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
          {canViewAnalytics ? (
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
            canEditChecklist={canEditChecklist}
            onGraphicsChanged={() => {
              void reload();
              onChanged();
            }}
            onCreateGraphic={
              canCreateGraphic ? () => setCreateGraphicOpen(true) : undefined
            }
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
              isAdminLike
            }
          />
        </TabsContent>

        <TabsContent value="audit">
          <AuditTab entryId={entryId} />
        </TabsContent>
        {canViewAnalytics ? (
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
        <Badge variant="outline" className="font-data">
          {entry.tier.name} — {entry.tier.label}
        </Badge>
        <Badge variant="outline" className="font-data">{entry.site.toUpperCase()}</Badge>
        {entry.category ? (
          <Badge variant="outline" className="font-data">{entry.category.name}</Badge>
        ) : null}
        {entry.series ? (
          <Badge variant="cyan" className="font-data">
            Series: {resolveSeriesLabel(entry.series.title_pattern, entry)}
          </Badge>
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
  canEditChecklist,
  onGraphicsChanged,
  onCreateGraphic,
  onChecklistToggle,
}: {
  entry: EntryDetail;
  graphicRequests: GraphicRequestRecord[];
  canEditChecklist: boolean;
  onGraphicsChanged: () => void;
  onCreateGraphic?: () => void;
  onChecklistToggle: (itemId: string, nextCompleted: boolean) => Promise<void>;
}) {
  return (
    <div className="space-y-5">
      <ReadinessPanel entry={entry} graphicRequests={graphicRequests} />
      <div className="grid gap-5 lg:grid-cols-[2fr_1fr]">
      <div className="space-y-5">
        <div className="rounded-md border border-border bg-card p-4">
          <h4 className="mb-3 font-sans text-[10px] font-medium uppercase tracking-wider text-text-zero">
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
            <h4 className="mb-2 font-sans text-[10px] font-medium uppercase tracking-wider text-text-zero">
              Brief
            </h4>
            <p className="whitespace-pre-wrap rounded-md border border-border bg-surface-3/40 p-3 text-sm text-text-team">
              {entry.description}
            </p>
          </section>
        ) : null}

        {entry.checklist.length > 0 ? (
          <section>
            <h4 className="mb-2 font-sans text-[10px] font-medium uppercase tracking-wider text-text-zero">
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
          <h4 className="mb-3 font-sans text-[10px] font-medium uppercase tracking-wider text-text-zero">
            Meta
          </h4>
          <dl className="grid grid-cols-[auto_1fr] items-center gap-x-2 gap-y-2 text-xs">
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
              <>
                <dt className="flex items-center gap-1 text-text-zero">
                  <Pencil className="h-3 w-3" />
                  <span className="uppercase tracking-wider">Created by</span>
                </dt>
                <dd className="justify-self-end">
                  <Link
                    href={`/staff/${entry.creator.id}`}
                    className="flex items-center gap-1.5 text-text-team hover:text-cyan"
                  >
                    <UserAvatar
                      displayName={entry.creator.display_name}
                      avatarUrl={entry.creator.avatar_url}
                      size="xs"
                    />
                    {entry.creator.display_name}
                  </Link>
                </dd>
              </>
            ) : null}
          </dl>
        </section>

        <section>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="flex items-center gap-1.5 font-sans text-[10px] font-medium uppercase tracking-wider text-text-zero">
              <ImageIcon className="h-3 w-3" />
              Graphics ({graphicRequests.length})
            </h4>
            {onCreateGraphic ? (
              <Button size="sm" variant="outline" onClick={onCreateGraphic}>
                <ImageIcon className="h-3 w-3" />
                Request
              </Button>
            ) : null}
          </div>
          {graphicRequests.length === 0 ? (
            <p className="rounded-md border border-dashed border-border bg-card/50 p-3 text-center text-xs text-text-zero">
              No graphic requests yet. Click &quot;Request&quot; to add one.
            </p>
          ) : (
            <div className="space-y-2">
              {graphicRequests.map((g) => (
                <GraphicRequestCard
                  key={g.id}
                  request={g}
                  onChanged={onGraphicsChanged}
                />
              ))}
            </div>
          )}
        </section>

      </div>
      </div>
    </div>
  );
}

function ReadinessPanel({
  entry,
  graphicRequests,
}: {
  entry: EntryDetail;
  graphicRequests: GraphicRequestRecord[];
}) {
  const requiredChecklist = entry.checklist.filter((item) => item.is_required);
  const checks = [
    {
      label: "Writer assigned",
      ready: entry.authors.length > 0,
      detail: entry.authors.length > 0 ? "Assigned" : "Needs a writer",
    },
    {
      label: "Required checklist",
      ready: requiredChecklist.every((item) => item.is_completed),
      detail: `${requiredChecklist.filter((item) => item.is_completed).length}/${requiredChecklist.length} complete`,
    },
    {
      label: "Editorial review",
      ready: ["edited", "scheduled", "published"].includes(entry.editor_status),
      detail: entry.editor_status === "edited" ? "Edited" : entry.editor_status.replaceAll("_", " "),
    },
    {
      label: "Graphics",
      ready:
        graphicRequests.length === 0 ||
        graphicRequests.every((request) => request.graphic_status === "submitted"),
      detail:
        graphicRequests.length === 0
          ? "Not requested"
          : `${graphicRequests.filter((request) => request.graphic_status === "submitted").length}/${graphicRequests.length} approved`,
    },
    {
      label: "Publish date",
      ready: Boolean(entry.publish_date),
      detail: entry.publish_date ? "Scheduled target set" : "Date needed",
    },
    {
      label: "WordPress draft",
      ready: Boolean(entry.wp_post_id),
      detail: entry.wp_post_id ? "Connected" : "Draft needed",
    },
  ];
  const blockers = checks.filter((check) => !check.ready);

  return (
    <section className="rounded-md border border-border bg-card p-4" aria-labelledby="readiness-heading">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 id="readiness-heading" className="text-sm font-semibold text-text-cell">
            Publication readiness
          </h3>
          <p className="mt-0.5 text-xs text-text-team">
            {blockers.length === 0
              ? "All tracked handoff requirements are ready."
              : `${blockers.length} ${blockers.length === 1 ? "blocker" : "blockers"} before publication.`}
          </p>
        </div>
        <Badge variant={blockers.length === 0 ? "cyan" : "amber"}>
          {blockers.length === 0 ? "Ready" : `Next: ${blockers[0].label}`}
        </Badge>
      </div>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {checks.map((check) => (
          <li key={check.label} className="flex items-start gap-2 rounded-sm border border-border px-2 py-2">
            {check.ready ? (
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-cyan" />
            ) : (
              <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber" />
            )}
            <div>
              <p className="text-xs font-medium text-text-cell">{check.label}</p>
              <p className="text-[10px] text-text-zero">{check.detail}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// --------------------------------------------------------------------------
// Audit tab
// --------------------------------------------------------------------------

function AuditTab({ entryId }: { entryId: string }) {
  const [events, setEvents] = React.useState<AuditEvent[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/entries/${entryId}/audit`);
        if (!response.ok) {
          if (!cancelled) {
            setError(await readApiError(response, "Unable to load handoff history"));
          }
          return;
        }
        const data = (await response.json()) as { events: AuditEvent[] };
        if (!cancelled) setEvents(data.events ?? []);
      } catch {
        if (!cancelled) setError("Unable to load handoff history. Try again.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [entryId]);

  if (error) {
    return (
      <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        {error}
      </p>
    );
  }

  if (events === null) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-4 w-4 animate-spin text-text-zero" />
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <p className="rounded-md border border-dashed border-border bg-card/50 p-6 text-center text-sm text-text-zero">
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
            <span className="font-medium text-text-cell">
              {evt.actor?.display_name ?? "System"}
            </span>
            <Badge variant="outline">{auditActionLabel(evt.action)}</Badge>
            <span className="text-xs text-text-zero">
              {formatDate(evt.created_at, {
                dateStyle: "short",
                timeStyle: "short",
              })}
            </span>
          </div>
          <p className="mt-1 text-xs text-text-team">
            {auditEventSummary(evt)}
          </p>
        </li>
      ))}
    </ol>
  );
}

function auditActionLabel(action: string): string {
  return action.replaceAll("_", " ");
}

function auditEventSummary(event: AuditEvent): string {
  if (
    event.field_name === "content_status" &&
    event.new_value?.startsWith("polishing:")
  ) {
    return `Sent to the writer for polishing — ${event.new_value.replace(/^polishing:\s*/, "")}`;
  }
  const field = event.field_name?.replaceAll("_", " ");
  const before = event.old_value?.replaceAll("_", " ");
  const after = event.new_value?.replaceAll("_", " ");
  if (field && before && after) return `${field}: ${before} → ${after}`;
  if (field && after) return `${field}: ${after}`;
  if (after) return after;
  return "Recorded in the entry handoff history.";
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
          <Label>Start with a feedback template</Label>
          <div className="flex flex-wrap gap-1.5">
            {POLISHING_TEMPLATES.map((template) => (
              <Button
                key={template.label}
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setReason(template.text)}
              >
                {template.label}
              </Button>
            ))}
          </div>
        </div>
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
      <p className="mb-1.5 font-sans text-[10px] uppercase tracking-wider text-text-zero">
        {label}
      </p>
      <div className="mb-2">{badge}</div>
      {people.length > 0 ? (
        <ul className="space-y-1">
          {people.map((p) => (
            <li key={p.name} className="flex items-center gap-1.5 text-xs">
              <UserAvatar displayName={p.name} avatarUrl={p.avatar} size="xs" />
              <span className="text-text-team">{p.name}</span>
              <span className="font-data text-[10px] text-text-zero">
                {p.role}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-text-zero">{emptyText}</p>
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
    <>
      <dt className="flex items-center gap-1 text-text-zero">
        {icon}
        <span className="uppercase tracking-wider">{label}</span>
      </dt>
      <dd className="justify-self-end text-text-team">{value}</dd>
    </>
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
        canEdit && !busy && "cursor-pointer hover:bg-surface-3",
        busy && "opacity-60",
      )}
    >
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin text-text-zero" />
      ) : item.is_completed ? (
        <CheckCircle2 className="h-4 w-4 text-green" />
      ) : (
        <Circle className="h-4 w-4 text-text-zero" />
      )}
      <span
        className={
          item.is_completed
            ? "text-text-zero line-through"
            : item.is_required
              ? "text-text-team"
              : "text-text-zero"
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
        <Loader2 className="h-4 w-4 animate-spin text-text-zero" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="py-6 text-center text-xs text-text-zero">
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
    <div className="rounded-md border border-border bg-surface-3/40 p-2">
      <div className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-text-zero">
        {icon}
        {label}
      </div>
      <div
        className={cn(
          "mt-0.5 font-data text-base font-semibold tabular-nums",
          highlight ? "text-amber" : "text-text-cell",
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

// --------------------------------------------------------------------------
// Series label token resolution
//
// The recurring-template title_pattern can carry tokens like {date} that
// the generator expands at entry-creation time. The detail panel doesn't
// run that generator — it shows the raw pattern from the template. This
// helper resolves the date-style tokens against the entry's own date so
// staff never see a literal `{DATE}` in the badge.
//
// Format intentionally short ("Apr 15") to fit inside the badge — the
// generator uses long format ("April 15") which is fine in the article
// title but too wide for a chip.
// --------------------------------------------------------------------------
function resolveSeriesLabel(
  pattern: string,
  entry: { publish_date: string | null; created_at: string },
): string {
  const iso = entry.publish_date ?? entry.created_at;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return pattern.replace(/\{[^}]+\}/g, "").trim();

  const shortDate = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(d);
  const longMonth = new Intl.DateTimeFormat("en-US", {
    month: "long",
    timeZone: "UTC",
  }).format(d);
  const weekday = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    timeZone: "UTC",
  }).format(d);

  return pattern
    .replace(/\{date\}/gi, shortDate)
    .replace(/\{month\}/gi, longMonth)
    .replace(/\{day_of_week\}/gi, weekday);
}
