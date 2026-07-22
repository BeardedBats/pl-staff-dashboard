"use client";

import * as React from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { RecurringTemplateRecord } from "@/lib/recurring-templates/data";
import type { SeasonModeRecord } from "@/lib/season-modes/data";
import type { EntryTier } from "@/lib/entries/queries";
import type { StaffUserSummary } from "@/lib/users/queries";
import type { AppSite } from "@/lib/auth/current-user";

type Frequency = "daily" | "weekly" | "monthly" | "yearly";
type DayCode = "sun" | "mon" | "tue" | "wed" | "thu" | "fri" | "sat";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  template: RecurringTemplateRecord | null;
  seasonModes: SeasonModeRecord[];
  tiers: EntryTier[];
  assignableUsers: StaffUserSummary[];
  allowedSites: Array<"pl" | "qb">;
  onSaved: () => void;
};

const NONE = "__none__";

const DAYS: Array<{ code: DayCode; label: string }> = [
  { code: "mon", label: "Mon" },
  { code: "tue", label: "Tue" },
  { code: "wed", label: "Wed" },
  { code: "thu", label: "Thu" },
  { code: "fri", label: "Fri" },
  { code: "sat", label: "Sat" },
  { code: "sun", label: "Sun" },
];

export function TemplateDialog({
  open,
  onOpenChange,
  template,
  seasonModes,
  tiers,
  assignableUsers,
  allowedSites,
  onSaved,
}: Props) {
  const isEdit = Boolean(template);

  const [titlePattern, setTitlePattern] = React.useState("");
  const [site, setSite] = React.useState<AppSite>(allowedSites[0] ?? "pl");
  const [tierId, setTierId] = React.useState("");
  const [seasonModeId, setSeasonModeId] = React.useState("");
  const [assignedUserId, setAssignedUserId] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [publishTime, setPublishTime] = React.useState("");
  const [isActive, setIsActive] = React.useState(true);

  const [frequency, setFrequency] = React.useState<Frequency>("daily");
  const [dailyDays, setDailyDays] = React.useState<DayCode[]>([
    "mon",
    "tue",
    "wed",
    "thu",
    "fri",
  ]);
  const [weeklyDay, setWeeklyDay] = React.useState<DayCode>("tue");
  const [monthlyDay, setMonthlyDay] = React.useState(1);
  const [yearlyMonth, setYearlyMonth] = React.useState(3);
  const [yearlyDay, setYearlyDay] = React.useState(15);

  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Initialize form from template when editing.
  React.useEffect(() => {
    if (!open) return;

    if (template) {
      setTitlePattern(template.title_pattern);
      setSite(template.site as AppSite);
      setTierId(template.tier_id);
      setSeasonModeId(template.season_mode_id);
      setAssignedUserId(template.assigned_user_id ?? "");
      setDescription(template.description_template ?? "");
      setPublishTime(template.default_publish_time ?? "");
      setIsActive(template.is_active);

      const rule = template.schedule_rule;
      setFrequency(rule.frequency);
      if (rule.frequency === "daily") setDailyDays(rule.days);
      if (rule.frequency === "weekly") setWeeklyDay(rule.day);
      if (rule.frequency === "monthly") setMonthlyDay(rule.day_of_month);
      if (rule.frequency === "yearly") {
        setYearlyMonth(rule.month);
        setYearlyDay(rule.day_of_month);
      }
    } else {
      setTitlePattern("");
      setSite(allowedSites[0] ?? "pl");
      setTierId(tiers.find((t) => t.name === "A")?.id ?? tiers[0]?.id ?? "");
      setSeasonModeId(
        seasonModes.find((s) => s.is_active)?.id ?? seasonModes[0]?.id ?? "",
      );
      setAssignedUserId("");
      setDescription("");
      setPublishTime("");
      setIsActive(true);
      setFrequency("daily");
      setDailyDays(["mon", "tue", "wed", "thu", "fri"]);
    }
    setError(null);
  }, [open, template, tiers, seasonModes, allowedSites]);

  function buildScheduleRule(): unknown {
    switch (frequency) {
      case "daily":
        return { frequency: "daily", days: dailyDays };
      case "weekly":
        return { frequency: "weekly", day: weeklyDay };
      case "monthly":
        return { frequency: "monthly", day_of_month: monthlyDay };
      case "yearly":
        return {
          frequency: "yearly",
          month: yearlyMonth,
          day_of_month: yearlyDay,
        };
    }
  }

  async function handleSave() {
    if (!titlePattern.trim()) {
      setError("Title pattern is required");
      return;
    }
    if (!tierId) {
      setError("Tier is required");
      return;
    }
    if (!seasonModeId) {
      setError("Season is required");
      return;
    }
    if (frequency === "daily" && dailyDays.length === 0) {
      setError("Pick at least one day");
      return;
    }

    setSaving(true);
    setError(null);

    const payload = {
      title_pattern: titlePattern.trim(),
      site,
      tier_id: tierId,
      season_mode_id: seasonModeId,
      assigned_user_id: assignedUserId || null,
      description_template: description.trim() || null,
      default_publish_time: publishTime || null,
      schedule_rule: buildScheduleRule(),
      is_active: isActive,
    };

    try {
      const url = isEdit
        ? `/api/templates/${template!.id}`
        : "/api/templates";
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Save failed");
        setSaving(false);
        return;
      }
      onSaved();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  function toggleDailyDay(code: DayCode) {
    setDailyDays((prev) =>
      prev.includes(code) ? prev.filter((d) => d !== code) : [...prev, code],
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit template" : "New recurring template"}
          </DialogTitle>
          <DialogDescription>
            Tokens in the title: <code className="font-mono text-cyan">{"{date}"}</code>,{" "}
            <code className="font-mono text-cyan">{"{month}"}</code>,{" "}
            <code className="font-mono text-cyan">{"{week}"}</code>,{" "}
            <code className="font-mono text-cyan">{"{day_of_week}"}</code>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="title-pattern">Title pattern *</Label>
            <Input
              id="title-pattern"
              value={titlePattern}
              onChange={(e) => setTitlePattern(e.target.value)}
              placeholder="SP Roundup — {date}"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="description">Default description</Label>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Optional. Applied to every generated entry."
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Site *</Label>
              <Select value={site} onValueChange={(v) => setSite(v as AppSite)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {allowedSites.includes("pl") ? (
                    <SelectItem value="pl">Pitcher List</SelectItem>
                  ) : null}
                  {allowedSites.includes("qb") ? (
                    <SelectItem value="qb">QB List</SelectItem>
                  ) : null}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tier *</Label>
              <Select value={tierId} onValueChange={setTierId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a tier…" />
                </SelectTrigger>
                <SelectContent>
                  {tiers.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} — {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Season *</Label>
              <Select value={seasonModeId} onValueChange={setSeasonModeId}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick a season…" />
                </SelectTrigger>
                <SelectContent>
                  {seasonModes.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name} {s.is_active ? "· active" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Assigned writer</Label>
              <Select
                value={assignedUserId || NONE}
                onValueChange={(v) => setAssignedUserId(v === NONE ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>Unassigned</SelectItem>
                  {assignableUsers.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      {u.display_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="publish-time">Default publish time (optional)</Label>
            <Input
              id="publish-time"
              type="time"
              value={publishTime}
              onChange={(e) => setPublishTime(e.target.value)}
              className="max-w-[160px]"
            />
            <p className="text-xs text-text-zero">
              Time of day the generated entries will be scheduled for. Leave
              empty for flexible timing.
            </p>
          </div>

          {/* Schedule builder */}
          <div className="space-y-2 rounded-md border border-border bg-surface-3/30 p-3">
            <Label>Schedule *</Label>
            <Select
              value={frequency}
              onValueChange={(v) => setFrequency(v as Frequency)}
            >
              <SelectTrigger className="max-w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily">Daily</SelectItem>
                <SelectItem value="weekly">Weekly</SelectItem>
                <SelectItem value="monthly">Monthly</SelectItem>
                <SelectItem value="yearly">Yearly</SelectItem>
              </SelectContent>
            </Select>

            {frequency === "daily" ? (
              <div className="flex flex-wrap gap-1">
                {DAYS.map((d) => (
                  <button
                    key={d.code}
                    type="button"
                    onClick={() => toggleDailyDay(d.code)}
                    className={
                      dailyDays.includes(d.code)
                        ? "rounded-sm border border-cyan bg-cyan-dim px-3 py-1 font-data text-xs uppercase text-cyan"
                        : "rounded-sm border border-border bg-card px-3 py-1 font-data text-xs uppercase text-text-zero"
                    }
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            ) : null}

            {frequency === "weekly" ? (
              <Select value={weeklyDay} onValueChange={(v) => setWeeklyDay(v as DayCode)}>
                <SelectTrigger className="max-w-[200px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DAYS.map((d) => (
                    <SelectItem key={d.code} value={d.code}>
                      {d.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}

            {frequency === "monthly" ? (
              <div className="flex items-center gap-2">
                <Label className="shrink-0">Day of month:</Label>
                <Input
                  type="number"
                  min={1}
                  max={28}
                  value={monthlyDay}
                  onChange={(e) => setMonthlyDay(Math.max(1, Math.min(28, Number(e.target.value) || 1)))}
                  className="w-20"
                />
              </div>
            ) : null}

            {frequency === "yearly" ? (
              <div className="flex items-center gap-2">
                <Label className="shrink-0">Month:</Label>
                <Input
                  type="number"
                  min={1}
                  max={12}
                  value={yearlyMonth}
                  onChange={(e) => setYearlyMonth(Math.max(1, Math.min(12, Number(e.target.value) || 1)))}
                  className="w-16"
                />
                <Label className="shrink-0">Day:</Label>
                <Input
                  type="number"
                  min={1}
                  max={28}
                  value={yearlyDay}
                  onChange={(e) => setYearlyDay(Math.max(1, Math.min(28, Number(e.target.value) || 1)))}
                  className="w-16"
                />
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-between rounded-md border border-border bg-surface-3/40 p-3">
            <div>
              <p className="text-sm font-medium text-text-cell">Active</p>
              <p className="text-xs text-text-zero">
                Inactive templates are skipped by the generator.
              </p>
            </div>
            <Switch checked={isActive} onCheckedChange={setIsActive} />
          </div>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Plus className="h-3.5 w-3.5" />
            )}
            {isEdit ? "Save changes" : "Create template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

