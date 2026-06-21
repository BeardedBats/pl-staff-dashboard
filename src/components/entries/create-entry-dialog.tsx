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
import type {
  EntryCategory,
  EntryTier,
  PublishDatePrecision,
} from "@/lib/entries/queries";
import type { AppSite } from "@/lib/auth/current-user";

type CreateEntryDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tiers: EntryTier[];
  categories: EntryCategory[];
  onCreated: (entryId: string) => void;
};

type FormState = {
  title: string;
  description: string;
  site: AppSite | "";
  tier_id: string;
  priority: boolean;
  publish_date_input: string; // yyyy-MM-ddTHH:mm from datetime-local
  publish_date_precision: PublishDatePrecision;
  category_id: string;
};

const NONE = "__none__";

const EMPTY: FormState = {
  title: "",
  description: "",
  site: "pl",
  tier_id: "",
  priority: false,
  publish_date_input: "",
  publish_date_precision: "none",
  category_id: "",
};

export function CreateEntryDialog({
  open,
  onOpenChange,
  tiers,
  categories,
  onCreated,
}: CreateEntryDialogProps) {
  const [form, setForm] = React.useState<FormState>(EMPTY);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Reset form whenever dialog opens.
  React.useEffect(() => {
    if (open) {
      setForm((prev) => ({
        ...EMPTY,
        tier_id: tiers[0]?.id ?? "",
        site: prev.site || "pl",
      }));
      setError(null);
    }
  }, [open, tiers]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  const siteCategories = categories.filter(
    (c) => c.site === form.site || c.site === "both",
  );

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.title.trim()) {
      setError("Title is required");
      return;
    }
    if (!form.tier_id) {
      setError("Tier is required");
      return;
    }
    if (!form.site) {
      setError("Site is required");
      return;
    }

    setSaving(true);
    setError(null);

    // Convert datetime-local → ISO string in the user's local timezone.
    let publishDate: string | null = null;
    if (form.publish_date_input && form.publish_date_precision !== "none") {
      const parsed = new Date(form.publish_date_input);
      if (!Number.isNaN(parsed.getTime())) {
        publishDate = parsed.toISOString();
      }
    }

    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || undefined,
      site: form.site,
      tier_id: form.tier_id,
      priority: form.priority,
      publish_date: publishDate,
      publish_date_precision: form.publish_date_precision,
      category_id: form.category_id || null,
    };

    try {
      const res = await fetch("/api/entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => ({}))) as {
        entry_id?: string;
        error?: string;
      };
      if (!res.ok || !data.entry_id) {
        setError(data.error ?? "Create failed");
        setSaving(false);
        return;
      }
      onCreated(data.entry_id);
      setSaving(false);
    } catch {
      setError("Network error");
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>New content entry</DialogTitle>
          <DialogDescription>
            Start a new pipeline entry. You can assign a writer later from the
            row detail panel.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="entry-title">Title *</Label>
            <Input
              id="entry-title"
              value={form.title}
              onChange={(e) => update("title", e.target.value)}
              placeholder="SP Roundup — April 16"
              required
              autoFocus
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="entry-description">Description / brief</Label>
            <Textarea
              id="entry-description"
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              placeholder="Angle, focus, players to highlight…"
              rows={3}
            />
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Site *</Label>
              <Select
                value={form.site}
                onValueChange={(v) => update("site", v as AppSite)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pl">Pitcher List</SelectItem>
                  <SelectItem value="qb">QB List</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Tier *</Label>
              <Select
                value={form.tier_id}
                onValueChange={(v) => update("tier_id", v)}
              >
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

          {siteCategories.length > 0 ? (
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select
                value={form.category_id || NONE}
                onValueChange={(v) => update("category_id", v === NONE ? "" : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Choose a category…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>No category</SelectItem>
                  {siteCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <p className="rounded-sm border border-dashed border-border bg-surface-3/30 px-3 py-2 text-xs text-text-zero">
              No categories synced from WordPress yet. Categories land in Step
              10 (WP sync). You can still create entries without one.
            </p>
          )}

          <div className="grid gap-4 md:grid-cols-[1fr_200px]">
            <div className="space-y-1.5">
              <Label htmlFor="publish-date">Publish date</Label>
              <Input
                id="publish-date"
                type="datetime-local"
                value={form.publish_date_input}
                onChange={(e) => update("publish_date_input", e.target.value)}
                disabled={form.publish_date_precision === "none"}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Precision</Label>
              <Select
                value={form.publish_date_precision}
                onValueChange={(v) =>
                  update("publish_date_precision", v as PublishDatePrecision)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No date</SelectItem>
                  <SelectItem value="loose_date">Approx. date</SelectItem>
                  <SelectItem value="loose_time">Approx. time</SelectItem>
                  <SelectItem value="exact">Exact</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-md border border-border bg-surface-3/40 px-3 py-2">
            <div>
              <p className="text-sm font-medium text-text-cell">Priority</p>
              <p className="text-xs text-text-zero">
                Flag this entry as high-priority. Shows a row highlight and an
                amber alert icon in the table.
              </p>
            </div>
            <Switch
              checked={form.priority}
              onCheckedChange={(v) => update("priority", v)}
            />
          </div>

          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Creating…
                </>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5" />
                  Create entry
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
