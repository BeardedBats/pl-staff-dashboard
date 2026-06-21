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
};

export function AdminTemplatesPanel({
  initialTemplates,
  seasonModes,
  tiers,
  assignableUsers,
}: Props) {
  const router = useRouter();
  const [templates, setTemplates] = React.useState(initialTemplates);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editingTemplate, setEditingTemplate] =
    React.useState<RecurringTemplateRecord | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [runResult, setRunResult] = React.useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/templates");
    const data = (await res.json()) as {
      templates: RecurringTemplateRecord[];
    };
    setTemplates(data.templates ?? []);
    router.refresh();
  }

  async function toggleActive(t: RecurringTemplateRecord) {
    setBusy(t.id);
    try {
      await fetch(`/api/templates/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !t.is_active }),
      });
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function handleDelete(t: RecurringTemplateRecord) {
    const confirmed = window.confirm(
      `Delete template "${t.title_pattern}"? Existing entries it created will stay, but no new ones will be generated.`,
    );
    if (!confirmed) return;
    setBusy(t.id);
    try {
      await fetch(`/api/templates/${t.id}`, { method: "DELETE" });
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function runGeneratorNow() {
    setBusy("__runner__");
    setRunResult(null);
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
        setRunResult(`Error: ${data.error ?? "run failed"}`);
      } else if (data.report) {
        setRunResult(
          `Processed ${data.report.templatesProcessed} templates · ` +
            `Created ${data.report.entriesCreated} entries · ` +
            `Skipped ${data.report.entriesSkipped} existing · ` +
            `${data.report.errors.length} errors`,
        );
      }
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Recurring templates</CardTitle>
          <CardDescription>
            Auto-generate entries on a schedule. Templates are tagged with a
            season — they only run when that season is active.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
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
          <Button
            size="sm"
            onClick={() => {
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
        {runResult ? (
          <p className="rounded-sm border border-cyan/30 bg-cyan-dim px-3 py-2 text-xs text-cyan">
            {runResult}
          </p>
        ) : null}

        {templates.length === 0 ? (
          <EmptyState
            icon={<Calendar className="h-5 w-5" />}
            title="No templates yet"
            description="Create your first recurring template to start auto-generating entries."
            action={
              <Button
                size="sm"
                onClick={() => {
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
          <div className="overflow-hidden rounded-md border border-border">
            <table className="w-full text-sm">
              <thead className="bg-surface-3">
                <tr>
                  <th className="px-3 py-2 text-left font-mono text-[10px] font-medium uppercase tracking-wider text-text-zero">
                    Title pattern
                  </th>
                  <th className="px-3 py-2 text-left font-mono text-[10px] font-medium uppercase tracking-wider text-text-zero">
                    Schedule
                  </th>
                  <th className="px-3 py-2 text-left font-mono text-[10px] font-medium uppercase tracking-wider text-text-zero">
                    Tier
                  </th>
                  <th className="px-3 py-2 text-left font-mono text-[10px] font-medium uppercase tracking-wider text-text-zero">
                    Season
                  </th>
                  <th className="px-3 py-2 text-left font-mono text-[10px] font-medium uppercase tracking-wider text-text-zero">
                    Assignee
                  </th>
                  <th className="px-3 py-2 text-center font-mono text-[10px] font-medium uppercase tracking-wider text-text-zero">
                    Active
                  </th>
                  <th className="px-3 py-2 text-right font-mono text-[10px] font-medium uppercase tracking-wider text-text-zero">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {templates.map((t) => (
                  <tr key={t.id} className="hover:bg-surface-3/40">
                    <td className="px-3 py-2">
                      <div className="font-medium text-text-cell">
                        {t.title_pattern}
                      </div>
                      <div className="mt-0.5 flex items-center gap-1">
                        <Badge variant="outline">{t.site.toUpperCase()}</Badge>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-text-team">
                      {t.schedule_description}
                      {t.default_publish_time ? (
                        <span className="ml-1 font-mono text-text-zero">
                          @ {t.default_publish_time.slice(0, 5)}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2">
                      <Badge variant="outline">{t.tier_name}</Badge>
                    </td>
                    <td className="px-3 py-2 text-xs text-text-team">
                      {t.season_mode_name}
                    </td>
                    <td className="px-3 py-2 text-xs text-text-team">
                      {t.assigned_user_name ?? (
                        <span className="italic text-text-zero">
                          Unassigned
                        </span>
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
                        onClick={() => {
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
          <Check className="inline h-3 w-3" /> The nightly cron creates
          entries up to 14 days ahead. You can also hit &quot;Run generator&quot;
          above to trigger it on demand.
        </p>
      </CardContent>

      <TemplateDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        template={editingTemplate}
        seasonModes={seasonModes}
        tiers={tiers}
        assignableUsers={assignableUsers}
        onSaved={() => {
          setDialogOpen(false);
          setEditingTemplate(null);
          void refresh();
        }}
      />
    </Card>
  );
}
