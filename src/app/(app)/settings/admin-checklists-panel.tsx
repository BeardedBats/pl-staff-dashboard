"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Check,
  CheckSquare,
  Edit3,
  Layers,
  Loader2,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
import { EmptyState } from "@/components/ui/empty-state";
import type { ChecklistItemRecord } from "@/lib/checklist/data";
import type { EntryTier } from "@/lib/entries/queries";

type Props = {
  initialItems: ChecklistItemRecord[];
  tiers: EntryTier[];
};

export function AdminChecklistsPanel({ initialItems, tiers: initialTiers }: Props) {
  const router = useRouter();
  const [tiers, setTiers] = React.useState<EntryTier[]>(initialTiers);
  const [items, setItems] = React.useState(initialItems);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ChecklistItemRecord | null>(null);
  const [activeTierId, setActiveTierId] = React.useState<string>(
    initialTiers[0]?.id ?? "",
  );
  const [busy, setBusy] = React.useState<string | null>(null);

  async function refreshTiers() {
    const res = await fetch("/api/tiers");
    if (!res.ok) return;
    const data = (await res.json()) as { tiers: EntryTier[] };
    setTiers(data.tiers ?? []);
    if (data.tiers && data.tiers.length > 0 && !data.tiers.find((t) => t.id === activeTierId)) {
      setActiveTierId(data.tiers[0].id);
    }
    router.refresh();
  }

  async function refresh() {
    const res = await fetch("/api/settings/checklist-items");
    const data = (await res.json()) as { items: ChecklistItemRecord[] };
    setItems(data.items ?? []);
    router.refresh();
  }

  async function handleDelete(item: ChecklistItemRecord) {
    const confirmed = window.confirm(
      `Delete "${item.label}"? Entries using this item will keep their checklist row, but new entries won't.`,
    );
    if (!confirmed) return;
    setBusy(item.id);
    try {
      await fetch(`/api/settings/checklist-items/${item.id}`, {
        method: "DELETE",
      });
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function handleToggleRequired(item: ChecklistItemRecord, required: boolean) {
    setBusy(item.id);
    try {
      await fetch(`/api/settings/checklist-items/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_required: required }),
      });
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  const tierItems = items
    .filter((i) => i.tier_id === activeTierId)
    .sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div className="space-y-6">
      <TiersCard tiers={tiers} onChange={refreshTiers} />
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <CheckSquare className="h-4 w-4" />
            Pre-submission checklists
          </CardTitle>
          <CardDescription>
            Per-tier items that writers must tick off before submitting. New
            entries get the current item list seeded onto them automatically.
            Required items block submission; optional items are advisory.
          </CardDescription>
        </div>
        <Button
          size="sm"
          onClick={() => {
            setEditing(null);
            setDialogOpen(true);
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          New item
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Tier tabs */}
        <div className="flex items-center gap-1 rounded-md border border-border bg-surface-3/40 p-1">
          {tiers.map((t) => {
            const active = activeTierId === t.id;
            const count = items.filter((i) => i.tier_id === t.id).length;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTierId(t.id)}
                className={
                  active
                    ? "flex items-center gap-2 rounded-sm bg-cyan-dim px-3 py-1.5 text-xs font-semibold text-cyan"
                    : "flex items-center gap-2 rounded-sm px-3 py-1.5 text-xs text-text-zero hover:text-text-cell"
                }
              >
                <span>
                  {t.name} — {t.label}
                </span>
                <Badge variant="outline">{count}</Badge>
              </button>
            );
          })}
        </div>

        {/* Items for the active tier */}
        {tierItems.length === 0 ? (
          <EmptyState
            icon={<CheckSquare className="h-5 w-5" />}
            title="No items yet for this tier"
            description="Add a checklist item to enforce pre-submission checks for entries in this tier."
          />
        ) : (
          <ul className="space-y-1">
            {tierItems.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2"
              >
                <span className="font-mono text-[10px] text-text-zero">
                  #{item.sort_order}
                </span>
                <span className="flex-1 text-sm text-text-cell">
                  {item.label}
                </span>
                <div className="flex items-center gap-2 text-[11px] text-text-zero">
                  <span>Required</span>
                  <Switch
                    checked={item.is_required}
                    onCheckedChange={(checked) =>
                      handleToggleRequired(item, checked)
                    }
                    disabled={busy === item.id}
                  />
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setEditing(item);
                    setDialogOpen(true);
                  }}
                  aria-label="Edit"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDelete(item)}
                  disabled={busy === item.id}
                  aria-label="Delete"
                  className="text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <ChecklistItemDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        item={editing}
        tiers={tiers}
        defaultTierId={activeTierId}
        onSaved={() => {
          setDialogOpen(false);
          setEditing(null);
          void refresh();
        }}
      />
    </Card>
    </div>
  );
}

// --------------------------------------------------------------------------
// Tier management
// --------------------------------------------------------------------------

function TiersCard({
  tiers,
  onChange,
}: {
  tiers: EntryTier[];
  onChange: () => Promise<void> | void;
}) {
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [editingTier, setEditingTier] = React.useState<EntryTier | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const sorted = [...tiers].sort((a, b) => a.sort_order - b.sort_order);

  async function reorder(tier: EntryTier, direction: "up" | "down") {
    const index = sorted.findIndex((t) => t.id === tier.id);
    const swapWith = direction === "up" ? sorted[index - 1] : sorted[index + 1];
    if (!swapWith) return;
    setBusyId(tier.id);
    setError(null);
    try {
      await fetch("/api/tiers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: tier.id, sort_order: swapWith.sort_order }),
      });
      await fetch("/api/tiers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: swapWith.id, sort_order: tier.sort_order }),
      });
      await onChange();
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(tier: EntryTier) {
    const confirmed = window.confirm(
      `Delete tier "${tier.name} — ${tier.label}"? This cannot be undone.`,
    );
    if (!confirmed) return;
    setBusyId(tier.id);
    setError(null);
    try {
      const res = await fetch(`/api/tiers?id=${tier.id}`, { method: "DELETE" });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Delete failed");
        return;
      }
      await onChange();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <Layers className="h-4 w-4" />
            Tiers
          </CardTitle>
          <CardDescription>
            Tiers group entries by cadence (annual, daily, weekly,
            unscheduled). They drive the checklist below and the tier filter
            in the content table.
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="h-3.5 w-3.5" />
          New tier
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? (
          <p className="flex items-start gap-1 rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
            <X className="mt-0.5 h-3 w-3 shrink-0" />
            {error}
          </p>
        ) : null}
        {sorted.length === 0 ? (
          <EmptyState
            icon={<Layers className="h-5 w-5" />}
            title="No tiers configured"
            description="Add a tier to start grouping content by cadence."
          />
        ) : (
          <ul className="space-y-1">
            {sorted.map((tier, idx) => (
              <li
                key={tier.id}
                className="flex items-center gap-3 rounded-md border border-border bg-card px-3 py-2"
              >
                <span className="font-mono text-[10px] text-text-zero">
                  #{tier.sort_order}
                </span>
                <Badge variant="outline">{tier.name}</Badge>
                <span className="flex-1 text-sm text-text-cell">
                  {tier.label}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={busyId === tier.id || idx === 0}
                  onClick={() => void reorder(tier, "up")}
                  aria-label="Move up"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={busyId === tier.id || idx === sorted.length - 1}
                  onClick={() => void reorder(tier, "down")}
                  aria-label="Move down"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setEditingTier(tier)}
                  aria-label="Edit"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  disabled={busyId === tier.id}
                  onClick={() => void handleDelete(tier)}
                  aria-label="Delete"
                  className="text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <TierDialog
        open={creating || editingTier !== null}
        tier={editingTier}
        onOpenChange={(open) => {
          if (!open) {
            setCreating(false);
            setEditingTier(null);
          }
        }}
        onSaved={async () => {
          setCreating(false);
          setEditingTier(null);
          await onChange();
        }}
      />
    </Card>
  );
}

function TierDialog({
  open,
  tier,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  tier: EntryTier | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => Promise<void> | void;
}) {
  const isEdit = Boolean(tier);
  const [name, setName] = React.useState("");
  const [label, setLabel] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setName(tier?.name ?? "");
    setLabel(tier?.label ?? "");
    setError(null);
  }, [open, tier]);

  async function handleSave() {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    if (!label.trim()) {
      setError("Label is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = isEdit
        ? JSON.stringify({ id: tier!.id, name: name.trim(), label: label.trim() })
        : JSON.stringify({ name: name.trim(), label: label.trim() });
      const res = await fetch("/api/tiers", {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Save failed");
        setSaving(false);
        return;
      }
      await onSaved();
    } catch {
      setError("Network error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit tier" : "New tier"}</DialogTitle>
          <DialogDescription>
            Tier name is the short code shown in badges (e.g. S, A, B, C). The
            label is the longer description (e.g. Annual, Daily, Weekly).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="tier-name">Name *</Label>
            <Input
              id="tier-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. S"
              maxLength={40}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tier-label">Label *</Label>
            <Input
              id="tier-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Annual"
              maxLength={80}
            />
          </div>
          {error ? (
            <p className="flex items-center gap-1 text-sm text-destructive">
              <X className="h-3 w-3" />
              {error}
            </p>
          ) : null}
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
              <Check className="h-3.5 w-3.5" />
            )}
            {isEdit ? "Save changes" : "Create tier"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --------------------------------------------------------------------------
// Dialog
// --------------------------------------------------------------------------

function ChecklistItemDialog({
  open,
  onOpenChange,
  item,
  tiers,
  defaultTierId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  item: ChecklistItemRecord | null;
  tiers: EntryTier[];
  defaultTierId: string;
  onSaved: () => void;
}) {
  const isEdit = Boolean(item);
  const [label, setLabel] = React.useState("");
  const [tierId, setTierId] = React.useState("");
  const [sortOrder, setSortOrder] = React.useState(0);
  const [isRequired, setIsRequired] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    if (item) {
      setLabel(item.label);
      setTierId(item.tier_id);
      setSortOrder(item.sort_order);
      setIsRequired(item.is_required);
    } else {
      setLabel("");
      setTierId(defaultTierId);
      setSortOrder(0);
      setIsRequired(true);
    }
    setError(null);
  }, [open, item, defaultTierId]);

  async function handleSave() {
    if (!label.trim()) {
      setError("Label is required");
      return;
    }
    if (!tierId) {
      setError("Tier is required");
      return;
    }
    setSaving(true);
    setError(null);

    const payload = {
      tier_id: tierId,
      label: label.trim(),
      sort_order: sortOrder,
      is_required: isRequired,
    };

    try {
      const url = isEdit
        ? `/api/settings/checklist-items/${item!.id}`
        : "/api/settings/checklist-items";
      const method = isEdit ? "PATCH" : "POST";
      const body = isEdit
        ? JSON.stringify({
            label: payload.label,
            sort_order: payload.sort_order,
            is_required: payload.is_required,
          })
        : JSON.stringify(payload);
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body,
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Edit checklist item" : "New checklist item"}
          </DialogTitle>
          <DialogDescription>
            Per-tier — only entries in the selected tier will include this
            item.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="item-label">Label *</Label>
            <Input
              id="item-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Player names verified"
              autoFocus
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Tier *</Label>
              <Select value={tierId} onValueChange={setTierId} disabled={isEdit}>
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
              {isEdit ? (
                <p className="text-xs text-text-zero">
                  Tier can&apos;t be changed after creation. Delete + recreate
                  if you need to move it.
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sort-order">Sort order</Label>
              <Input
                id="sort-order"
                type="number"
                min={0}
                max={999}
                value={sortOrder}
                onChange={(e) =>
                  setSortOrder(
                    Math.max(0, Math.min(999, Number(e.target.value) || 0)),
                  )
                }
              />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-md border border-border bg-surface-3/40 p-3">
            <div>
              <p className="text-sm font-medium text-text-cell">Required</p>
              <p className="text-xs text-text-zero">
                Required items block submission until checked. Optional items
                are advisory only.
              </p>
            </div>
            <Switch checked={isRequired} onCheckedChange={setIsRequired} />
          </div>
          {error ? (
            <p className="flex items-center gap-1 text-sm text-destructive">
              <X className="h-3 w-3" />
              {error}
            </p>
          ) : null}
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
              <Check className="h-3.5 w-3.5" />
            )}
            {isEdit ? "Save changes" : "Create item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
