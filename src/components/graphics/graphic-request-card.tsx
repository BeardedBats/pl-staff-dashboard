"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import {
  AlertTriangle,
  Check,
  Clock,
  Flag,
  Hand,
  ImageIcon,
  Loader2,
  Send,
  Star,
  Trash2,
  Undo2,
  Upload,
  X,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { UserAvatar } from "@/components/users/user-avatar";
import { GraphicStatusBadge } from "@/components/entries/status-badges";
import type { GraphicRequestRecord } from "@/lib/graphics/data";
import { readApiError } from "@/lib/api/client";

type GraphicRequestCardProps = {
  request: GraphicRequestRecord;
  /** Compact variant for the kanban board — smaller card, no quick actions. */
  compact?: boolean;
  /** When true, show a link to the parent entry. */
  showEntryLink?: boolean;
  /** Callbacks for local state updates so the parent can refetch. */
  onChanged?: () => void;
};

export function GraphicRequestCard({
  request,
  compact = false,
  showEntryLink = false,
  onChanged,
}: GraphicRequestCardProps) {
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [flagDialogOpen, setFlagDialogOpen] = React.useState(false);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  async function runAction(
    key: string,
    fn: () => Promise<Response>,
  ): Promise<boolean> {
    setBusy(key);
    setError(null);
    try {
      const res = await fn();
      if (!res.ok) {
        setError(await readApiError(res, "Action failed"));
        return false;
      }
      onChanged?.();
      return true;
    } catch {
      setError("Network error");
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function handleClaim() {
    await runAction("claim", () =>
      fetch(`/api/graphic-requests/${request.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "claim" }),
      }),
    );
  }

  async function handleUnclaim() {
    await runAction("unclaim", () =>
      fetch(`/api/graphic-requests/${request.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unclaim" }),
      }),
    );
  }

  async function handleUpload(file: File) {
    setBusy("upload");
    setError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`/api/graphic-requests/${request.id}/upload`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        setError(await readApiError(res, "Upload failed"));
      } else {
        onChanged?.();
      }
    } catch {
      setError("Network error");
    } finally {
      setBusy(null);
    }
  }

  async function handleSubmit() {
    await runAction("submit", () =>
      fetch(`/api/graphic-requests/${request.id}/submit`, { method: "POST" }),
    );
  }

  async function handleFlag(reason: string) {
    const ok = await runAction("flag", () =>
      fetch(`/api/graphic-requests/${request.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "flag", reason }),
      }),
    );
    if (ok) setFlagDialogOpen(false);
  }

  async function handleUnflag() {
    await runAction("unflag", () =>
      fetch(`/api/graphic-requests/${request.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unflag" }),
      }),
    );
  }

  async function handleDelete() {
    const confirmed = window.confirm(
      `Delete the graphic request "${request.title}"? This cannot be undone.`,
    );
    if (!confirmed) return;
    await runAction("delete", () =>
      fetch(`/api/graphic-requests/${request.id}`, { method: "DELETE" }),
    );
  }

  const canClaim =
    request.permissions.claim && request.graphic_status === "needed";
  const canUnclaim =
    request.graphic_status === "claimed" && request.permissions.unclaim;
  const canUpload =
    request.permissions.upload && request.graphic_status !== "submitted";
  const canSubmit =
    request.permissions.submit &&
    request.graphic_status === "claimed" &&
    Boolean(request.file_url);
  const canFlag =
    request.permissions.flag &&
    (request.graphic_status === "claimed" ||
      request.graphic_status === "submitted");
  const canUnflag =
    request.permissions.unflag && request.graphic_status === "flagged";
  const canDelete =
    request.graphic_status !== "submitted" && request.permissions.delete;

  return (
    <>
      <div
        className={cn(
          "rounded-md border border-border bg-card transition-colors",
          compact ? "p-3" : "p-4",
          request.graphic_status === "flagged" && "border-destructive/40",
          request.graphic_status === "submitted" && "border-green/30",
        )}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <ImageIcon className="h-3.5 w-3.5 shrink-0 text-text-zero" />
              <h4 className="break-words text-sm font-medium text-text-cell">
                {request.title}
              </h4>
              {request.is_featured ? (
                <Star className="h-3 w-3 shrink-0 fill-amber text-amber" />
              ) : null}
            </div>
            {showEntryLink ? (
              <Link
                href={`/content?entry=${request.entry_id}`}
                className="mt-0.5 break-words text-[11px] text-text-zero hover:text-cyan"
              >
                for &ldquo;{request.entry_title}&rdquo;
              </Link>
            ) : null}
          </div>
          <GraphicStatusBadge status={request.graphic_status} />
        </div>

        {/* Description */}
        {request.description && !compact ? (
          <p className="mt-2 break-words text-xs text-text-team">
            {request.description}
          </p>
        ) : null}

        {/* Thumbnail */}
        {request.file_url ? (
          <a
            href={request.file_url}
            target="_blank"
            rel="noopener noreferrer"
            className="relative mt-3 block h-28 w-full overflow-hidden rounded-sm border border-border"
          >
            <Image
              src={request.file_url}
              alt={request.title}
              fill
              sizes="(max-width: 768px) 100vw, 320px"
              className="object-cover"
              unoptimized
            />
          </a>
        ) : null}

        {/* Meta */}
        <div className="mt-3 space-y-1 text-[11px] text-text-zero">
          {request.urgency_date ? (
            <div className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Due{" "}
              {formatDate(request.urgency_date, {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </div>
          ) : null}
          {request.claimed_by_name ? (
            <div className="flex items-center gap-1.5">
              <Hand className="h-3 w-3" />
              <span>Claimed by</span>
              <UserAvatar
                displayName={request.claimed_by_name}
                avatarUrl={request.claimed_by_avatar}
                size="xs"
              />
              <span className="text-text-team">{request.claimed_by_name}</span>
            </div>
          ) : null}
          {request.file_name ? (
            <div className="flex items-center gap-1 font-data">
              <Upload className="h-3 w-3" />
              {request.file_name}
              {request.current_version_number
                ? ` · v${request.current_version_number}`
                : ""}{" "}
              ·{" "}
              {request.file_size
                ? `${Math.round(request.file_size / 1024)} KB`
                : ""}
            </div>
          ) : null}
          {request.flag_reason ? (
            <div className="flex items-start gap-1 text-destructive">
              <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
              <span>{request.flag_reason}</span>
            </div>
          ) : null}
        </div>

        {/* Actions */}
        {!compact ? (
          <div className="mt-3 flex flex-wrap items-center gap-1">
            {canClaim ? (
              <Button
                size="sm"
                onClick={handleClaim}
                disabled={busy === "claim"}
              >
                {busy === "claim" ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Hand className="h-3 w-3" />
                )}
                Claim
              </Button>
            ) : null}
            {canUnclaim ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleUnclaim}
                disabled={busy === "unclaim"}
              >
                <Undo2 className="h-3 w-3" />
                Release
              </Button>
            ) : null}
            {canUpload ? (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleUpload(file);
                    e.target.value = "";
                  }}
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={busy === "upload"}
                >
                  {busy === "upload" ? (
                    <Loader2 className="h-3 w-3 animate-spin" />
                  ) : (
                    <Upload className="h-3 w-3" />
                  )}
                  {request.file_url ? "Replace file" : "Upload file"}
                </Button>
              </>
            ) : null}
            {canSubmit ? (
              <Button
                size="sm"
                variant="amber"
                onClick={handleSubmit}
                disabled={busy === "submit"}
                title="Finalize: push to WordPress media library and set as featured image"
              >
                {busy === "submit" ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Send className="h-3 w-3" />
                )}
                Submit to WP
              </Button>
            ) : null}
            {canFlag ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setFlagDialogOpen(true)}
                disabled={busy === "flag"}
                className="text-destructive"
              >
                <Flag className="h-3 w-3" />
                Flag
              </Button>
            ) : null}
            {canUnflag ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleUnflag}
                disabled={busy === "unflag"}
              >
                <Check className="h-3 w-3" />
                Unflag
              </Button>
            ) : null}
            {canDelete ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleDelete}
                disabled={busy === "delete"}
                className="ml-auto text-destructive"
                aria-label="Delete"
                title="Delete request"
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            ) : null}
          </div>
        ) : null}

        {error ? (
          <p className="mt-2 flex items-center gap-1 text-xs text-destructive">
            <X className="h-3 w-3" />
            {error}
          </p>
        ) : null}
      </div>

      <FlagDialog
        open={flagDialogOpen}
        onOpenChange={setFlagDialogOpen}
        onConfirm={handleFlag}
        busy={busy === "flag"}
      />
    </>
  );
}

function FlagDialog({
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
          <DialogTitle>Flag this graphic</DialogTitle>
          <DialogDescription>
            Flagging returns the request to the graphics team with a note. They
            can unflag and resubmit after fixing the issue.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="flag-reason">What&apos;s wrong?</Label>
          <Textarea
            id="flag-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            placeholder="e.g. Wrong color scheme; headshot is too small; typo in player name"
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
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            Flag
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
