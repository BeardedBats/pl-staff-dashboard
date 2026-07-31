"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Calendar,
  Check,
  Edit3,
  Loader2,
  Play,
  Plus,
  Power,
  PowerOff,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { readApiError } from "@/lib/api/client";
import { useConfirmation } from "@/components/ui/confirmation-provider";
import { TemplateDialog } from "./template-dialog";
import type { RecurringTemplateRecord } from "@/lib/recurring-templates/data";
import type { SeasonModeRecord } from "@/lib/season-modes/data";
import type { EntryTier } from "@/lib/entries/queries";
import type { StaffUserSummary } from "@/lib/users/queries";

type Props = {
  initialTemplates: RecurringTemplateRecord[];
  seasonModes: SeasonModeRecord[];
  tiers: EntryTier[];
  assignableUsers: StaffUserSummary[];
  allowedSites: Array<"pl" | "qb">;
  canRunGenerator: boolean;
};

export function AdminTemplatesPanel({
  initialTemplates,
  seasonModes,
  tiers,
  assignableUsers,
  allowedSites,
  canRunGenerator,
}: Props) {
  const router = useRouter();
  const confirm = useConfirmation();
  const [templates, setTemplates] = React.useState(initialTemplates);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingTemplate, setEditingTemplate] =
    React.useState<RecurringTemplateRecord | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [feedback, setFeedback] = React.useState<{
    kind: "success" | "error";
    message: string;
  } | null>(null);
  const dialogReturnFocusRef = React.useRef<HTMLElement | null>(null);

  async function refresh() {
    const res = await fetch("/api/templates");
    if (!res.ok) throw new Error("Template refresh failed");
    const data = (await res.json()) as {
      templates: RecurringTemplateRecord[];
    };
    setTemplates(
      (data.templates ?? []).filter((template) =>
        allowedSites.includes(template.site as "pl" | "qb"),
      ),
    );
    router.refresh();
  }

  async function toggleActive(t: RecurringTemplateRecord) {
    setBusy(t.id);
    setFeedback(null);
    try {
      const response = await fetch(`/api/templates/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !t.is_active }),
      });
      if (!response.ok) {
        setFeedback({
          kind: "error",
          message: await readApiError(response, "Could not update the template."),
        });
        return;
      }
      await refresh();
      setFeedback({ kind: "success", message: "Template updated." });
    } catch {
      setFeedback({
        kind: "error",
        message: "Could not update the template. Check your connection and retry.",
      });
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(t: RecurringTemplateRecord) {
    const confirmed = await confirm({
      title: "Delete recurring template?",
      description: `Delete “${t.title_pattern}”? Existing entries will stay. No new entries will be generated.`,
      confirmLabel: "Delete template",
      destructive: true,
    });
    if (!confirmed) return;
    setBusy(t.id);
    setFeedback(null);
    try {
      const response = await fetch(`/api/templates/${t.id}`, { method: "DELETE" });
      if (!response.ok) {
        setFeedback({
          kind: "error",
          message: await readApiError(response, "Could not delete the template."),
        });
        return;
      }
      await refresh();
      setFeedback({ kind: "success", message: "Template deleted." });
    } catch {
      setFeedback({
        kind: "error",
        message: "Could not delete the template. Check your connection and retry.",
      });
    } finally {
      setBusy(null);
    }
  }

  async function runGeneratorNow() {
    setBusy("__runner__");
    setFeedback(null);
    try {
      const res = await fetch("/api/cron/recurring-generate", {
        method: "POST",
      });
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        report?: {
          templatesProcessed: number;
          entriesCreated: number;
          entriesSkipped: number;
          errors: Array<{ message: string }>;
        };
        error?: string;
      };
      if (!res.ok || !data.ok) {
        setFeedback({ kind: "error", message: data.error ?? "Generator run failed." });
      } else if (data.report) {
        setFeedback({
          kind: data.report.errors.length > 0 ? "error" : "success",
          message:
            `Processed ${data.report.templatesProcessed} templates · ` +
            `Created ${data.report.entriesCreated} entries · ` +
            `Skipped ${data.report.entriesSkipped} existing · ` +
            `${data.report.errors.length} errors`,
        });
      }
      await refresh();
    } catch {
      setFeedback({
        kind: "error",
        message: "Could not run the generator. Check your connection and retry.",
      });
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-col items-start justify-between gap-4 sm:flex-row">
        <div>
          <CardTitle>Recurring templates</CardTitle>
          <CardDescription>
            Auto-generate entries on a schedule. Templates are tagged with a
            season — they only run when that season is active.
          </CardDescription>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {canRunGenerator ? (
            <Button
              variant="outline"
              size="sm"
              onClick={runGeneratorNow}
              disabled={busy === "__runner__"}
              title="Run the generator now for the next 14 days"
            >
              {busy === "__runner__" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              Run generator
            </Button>
          ) : null}
          <Button
            size="sm"
            onClick={(event) => {
              dialogReturnFocusRef.current = event.currentTarget;
              setEditingTemplate(null);
              setDialogOpen(true);
            }}
          >
            <Plus className="h-3.5 w-3.5" />
            New template
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {feedback ? (
          <Alert variant={feedback.kind}>
            <AlertTitle>
              {feedback.kind === "success" ? "Template action complete" : "Template action failed"}
            </AlertTitle>
            <AlertDescription>{feedback.message}</AlertDescription>
          </Alert>
        ) : null}

        {templates.length === 0 ? (
          <EmptyState
            icon={<Calendar className="h-5 w-5" />}
            title="No templates yet"
            description="Create your first recurring template to start auto-generating entries."
            action={
              <Button
                size="sm"
                onClick={(event) => {
                  dialogReturnFocusRef.current = event.currentTarget;
                  setEditingTemplate(null);
                  setDialogOpen(true);
                }}
              >
                <Plus className="h-3.5 w-3.5" />
                New template
              </Button>
            }
          />
        ) : (
          <div className="plpd-table-shell overflow-hidden">
            <table className="plpd-table font-data">
              <thead className="bg-surface-3">
                <tr>
                  <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-text-zero">
                    Title pattern
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-text-zero">
                    Schedule
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-text-zero">
                    Tier
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-text-zero">
                    Season
                  </th>
                  <th className="px-3 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-text-zero">
                    Assignee
                  </th>
                  <th className="px-3 py-2 text-center text-[10px] font-medium uppercase tracking-wider text-text-zero">
                    Active
                  </th>
                  <th className="px-3 py-2 text-right text-[10px] font-medium uppercase tracking-wider text-text-zero">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {templates.map((t) => (
                  <tr
                    key={t.id}
                    data-row-state={t.is_active ? undefined : "bench"}
                  >
                    <td className="px-3 py-2">
                      <div className="font-medium text-text-cell">
                        {t.title_pattern}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1">
                        <Badge variant="outline" className="font-data">
                          {t.site.toUpperCase()}
                        </Badge>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-text-team">
                      {t.schedule_description}
                      {t.default_publish_time ? (
                        <span className="ml-1 font-data text-text-zero">
                          @ {t.default_publish_time.slice(0, 5)}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="outline" className="font-data">
                        {t.tier_name}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-xs text-text-team">
                      {t.season_mode_name}
                    </td>
                    <td className="px-3 py-2 text-xs text-text-team">
                      {t.assigned_user_name ?? (
                        <span className="text-text-zero">Unassigned</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-center">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => toggleActive(t)}
                        disabled={busy === t.id}
                        aria-label={t.is_active ? "Deactivate" : "Activate"}
                        title={t.is_active ? "Deactivate" : "Activate"}
                      >
                        {busy === t.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : t.is_active ? (
                          <Power className="h-3.5 w-3.5 text-green" />
                        ) : (
                          <PowerOff className="h-3.5 w-3.5 text-text-zero" />
                        )}
                      </Button>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(event) => {
                          dialogReturnFocusRef.current = event.currentTarget;
                          setEditingTemplate(t);
                          setDialogOpen(true);
                        }}
                        aria-label="Edit"
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(t)}
                        aria-label="Delete"
                        className="text-destructive hover:bg-destructive/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="rounded-sm border border-dashed border-border bg-surface-3/30 px-3 py-2 text-xs text-text-zero">
          <Check className="inline h-3 w-3" /> The nightly cron creates entries
          up to 14 days ahead. You can also hit &quot;Run generator&quot; above
          to trigger it on demand.
        </p>
      </CardContent>

      <TemplateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        template={editingTemplate}
        seasonModes={seasonModes}
        tiers={tiers}
        assignableUsers={assignableUsers}
        allowedSites={allowedSites}
        returnFocusRef={dialogReturnFocusRef}
        onSaved={() => {
          setDialogOpen(false);
          setEditingTemplate(null);
          void refresh();
        }}
      />
    </Card>
  );
}
