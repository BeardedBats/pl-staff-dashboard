"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { EntryTier } from "@/lib/entries/queries";
import type { AnalyticsFilterState } from "./analytics-page-client";

type Props = {
  tiers: EntryTier[];
  value: AnalyticsFilterState;
  onChange: (next: AnalyticsFilterState) => void;
};

export function AnalyticsFiltersBar({ tiers, value, onChange }: Props) {
  function setField<K extends keyof AnalyticsFilterState>(
    key: K,
    v: AnalyticsFilterState[K],
  ) {
    onChange({ ...value, [key]: v });
  }

  // Quick-range helpers — common ranges EIC/Ops use daily
  function setPreset(days: number) {
    const now = new Date();
    const to = now.toISOString().slice(0, 10);
    const from = new Date(now);
    from.setDate(from.getDate() - (days - 1));
    onChange({
      ...value,
      dateFrom: from.toISOString().slice(0, 10),
      dateTo: to,
    });
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-md border border-border bg-card/60 p-3">
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
          From
        </span>
        <Input
          type="date"
          value={value.dateFrom}
          onChange={(e) => setField("dateFrom", e.target.value)}
          className="h-8 w-36 text-xs"
        />
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
          To
        </span>
        <Input
          type="date"
          value={value.dateTo}
          onChange={(e) => setField("dateTo", e.target.value)}
          className="h-8 w-36 text-xs"
        />
      </div>
      <div className="flex items-end gap-1">
        <button
          type="button"
          onClick={() => setPreset(7)}
          className="h-8 rounded border border-border bg-navy-3/40 px-2 text-[11px] text-text-primary hover:bg-navy-3"
        >
          7d
        </button>
        <button
          type="button"
          onClick={() => setPreset(30)}
          className="h-8 rounded border border-border bg-navy-3/40 px-2 text-[11px] text-text-primary hover:bg-navy-3"
        >
          30d
        </button>
        <button
          type="button"
          onClick={() => setPreset(90)}
          className="h-8 rounded border border-border bg-navy-3/40 px-2 text-[11px] text-text-primary hover:bg-navy-3"
        >
          90d
        </button>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
          Site
        </span>
        <Select
          value={value.site}
          onValueChange={(v) => setField("site", v as AnalyticsFilterState["site"])}
        >
          <SelectTrigger className="h-8 w-32 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All sites</SelectItem>
            <SelectItem value="pl">Pitcher List</SelectItem>
            <SelectItem value="qb">QB List</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
          Tier
        </span>
        <Select
          value={value.tierId || "all"}
          onValueChange={(v) => setField("tierId", v === "all" ? "" : v)}
        >
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All tiers</SelectItem>
            {tiers.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name} — {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
