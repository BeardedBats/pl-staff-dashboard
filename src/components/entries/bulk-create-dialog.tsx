"use client";

import * as React from "react";
import { Check, Loader2, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { readApiError } from "@/lib/api/client";

type Row = {
  /** Local-only id for React keys. Server generates the real UUID. */
  uid: string;
  title: string;
  publish_date_input: string;
  /** Per-row override; if blank uses the shared defaults. */
  category_id: string;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tiers: EntryTier[];
  categories: EntryCategory[];
  manageableSites: Array<"pl" | "qb">;
  onCreated: (count: number) => void;
};

type Result = {
  ok: number;
  failed: number;
  errors: string[];
};

const SHARED_NONE = "__none__";

function blankRow(): Row {
  return {
    uid: `r${Math.random().toString(36).slice(2, 8)}`,
    title: "",
    publish_date_input: "",
    category_id: "",
  };
}

/**
 * Bulk-create dialog. Lets admins/managers spin up a handful of entries
 * with shared site/tier/precision but per-row title + publish date.
 *
 * The server creates the entire batch, checklists, authors, and audit rows in
 * one database transaction. A failure leaves none of the requested entries.
 */
export function BulkCreateEntryDialog({
  open,
  onOpenChange,
  tiers,
  categories,
  manageableSites,
  onCreated,
}: Props) {
  const [sharedSite, setSharedSite] = React.useState<"pl" | "qb">(
    manageableSites[0] ?? "pl",
  );
  const [sharedTierId, setSharedTierId] = React.useState<string>("");
  const [sharedPrecision, setSharedPrecision] =
    React.useState<PublishDatePrecision>("none");
  const [sharedCategoryId, setSharedCategoryId] = React.useState<string>("");
  const [rows, setRows] = React.useState<Row[]>([blankRow(), blankRow()]);
  const [saving, setSaving] = React.useState(false);
  const [result, setResult] = React.useState<Result | null>(null);

  React.useEffect(() => {
    if (open) {
      setSharedSite(manageableSites[0] ?? "pl");
      setSharedTierId(tiers[0]?.id ?? "");
      setSharedPrecision("none");
      setSharedCategoryId("");
      setRows([blankRow(), blankRow()]);
      setResult(null);
    }
  }, [manageableSites, open, tiers]);

  const validRows = rows.filter((r) => r.title.trim().length > 0);
  const canSubmit =
    validRows.length > 0 &&
    Boolean(sharedTierId) &&
    manageableSites.includes(sharedSite) &&
    !saving;

  function updateRow(uid: string, patch: Partial<Row>) {
    setRows((rs) => rs.map((r) => (r.uid === uid ? { ...r, ...patch } : r)));
  }
  function removeRow(uid: string) {
    setRows((rs) => (rs.length > 1 ? rs.filter((r) => r.uid !== uid) : rs));
  }
  function addRow() {
    setRows((rs) => [...rs, blankRow()]);
  }

  // Filter categories by selected site (matches the single-create dialog).
  const visibleCategories = React.useMemo(() => {
    return categories.filter(
      (c) => c.site === sharedSite || c.site === "both",
    );
  }, [categories, sharedSite]);

  async function handleSubmit() {
    if (!canSubmit) return;
    setSaving(true);
    setResult(null);

    const payloads = validRows.map((r) => {
      let publishDate: string | null = null;
      if (r.publish_date_input) {
        const d = new Date(r.publish_date_input);
        if (Number.isFinite(d.getTime())) publishDate = d.toISOString();
      }
      return {
        title: r.title.trim(),
        description: "",
        site: sharedSite,
        tier_id: sharedTierId,
        priority: false,
        publish_date: publishDate,
        publish_date_precision: publishDate ? sharedPrecision : "none",
        category_id: r.category_id || sharedCategoryId || null,
      };
    });

    try {
      const response = await fetch("/api/entries/bulk-create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entries: payloads }),
      });
      if (!response.ok) {
        const message = await readApiError(
          response,
          "The batch could not be created",
        );
        setResult({ ok: 0, failed: payloads.length, errors: [message] });
        return;
      }

      const body = (await response.json()) as { created?: number };
      const created = body.created ?? payloads.length;
      setResult({ ok: created, failed: 0, errors: [] });
      onCreated(created);
    } catch {
      setResult({
        ok: 0,
        failed: payloads.length,
        errors: ["The batch could not be created. Check your connection and try again."],
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Bulk create entries</DialogTitle>
          <DialogDescription>
            Create up to 25 entries at once. Shared site / tier / precision
            on top, per-row title and publish date below.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <div className="space-y-3">
            <div className="rounded-md border border-border bg-card/60 p-3 text-sm">
              <p className="font-medium text-text-cell">
                Created {result.ok} of {result.ok + result.failed} entries.
              </p>
              {result.failed > 0 ? (
                <div className="mt-2 space-y-1 text-xs">
                  <p className="text-destructive">
                    {result.failed} failed:
                  </p>
                  <ul className="ml-4 list-disc text-text-zero">
                    {result.errors.slice(0, 5).map((e, i) => (
                      <li key={i}>{e}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
            <DialogFooter>
              <Button onClick={() => onOpenChange(false)}>Close</Button>
            </DialogFooter>
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {/* Shared defaults */}
              <div className="grid gap-3 rounded-md border border-border bg-surface-3/30 p-3 md:grid-cols-4">
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase">Site</Label>
                  <Select
                    value={sharedSite}
                    onValueChange={(v) => setSharedSite(v as "pl" | "qb")}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {manageableSites.includes("pl") ? (
                        <SelectItem value="pl">Pitcher List</SelectItem>
                      ) : null}
                      {manageableSites.includes("qb") ? (
                        <SelectItem value="qb">QB List</SelectItem>
                      ) : null}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase">Tier *</Label>
                  <Select
                    value={sharedTierId}
                    onValueChange={setSharedTierId}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Pick tier…" />
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
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase">Precision</Label>
                  <Select
                    value={sharedPrecision}
                    onValueChange={(v) =>
                      setSharedPrecision(v as PublishDatePrecision)
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="exact">Exact</SelectItem>
                      <SelectItem value="loose_time">Loose time</SelectItem>
                      <SelectItem value="loose_date">Loose date</SelectItem>
                      <SelectItem value="none">No date</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase">Default category</Label>
                  <Select
                    value={sharedCategoryId || SHARED_NONE}
                    onValueChange={(v) =>
                      setSharedCategoryId(v === SHARED_NONE ? "" : v)
                    }
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="None" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={SHARED_NONE}>None</SelectItem>
                      {visibleCategories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Per-row table */}
              <div className="max-h-[40vh] space-y-1.5 overflow-y-auto rounded-md border border-border p-2">
                {rows.map((r, idx) => (
                  <div
                    key={r.uid}
                    className="grid grid-cols-[2fr_1.4fr_auto] gap-2"
                  >
                    <Input
                      value={r.title}
                      onChange={(e) =>
                        updateRow(r.uid, { title: e.target.value })
                      }
                      placeholder={`Title for entry #${idx + 1}`}
                      className="h-8 text-xs"
                    />
                    <Input
                      type="datetime-local"
                      value={r.publish_date_input}
                      onChange={(e) =>
                        updateRow(r.uid, {
                          publish_date_input: e.target.value,
                        })
                      }
                      className="h-8 text-xs"
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeRow(r.uid)}
                      disabled={rows.length <= 1}
                      aria-label="Remove row"
                      className="h-8 w-8 text-text-zero hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                {rows.length < 25 ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={addRow}
                    className="w-full"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add row
                  </Button>
                ) : (
                  <p className="text-center text-[10px] text-text-zero">
                    Max 25 entries per batch.
                  </p>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                <X className="h-3.5 w-3.5" />
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={!canSubmit}>
                {saving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Check className="h-3.5 w-3.5" />
                )}
                Create {validRows.length}{" "}
                {validRows.length === 1 ? "entry" : "entries"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
