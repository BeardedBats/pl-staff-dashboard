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
import type { EntryCategory, EntryTier } from "@/lib/entries/queries";
import type {
  AnalyticsFilterState,
  AuthorCandidate,
} from "./analytics-page-client";

type Props = {
  tiers: EntryTier[];
  categories: EntryCategory[];
  authorCandidates: AuthorCandidate[];
  value: AnalyticsFilterState;
  onChange: (next: AnalyticsFilterState) => void;
};

export function AnalyticsFiltersBar({
  tiers,
  categories,
  authorCandidates,
  value,
  onChange,
}: Props) {
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

  // Filter categories by the selected site — keeps the dropdown short and
  // sensible when someone picks PL vs QB.
  const visibleCategories = React.useMemo(() => {
    if (value.site === "all") return categories;
    return categories.filter(
      (c) => c.site === value.site || c.site === "both",
    );
  }, [categories, value.site]);

  // Sort authors alphabetically once for stable dropdown ordering.
  const sortedAuthors = React.useMemo(() => {
    return [...authorCandidates].sort((a, b) =>
      a.display_name.localeCompare(b.display_name),
    );
  }, [authorCandidates]);

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
          onValueChange={(v) =>
            // Switching site invalidates any selected category that's
            // scoped to the other site — clear it.
            onChange({
              ...value,
              site: v as AnalyticsFilterState["site"],
              categoryId: "",
            })
          }
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
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
          Category
        </span>
        <Select
          value={value.categoryId || "all"}
          onValueChange={(v) => setField("categoryId", v === "all" ? "" : v)}
        >
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All categories</SelectItem>
            {visibleCategories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-text-muted">
          Author
        </span>
        <Select
          value={value.authorId || "all"}
          onValueChange={(v) => setField("authorId", v === "all" ? "" : v)}
        >
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="max-h-72">
            <SelectItem value="all">All authors</SelectItem>
            {sortedAuthors.map((u) => (
              <SelectItem key={u.id} value={u.id}>
                {u.display_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
