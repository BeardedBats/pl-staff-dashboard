"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ClipboardCheck, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { UserAvatar } from "@/components/users/user-avatar";
import { ContentStatusBadge, EditorStatusBadge } from "@/components/entries/status-badges";
import { readApiError } from "@/lib/api/client";
import type { EntrySummary } from "@/lib/entries/queries";
import { formatDate } from "@/lib/utils";

type QueueView = "risk" | "overdue" | "due-soon" | "unclaimed" | "mine";

function risk(entry: EntrySummary, now: number) {
  const publish = entry.publish_date ? new Date(entry.publish_date).getTime() : null;
  if (publish !== null && publish < now) return { score: 4, label: "Past deadline", variant: "danger" as const };
  if (publish !== null && publish - now < 86_400_000) return { score: 3, label: "Due <24h", variant: "amber" as const };
  if (entry.editor_status === "ready_for_edit" && now - new Date(entry.updated_at).getTime() > 86_400_000) {
    return { score: 2, label: "Waiting >24h", variant: "amber" as const };
  }
  return { score: 1, label: "On track", variant: "outline" as const };
}

export function EditingQueueClient({
  entries,
  viewerId,
  nowIso,
}: {
  entries: EntrySummary[];
  viewerId: string;
  nowIso: string;
}) {
  const router = useRouter();
  const now = new Date(nowIso).getTime();
  const [view, setView] = React.useState<QueueView>("risk");
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  const [busy, setBusy] = React.useState(false);
  const [feedback, setFeedback] = React.useState<{ kind: "success" | "error"; message: string } | null>(null);

  const visible = React.useMemo(() => {
    const filtered = entries.filter((entry) => {
      const signal = risk(entry, now);
      if (view === "overdue") return signal.score === 4;
      if (view === "due-soon") return signal.score >= 3;
      if (view === "unclaimed") return entry.editors.length === 0 && entry.editor_status === "ready_for_edit" && entry.content_status === "submitted";
      if (view === "mine") return entry.editors.some((editor) => editor.user_id === viewerId);
      return true;
    });
    return filtered.sort((a, b) => {
      const riskDelta = risk(b, now).score - risk(a, now).score;
      if (riskDelta !== 0) return riskDelta;
      return (a.publish_date ?? "9999").localeCompare(b.publish_date ?? "9999");
    });
  }, [entries, now, view, viewerId]);

  const claimable = visible.filter(
    (entry) => entry.content_status === "submitted" && entry.editor_status === "ready_for_edit" && entry.editors.length === 0,
  );
  const selectedIds = claimable.filter((entry) => selected.has(entry.id)).map((entry) => entry.id);

  async function claimSelected() {
    if (!window.confirm(`Claim ${selectedIds.length} selected ${selectedIds.length === 1 ? "edit" : "edits"}?`)) return;
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch("/api/entries/bulk-claim-edits", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entry_ids: selectedIds }),
      });
      if (!response.ok) {
        setFeedback({ kind: "error", message: await readApiError(response, "Unable to claim selected edits") });
        return;
      }
      const result = (await response.json()) as { claimed: number };
      setFeedback({ kind: "success", message: `${result.claimed} ${result.claimed === 1 ? "edit" : "edits"} added to My Work.` });
      setSelected(new Set());
      router.refresh();
    } catch {
      setFeedback({ kind: "error", message: "Unable to claim selected edits. Check your connection and try again." });
    } finally {
      setBusy(false);
    }
  }

  const views: Array<{ id: QueueView; label: string }> = [
    { id: "risk", label: "Risk first" },
    { id: "overdue", label: "Past deadline" },
    { id: "due-soon", label: "Due in 24h" },
    { id: "unclaimed", label: "Unclaimed" },
    { id: "mine", label: "My edits" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2" aria-label="Saved queue views">
        {views.map((queueView) => (
          <Button
            key={queueView.id}
            size="sm"
            variant={view === queueView.id ? "amber" : "outline"}
            onClick={() => {
              setView(queueView.id);
              setSelected(new Set());
            }}
          >
            {queueView.label}
          </Button>
        ))}
      </div>

      {selectedIds.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-cyan/30 bg-cyan-dim/20 px-3 py-2">
          <span className="text-xs text-text-cell">{selectedIds.length} selected</span>
          <Button size="sm" onClick={() => void claimSelected()} disabled={busy}>
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ClipboardCheck className="h-3.5 w-3.5" />}
            Claim selected
          </Button>
        </div>
      ) : null}
      {feedback ? (
        <p
          role={feedback.kind === "error" ? "alert" : "status"}
          className={feedback.kind === "error" ? "rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive" : "rounded-md border border-cyan/30 bg-cyan-dim/20 p-3 text-xs text-cyan"}
        >
          {feedback.message}
        </p>
      ) : null}

      {visible.length === 0 ? (
        <EmptyState title="This queue is clear" description="Choose another saved queue view or check back later." />
      ) : (
        <Card>
          <div className="plpd-table-shell overflow-x-auto">
            <table className="plpd-table min-w-[850px] font-data">
              <thead className="plpd-thead border-b border-border-thead">
                <tr>
                  <th className="w-10 px-3 py-2 text-left">
                    <Checkbox
                      aria-label="Select all claimable edits"
                      checked={claimable.length > 0 && selectedIds.length === claimable.length}
                      onCheckedChange={(checked) => setSelected(new Set(checked ? claimable.slice(0, 25).map((entry) => entry.id) : []))}
                    />
                  </th>
                  {['Risk', 'Title', 'Author', 'Publish date', 'Content', 'Editor', 'Assigned editors'].map((label) => (
                    <th key={label} className="px-3 py-2 text-left font-data text-[13px] font-semibold uppercase tracking-wide text-cyan-header">{label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visible.map((entry) => {
                  const signal = risk(entry, now);
                  const canClaim = entry.content_status === "submitted" && entry.editor_status === "ready_for_edit" && entry.editors.length === 0;
                  return (
                    <tr key={entry.id} data-row-state={signal.score >= 3 ? "priority" : undefined}>
                      <td className="px-3 py-3 align-top">
                        <Checkbox
                          aria-label={`Select ${entry.title}`}
                          disabled={!canClaim}
                          checked={selected.has(entry.id)}
                          onCheckedChange={(checked) => setSelected((current) => {
                            const next = new Set(current);
                            if (checked && next.size < 25) next.add(entry.id); else next.delete(entry.id);
                            return next;
                          })}
                        />
                      </td>
                      <td className="px-3 py-3 align-top"><Badge variant={signal.variant}>{signal.label}</Badge></td>
                      <td className="px-3 py-3 align-top">
                        <Link href={`/content?entry=${entry.id}`} className="font-medium text-text-cell hover:text-cyan">{entry.title}</Link>
                        <div className="mt-1 flex gap-1"><Badge variant="outline">{entry.site.toUpperCase()}</Badge>{entry.priority ? <Badge variant="amber"><AlertTriangle className="h-3 w-3" />Priority</Badge> : null}</div>
                      </td>
                      <td className="px-3 py-3 align-top text-xs text-text-team">
                        {entry.authors[0] ? <span className="flex items-center gap-1.5"><UserAvatar displayName={entry.authors[0].display_name} avatarUrl={entry.authors[0].avatar_url} size="xs" />{entry.authors[0].display_name}</span> : "Unassigned"}
                      </td>
                      <td className="px-3 py-3 align-top text-xs text-text-cell">{entry.publish_date ? formatDate(entry.publish_date, { dateStyle: "medium", timeStyle: "short" }) : "Unscheduled"}</td>
                      <td className="px-3 py-3 align-top"><ContentStatusBadge status={entry.content_status} /></td>
                      <td className="px-3 py-3 align-top"><EditorStatusBadge status={entry.editor_status} /></td>
                      <td className="px-3 py-3 align-top text-xs text-text-team">{entry.editors.length > 0 ? entry.editors.map((editor) => editor.display_name).join(", ") : "Unclaimed"}</td>
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
