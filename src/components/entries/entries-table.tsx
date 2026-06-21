"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type RowSelectionState,
  type VisibilityState,
} from "@tanstack/react-table";
import {
  AlertTriangle,
  Archive,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Columns3,
  Image as ImageIcon,
  Loader2,
  Plus,
  RotateCcw,
  Save,
  Search,
  Star,
  X,
} from "lucide-react";
import { cn, formatDate } from "@/lib/utils";
import { useIsMobile } from "@/lib/hooks/use-is-mobile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuCheckboxItem,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { UserAvatar } from "@/components/users/user-avatar";
import {
  ContentStatusBadge,
  EditorStatusBadge,
  GraphicStatusBadge,
  aggregateGraphicStatus,
} from "./status-badges";
import { EntryDetailPanel } from "./entry-detail-panel";
import type {
  ContentStatus,
  EditorStatus,
  EntrySummary,
  EntryTier,
} from "@/lib/entries/queries";
import type { AppSite } from "@/lib/auth/current-user";
import type { SavedViewRecord } from "@/lib/views/data";

// --------------------------------------------------------------------------
// Filter state
// --------------------------------------------------------------------------

export type EntriesFilterState = {
  search: string;
  site: AppSite | "";
  tierId: string;
  contentStatus: ContentStatus | "";
  editorStatus: EditorStatus | "";
  priority: "true" | "false" | "";
  includeArchived: boolean;
  sortBy: "publish_date" | "created_at" | "updated_at" | "title";
  sortDir: "asc" | "desc";
};

export const DEFAULT_FILTERS: EntriesFilterState = {
  search: "",
  site: "",
  tierId: "",
  contentStatus: "",
  editorStatus: "",
  priority: "",
  includeArchived: false,
  sortBy: "publish_date",
  sortDir: "asc",
};

const ALL_COLUMNS = [
  { id: "title", label: "Title", defaultVisible: true },
  { id: "authors", label: "Authors", defaultVisible: true },
  { id: "content_status", label: "Content", defaultVisible: true },
  { id: "editor_status", label: "Editor", defaultVisible: true },
  { id: "graphic_status", label: "Graphic", defaultVisible: true },
  { id: "tier", label: "Tier", defaultVisible: true },
  { id: "site", label: "Site", defaultVisible: true },
  { id: "publish_date", label: "Publish date", defaultVisible: true },
  { id: "category", label: "Category", defaultVisible: false },
  { id: "checklist", label: "Checklist", defaultVisible: false },
  { id: "word_count", label: "Words", defaultVisible: false },
  { id: "updated_at", label: "Updated", defaultVisible: false },
];

const DEFAULT_VISIBILITY: VisibilityState = ALL_COLUMNS.reduce(
  (acc, col) => ({ ...acc, [col.id]: col.defaultVisible }),
  {},
);

// --------------------------------------------------------------------------
// Props + shell
// --------------------------------------------------------------------------

type EntriesTableProps = {
  tiers: EntryTier[];
  initialViews: SavedViewRecord[];
  onCreateClick: () => void;
  onBulkCreateClick?: () => void;
};

export function EntriesTable({
  tiers,
  initialViews,
  onCreateClick,
  onBulkCreateClick,
}: EntriesTableProps) {
  const router = useRouter();
  const [filters, setFilters] = React.useState<EntriesFilterState>(DEFAULT_FILTERS);
  const [visibility, setVisibility] = React.useState<VisibilityState>(DEFAULT_VISIBILITY);
  const [entries, setEntries] = React.useState<EntrySummary[]>([]);
  const [totalCount, setTotalCount] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [views, setViews] = React.useState<SavedViewRecord[]>(initialViews);
  const [rowSelection, setRowSelection] = React.useState<RowSelectionState>({});
  const [bulkBusy, setBulkBusy] = React.useState(false);
  const isMobile = useIsMobile();
  const tableContainerRef = React.useRef<HTMLDivElement | null>(null);

  // Apply default view on mount.
  React.useEffect(() => {
    const defaultView = initialViews.find((v) => v.is_default);
    if (defaultView) {
      applyView(defaultView);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyView(view: SavedViewRecord) {
    const f = { ...DEFAULT_FILTERS, ...(view.filters as Partial<EntriesFilterState>) };
    if (view.sort && typeof (view.sort as { sortBy?: string }).sortBy === "string") {
      f.sortBy = (view.sort as { sortBy: EntriesFilterState["sortBy"] }).sortBy;
    }
    if (view.sort && typeof (view.sort as { sortDir?: string }).sortDir === "string") {
      f.sortDir = (view.sort as { sortDir: "asc" | "desc" }).sortDir;
    }
    setFilters(f);
    if (view.columns && view.columns.length > 0) {
      const vis: VisibilityState = {};
      for (const col of ALL_COLUMNS) {
        vis[col.id] = view.columns.includes(col.id);
      }
      setVisibility(vis);
    }
  }

  // Fetch entries whenever filters change (debounced on search).
  React.useEffect(() => {
    let cancelled = false;
    const id = setTimeout(() => {
      void (async () => {
        setLoading(true);
        try {
          const params = new URLSearchParams();
          if (filters.search) params.set("search", filters.search);
          if (filters.site) params.set("site", filters.site);
          if (filters.tierId) params.set("tierId", filters.tierId);
          if (filters.contentStatus) params.set("contentStatus", filters.contentStatus);
          if (filters.editorStatus) params.set("editorStatus", filters.editorStatus);
          if (filters.priority) params.set("priority", filters.priority);
          if (filters.includeArchived) params.set("includeArchived", "true");
          params.set("sortBy", filters.sortBy);
          params.set("sortDir", filters.sortDir);
          params.set("limit", "100");

          const res = await fetch(`/api/entries?${params.toString()}`);
          if (!res.ok) {
            if (!cancelled) {
              setEntries([]);
              setTotalCount(0);
            }
            return;
          }
          const data = (await res.json()) as {
            entries: EntrySummary[];
            totalCount: number;
          };
          if (!cancelled) {
            setEntries(data.entries ?? []);
            setTotalCount(data.totalCount ?? 0);
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 200);

    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [filters]);

  // Column definitions (memoized so TanStack doesn't re-render unnecessarily).
  const columns = React.useMemo<ColumnDef<EntrySummary>[]>(
    () => buildColumns(),
    [],
  );

  const table = useReactTable({
    data: entries,
    columns,
    state: { columnVisibility: visibility, rowSelection },
    onColumnVisibilityChange: setVisibility,
    onRowSelectionChange: setRowSelection,
    enableRowSelection: true,
    getCoreRowModel: getCoreRowModel(),
    getRowId: (row) => row.id,
  });

  const [bulkTierId, setBulkTierId] = React.useState<string>("");

  const allRows = table.getRowModel().rows;

  const selectedCount = Object.keys(rowSelection).length;
  const selectedIds = Object.keys(rowSelection);

  async function runBulk(body: Record<string, unknown>) {
    setBulkBusy(true);
    try {
      const res = await fetch("/api/entries/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, entry_ids: selectedIds }),
      });
      if (res.ok) {
        setRowSelection({});
        setFilters((f) => ({ ...f })); // re-fetch
        router.refresh();
      }
    } finally {
      setBulkBusy(false);
    }
  }

  const hasActiveFilters =
    filters.search !== "" ||
    filters.site !== "" ||
    filters.tierId !== "" ||
    filters.contentStatus !== "" ||
    filters.editorStatus !== "" ||
    filters.priority !== "" ||
    filters.includeArchived;

  const activeFilterCount =
    (filters.search ? 1 : 0) +
    (filters.site ? 1 : 0) +
    (filters.tierId ? 1 : 0) +
    (filters.contentStatus ? 1 : 0) +
    (filters.editorStatus ? 1 : 0) +
    (filters.priority ? 1 : 0) +
    (filters.includeArchived ? 1 : 0);

  async function refreshViews() {
    const res = await fetch("/api/views");
    const data = (await res.json()) as { views: SavedViewRecord[] };
    setViews(data.views ?? []);
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <EntriesToolbar
        filters={filters}
        onFiltersChange={setFilters}
        tiers={tiers}
        totalCount={totalCount}
        loading={loading}
        activeFilterCount={activeFilterCount}
        hasActiveFilters={hasActiveFilters}
        onCreateClick={onCreateClick}
        onBulkCreateClick={onBulkCreateClick}
        views={views}
        onApplyView={applyView}
        onSaveView={async () => {
          const name = window.prompt("Name this view:");
          if (!name?.trim()) return;
          const columnsToSave = Object.entries(visibility)
            .filter(([, v]) => v !== false)
            .map(([k]) => k);
          const res = await fetch("/api/views", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              name: name.trim(),
              filters,
              sort: { sortBy: filters.sortBy, sortDir: filters.sortDir },
              columns: columnsToSave,
              is_default: false,
            }),
          });
          if (res.ok) void refreshViews();
        }}
        onDeleteView={async (id) => {
          const confirmed = window.confirm("Delete this saved view?");
          if (!confirmed) return;
          const res = await fetch(`/api/views/${id}`, { method: "DELETE" });
          if (res.ok) void refreshViews();
        }}
        onSetDefaultView={async (id) => {
          const res = await fetch(`/api/views/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ is_default: true }),
          });
          if (res.ok) void refreshViews();
        }}
        visibility={visibility}
        onVisibilityChange={setVisibility}
      />

      {/* Bulk actions bar */}
      {selectedCount > 0 ? (
        <div className="flex items-center gap-3 rounded-md border border-cyan/30 bg-cyan-dim/20 px-4 py-2 text-xs">
          <span className="font-medium text-text-cell">
            {selectedCount} selected
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={bulkBusy}
            onClick={() => {
              if (
                window.confirm(
                  `Archive ${selectedCount} entries? They'll be soft-deleted and can be restored later.`,
                )
              ) {
                void runBulk({ action: "archive" });
              }
            }}
          >
            <Archive className="h-3.5 w-3.5" />
            Archive
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={bulkBusy}
            onClick={() => {
              void runBulk({ action: "set_priority", priority: true });
            }}
          >
            <Star className="h-3.5 w-3.5 text-amber" />
            Set priority
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={bulkBusy}
            onClick={() => {
              void runBulk({ action: "set_priority", priority: false });
            }}
          >
            <Star className="h-3.5 w-3.5" />
            Remove priority
          </Button>
          {filters.includeArchived ? (
            <Button
              variant="outline"
              size="sm"
              disabled={bulkBusy}
              onClick={() => {
                void runBulk({ action: "unarchive" });
              }}
            >
              <Archive className="h-3.5 w-3.5 text-cyan" />
              Unarchive
            </Button>
          ) : null}
          <div className="flex items-center gap-1.5">
            <Select
              value={bulkTierId}
              onValueChange={setBulkTierId}
            >
              <SelectTrigger className="h-8 w-[140px] text-xs">
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
            <Button
              variant="outline"
              size="sm"
              disabled={bulkBusy || !bulkTierId}
              onClick={() => {
                void runBulk({ action: "change_tier", tier_id: bulkTierId });
              }}
            >
              Change tier
            </Button>
          </div>
          <div className="ml-auto">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setRowSelection({})}
            >
              <X className="h-3 w-3" />
              Clear
            </Button>
          </div>
        </div>
      ) : null}

      {/* Entries — table on desktop, card list on mobile */}
      {isMobile ? (
        <div className="space-y-2">
          {loading && entries.length === 0 ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-text-zero" />
            </div>
          ) : entries.length === 0 ? (
            <EmptyState
              title={
                hasActiveFilters
                  ? "No entries match these filters"
                  : "No entries yet"
              }
              description={
                hasActiveFilters
                  ? "Try clearing some filters or create a new entry."
                  : "Create your first content entry to get the pipeline going."
              }
              action={
                <Button onClick={onCreateClick}>
                  <Plus className="h-3.5 w-3.5" />
                  New entry
                </Button>
              }
            />
          ) : (
            entries.map((entry) => {
              const isExpanded = expandedId === entry.id;
              return (
                <React.Fragment key={entry.id}>
                  <button
                    type="button"
                    className={cn(
                      "w-full rounded-lg border border-border bg-card p-3 text-left transition-colors",
                      isExpanded && "border-cyan/40 bg-surface-3/50",
                      entry.content_status === "writer_needed" && "border-amber/30",
                    )}
                    onClick={() => setExpandedId(isExpanded ? null : entry.id)}
                  >
                    <div className="flex items-start gap-2">
                      {entry.priority ? (
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber" />
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-text-cell">
                          {entry.title}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <ContentStatusBadge status={entry.content_status} />
                          <EditorStatusBadge status={entry.editor_status} />
                          <Badge variant="outline" className="text-[9px]">
                            {entry.site.toUpperCase()}
                          </Badge>
                          <Badge variant="outline" className="text-[9px]">
                            {entry.tier.name}
                          </Badge>
                        </div>
                        {entry.publish_date ? (
                          <p className="mt-1 text-[10px] text-text-zero">
                            {formatDate(entry.publish_date, { dateStyle: "medium" })}
                          </p>
                        ) : null}
                      </div>
                      {isExpanded ? (
                        <ChevronDown className="mt-0.5 h-4 w-4 shrink-0 text-text-zero" />
                      ) : (
                        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-text-zero" />
                      )}
                    </div>
                    {entry.authors.length > 0 ? (
                      <div className="mt-1.5 flex items-center gap-1">
                        {entry.authors.slice(0, 3).map((a) => (
                          <UserAvatar
                            key={a.user_id}
                            displayName={a.display_name}
                            avatarUrl={a.avatar_url}
                            size="xs"
                          />
                        ))}
                        <span className="text-[10px] text-text-zero">
                          {entry.authors.map((a) => a.display_name).join(", ")}
                        </span>
                      </div>
                    ) : null}
                  </button>
                  {isExpanded ? (
                    <div className="rounded-lg border border-border bg-surface-2/50 p-0">
                      <EntryDetailPanel
                        entryId={entry.id}
                        onClose={() => setExpandedId(null)}
                        onChanged={() => {
                          router.refresh();
                          setFilters((f) => ({ ...f }));
                        }}
                      />
                    </div>
                  ) : null}
                </React.Fragment>
              );
            })
          )}
        </div>
      ) : (
        <div
          ref={tableContainerRef}
          className="max-h-[70vh] overflow-auto rounded-[10px] border border-border-table bg-transparent shadow-[0_0_0_1px_rgba(7,9,18,0.3),0_18px_30px_rgba(0,0,0,0.28)]"
        >
          {/* font-data → Work Sans for table DATA; badges keep DM Sans */}
          <table className="w-full font-data text-sm">
            <thead className="plpd-thead sticky top-0 z-10 border-b border-border-thead">
              {table.getHeaderGroups().map((headerGroup) => (
                <tr key={headerGroup.id}>
                  <th className="w-8 px-2 py-2">
                    <Checkbox
                      checked={
                        entries.length > 0 &&
                        table.getIsAllRowsSelected()
                      }
                      onCheckedChange={(checked) =>
                        table.toggleAllRowsSelected(Boolean(checked))
                      }
                      aria-label="Select all"
                    />
                  </th>
                  <th className="w-8 px-2 py-2" />
                  {headerGroup.headers.map((header) => (
                    <th
                      key={header.id}
                      className="px-3 py-2 text-left font-data text-[13px] font-semibold uppercase tracking-wide text-cyan-header"
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody className="divide-y divide-border-row">
              {loading && entries.length === 0 ? (
                <tr>
                  <td
                    colSpan={table.getVisibleFlatColumns().length + 2}
                    className="px-4 py-10 text-center text-text-zero"
                  >
                    <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                  </td>
                </tr>
              ) : entries.length === 0 ? (
                <tr>
                  <td
                    colSpan={table.getVisibleFlatColumns().length + 2}
                    className="px-4 py-10"
                  >
                    <EmptyState
                      title={
                        hasActiveFilters
                          ? "No entries match these filters"
                          : "No entries yet"
                      }
                      description={
                        hasActiveFilters
                          ? "Try clearing some filters or create a new entry."
                          : "Create your first content entry to get the pipeline going."
                      }
                      action={
                        <Button onClick={onCreateClick}>
                          <Plus className="h-3.5 w-3.5" />
                          New entry
                        </Button>
                      }
                    />
                  </td>
                </tr>
              ) : (
                allRows.map((row, idx) => {
                  const isExpanded = expandedId === row.id;
                  const entry = row.original;
                  return (
                    <React.Fragment key={row.id}>
                      <tr
                        className={cn(
                          // PLPD translucent zebra (mesh breathes through) + hover lift.
                          // Row-state variants use dedicated fills, NEVER opacity.
                          "cursor-pointer transition-colors hover:bg-[rgba(85,232,255,0.06)]",
                          idx % 2 === 0 ? "bg-row-a" : "bg-row-b",
                          isExpanded && "bg-[rgba(85,232,255,0.06)]",
                          entry.content_status === "writer_needed" &&
                            "bg-[rgba(255,194,119,0.08)]",
                          row.getIsSelected() && "bg-[rgba(85,232,255,0.1)]",
                        )}
                        onClick={() =>
                          setExpandedId(isExpanded ? null : row.id)
                        }
                      >
                        <td
                          className="w-8 px-2 py-3 align-top"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Checkbox
                            checked={row.getIsSelected()}
                            onCheckedChange={(checked) =>
                              row.toggleSelected(Boolean(checked))
                            }
                            aria-label={`Select ${entry.title}`}
                          />
                        </td>
                        <td className="w-8 px-2 py-3 align-top text-text-zero">
                          {isExpanded ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                        </td>
                        {row.getVisibleCells().map((cell) => (
                          <td
                            key={cell.id}
                            className="px-3 py-3 align-top"
                          >
                            {flexRender(
                              cell.column.columnDef.cell,
                              cell.getContext(),
                            )}
                          </td>
                        ))}
                      </tr>
                      {isExpanded ? (
                        <tr>
                          <td
                            colSpan={table.getVisibleFlatColumns().length + 2}
                            className="bg-surface-2/50 p-0"
                          >
                            <EntryDetailPanel
                              entryId={entry.id}
                              onClose={() => setExpandedId(null)}
                              onChanged={() => {
                                router.refresh();
                                setFilters((f) => ({ ...f }));
                              }}
                            />
                          </td>
                        </tr>
                      ) : null}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-text-zero">
        <span>
          {loading ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              Loading…
            </span>
          ) : (
            <>
              {entries.length} of {totalCount} {totalCount === 1 ? "entry" : "entries"}
            </>
          )}
        </span>
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Toolbar — search, filters, column visibility, saved views, create
// --------------------------------------------------------------------------

type ToolbarProps = {
  filters: EntriesFilterState;
  onFiltersChange: (filters: EntriesFilterState) => void;
  tiers: EntryTier[];
  totalCount: number;
  loading: boolean;
  activeFilterCount: number;
  hasActiveFilters: boolean;
  onCreateClick: () => void;
  onBulkCreateClick?: () => void;
  views: SavedViewRecord[];
  onApplyView: (view: SavedViewRecord) => void;
  onSaveView: () => Promise<void>;
  onDeleteView: (id: string) => Promise<void>;
  onSetDefaultView: (id: string) => Promise<void>;
  visibility: VisibilityState;
  onVisibilityChange: (v: VisibilityState) => void;
};

function EntriesToolbar({
  filters,
  onFiltersChange,
  tiers,
  activeFilterCount,
  hasActiveFilters,
  onCreateClick,
  onBulkCreateClick,
  views,
  onApplyView,
  onSaveView,
  onDeleteView,
  onSetDefaultView,
  visibility,
  onVisibilityChange,
}: ToolbarProps) {
  function update<K extends keyof EntriesFilterState>(
    key: K,
    value: EntriesFilterState[K],
  ) {
    onFiltersChange({ ...filters, [key]: value });
  }

  function reset() {
    onFiltersChange(DEFAULT_FILTERS);
  }

  const ALL = "__all__";

  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-3">
      {/* Row 1 — search + create */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-zero" />
          <Input
            value={filters.search}
            onChange={(e) => update("search", e.target.value)}
            placeholder="Search titles…"
            className="pl-8"
          />
        </div>

        {/* Saved views */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              <Star className="h-3.5 w-3.5" />
              Views
              {views.length > 0 ? (
                <Badge variant="outline" className="ml-1">
                  {views.length}
                </Badge>
              ) : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-72" align="end">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold">Saved views</h4>
                <Button size="sm" variant="ghost" onClick={onSaveView}>
                  <Save className="h-3.5 w-3.5" />
                  Save current
                </Button>
              </div>
              {views.length === 0 ? (
                <p className="text-xs italic text-text-zero">
                  No saved views yet. Set some filters, then click &quot;Save
                  current&quot; to remember this configuration.
                </p>
              ) : (
                <ul className="space-y-1">
                  {views.map((view) => (
                    <li
                      key={view.id}
                      className="flex items-center justify-between gap-1 rounded-sm px-2 py-1 hover:bg-surface-3"
                    >
                      <button
                        type="button"
                        className="flex-1 truncate text-left text-sm"
                        onClick={() => onApplyView(view)}
                      >
                        {view.name}
                        {view.is_default ? (
                          <Badge variant="cyan" className="ml-2">
                            Default
                          </Badge>
                        ) : null}
                      </button>
                      {!view.is_default ? (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => onSetDefaultView(view.id)}
                          title="Set as default"
                          className="h-6 w-6"
                        >
                          <Star className="h-3 w-3" />
                        </Button>
                      ) : null}
                      <Button
                        size="icon"
                        variant="ghost"
                        onClick={() => onDeleteView(view.id)}
                        title="Delete view"
                        className="h-6 w-6 text-destructive"
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </PopoverContent>
        </Popover>

        {/* Column visibility */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <Columns3 className="h-3.5 w-3.5" />
              Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {ALL_COLUMNS.map((col) => (
              <DropdownMenuCheckboxItem
                key={col.id}
                checked={visibility[col.id] !== false}
                onCheckedChange={(checked) =>
                  onVisibilityChange({ ...visibility, [col.id]: Boolean(checked) })
                }
              >
                {col.label}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {onBulkCreateClick ? (
          <Button variant="outline" onClick={onBulkCreateClick}>
            <Plus className="h-3.5 w-3.5" />
            Bulk
          </Button>
        ) : null}

        <Button onClick={onCreateClick}>
          <Plus className="h-3.5 w-3.5" />
          New entry
        </Button>
      </div>

      {/* Row 2 — filter controls */}
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={filters.site || ALL}
          onValueChange={(v) => update("site", v === ALL ? "" : (v as AppSite))}
        >
          <SelectTrigger className="h-8 w-[110px] text-xs">
            <SelectValue placeholder="Site" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All sites</SelectItem>
            <SelectItem value="pl">Pitcher List</SelectItem>
            <SelectItem value="qb">QB List</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.tierId || ALL}
          onValueChange={(v) => update("tierId", v === ALL ? "" : v)}
        >
          <SelectTrigger className="h-8 w-[140px] text-xs">
            <SelectValue placeholder="Tier" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All tiers</SelectItem>
            {tiers.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name} — {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.contentStatus || ALL}
          onValueChange={(v) =>
            update("contentStatus", v === ALL ? "" : (v as ContentStatus))
          }
        >
          <SelectTrigger className="h-8 w-[150px] text-xs">
            <SelectValue placeholder="Content status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any content status</SelectItem>
            <SelectItem value="writer_needed">Writer needed</SelectItem>
            <SelectItem value="claim_requested">Claim requested</SelectItem>
            <SelectItem value="claimed">Claimed</SelectItem>
            <SelectItem value="submitted">Submitted</SelectItem>
            <SelectItem value="polishing">Polishing</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.editorStatus || ALL}
          onValueChange={(v) =>
            update("editorStatus", v === ALL ? "" : (v as EditorStatus))
          }
        >
          <SelectTrigger className="h-8 w-[150px] text-xs">
            <SelectValue placeholder="Editor status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any editor status</SelectItem>
            <SelectItem value="none">None</SelectItem>
            <SelectItem value="ready_for_edit">Ready for edit</SelectItem>
            <SelectItem value="edited">Edited</SelectItem>
            <SelectItem value="scheduled">Scheduled</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={filters.priority || ALL}
          onValueChange={(v) =>
            update("priority", v === ALL ? "" : (v as "true" | "false"))
          }
        >
          <SelectTrigger className="h-8 w-[130px] text-xs">
            <SelectValue placeholder="Priority" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any priority</SelectItem>
            <SelectItem value="true">Priority only</SelectItem>
            <SelectItem value="false">Not priority</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={`${filters.sortBy}:${filters.sortDir}`}
          onValueChange={(v) => {
            const [sortBy, sortDir] = v.split(":") as [
              EntriesFilterState["sortBy"],
              "asc" | "desc",
            ];
            onFiltersChange({ ...filters, sortBy, sortDir });
          }}
        >
          <SelectTrigger className="h-8 w-[170px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="publish_date:asc">
              Publish date ↑
            </SelectItem>
            <SelectItem value="publish_date:desc">
              Publish date ↓
            </SelectItem>
            <SelectItem value="created_at:desc">Newest first</SelectItem>
            <SelectItem value="updated_at:desc">Recently updated</SelectItem>
            <SelectItem value="title:asc">Title A-Z</SelectItem>
          </SelectContent>
        </Select>

        <label className="flex items-center gap-2 text-xs text-text-team">
          <Checkbox
            checked={filters.includeArchived}
            onCheckedChange={(checked) =>
              update("includeArchived", Boolean(checked))
            }
          />
          Include archived
        </label>

        {hasActiveFilters ? (
          <Button variant="ghost" size="sm" onClick={reset}>
            <RotateCcw className="h-3 w-3" />
            Clear {activeFilterCount > 1 ? `(${activeFilterCount})` : ""}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// Column builders
// --------------------------------------------------------------------------

function buildColumns(): ColumnDef<EntrySummary>[] {
  return [
    {
      id: "title",
      header: () => "Title",
      cell: ({ row }) => {
        const entry = row.original;
        return (
          <div className="max-w-lg">
            <div className="flex items-center gap-2">
              {entry.priority ? (
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber" />
              ) : null}
              <span className="font-medium text-text-cell">{entry.title}</span>
            </div>
            {entry.description ? (
              <p className="mt-0.5 line-clamp-1 text-xs text-text-zero">
                {entry.description}
              </p>
            ) : null}
          </div>
        );
      },
    },
    {
      id: "authors",
      header: () => "Authors",
      cell: ({ row }) => {
        const authors = row.original.authors;
        if (authors.length === 0) {
          return <span className="text-xs italic text-text-zero">—</span>;
        }
        return (
          <div className="flex items-center gap-1.5">
            {authors.slice(0, 3).map((a) => (
              <UserAvatar
                key={a.user_id}
                displayName={a.display_name}
                avatarUrl={a.avatar_url}
                size="xs"
              />
            ))}
            {authors.length > 3 ? (
              <span className="text-[10px] text-text-zero">
                +{authors.length - 3}
              </span>
            ) : null}
          </div>
        );
      },
    },
    {
      id: "content_status",
      header: () => "Content",
      cell: ({ row }) => <ContentStatusBadge status={row.original.content_status} />,
    },
    {
      id: "editor_status",
      header: () => "Editor",
      cell: ({ row }) => <EditorStatusBadge status={row.original.editor_status} />,
    },
    {
      id: "graphic_status",
      header: () => "Graphic",
      cell: ({ row }) => {
        const statuses = row.original.graphics.map((g) => g.graphic_status);
        const agg = aggregateGraphicStatus(statuses);
        if (!agg) {
          return (
            <span className="inline-flex items-center gap-1 text-xs text-text-zero">
              <ImageIcon className="h-3 w-3" />—
            </span>
          );
        }
        return <GraphicStatusBadge status={agg} />;
      },
    },
    {
      id: "tier",
      header: () => "Tier",
      cell: ({ row }) => (
        <Badge variant="outline">
          {row.original.tier.name}
        </Badge>
      ),
    },
    {
      id: "site",
      header: () => "Site",
      cell: ({ row }) => (
        <Badge variant="outline">
          {row.original.site.toUpperCase()}
        </Badge>
      ),
    },
    {
      id: "publish_date",
      header: () => "Publish date",
      cell: ({ row }) => {
        const { publish_date, publish_date_precision } = row.original;
        if (!publish_date) {
          return <span className="text-xs italic text-text-zero">Unscheduled</span>;
        }
        const showTime =
          publish_date_precision === "exact" ||
          publish_date_precision === "loose_time";
        return (
          <div className="text-xs">
            <div className="font-medium text-text-cell">
              {formatDate(publish_date, {
                dateStyle: "medium",
                timeStyle: showTime ? "short" : undefined,
              })}
            </div>
            {publish_date_precision !== "exact" ? (
              <div className="font-mono text-[10px] uppercase text-text-zero">
                {precisionLabel(publish_date_precision)}
              </div>
            ) : null}
          </div>
        );
      },
    },
    {
      id: "category",
      header: () => "Category",
      cell: ({ row }) =>
        row.original.category ? (
          <span className="text-xs">{row.original.category.name}</span>
        ) : (
          <span className="text-xs italic text-text-zero">—</span>
        ),
    },
    {
      id: "checklist",
      header: () => "Checklist",
      cell: ({ row }) => {
        const { checklist_total, checklist_completed } = row.original;
        if (checklist_total === 0) {
          return <span className="text-xs italic text-text-zero">—</span>;
        }
        const pct = Math.round(
          (checklist_completed / checklist_total) * 100,
        );
        return (
          <div className="flex items-center gap-1.5 text-xs">
            <span className="font-mono tabular-nums text-text-team">
              {checklist_completed}/{checklist_total}
            </span>
            <div className="h-1 w-10 overflow-hidden rounded-full bg-surface-4">
              <div
                className="h-full bg-cyan"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      },
    },
    {
      id: "word_count",
      header: () => "Words",
      cell: ({ row }) => (
        <span className="font-mono text-xs tabular-nums text-text-team">
          {row.original.word_count > 0
            ? row.original.word_count.toLocaleString()
            : "—"}
        </span>
      ),
    },
    {
      id: "updated_at",
      header: () => "Updated",
      cell: ({ row }) => (
        <span className="text-xs text-text-zero">
          {formatDate(row.original.updated_at, { dateStyle: "short" })}
        </span>
      ),
    },
  ];
}

function precisionLabel(
  precision: EntrySummary["publish_date_precision"],
): string {
  switch (precision) {
    case "loose_date":
      return "approx. date";
    case "loose_time":
      return "approx. time";
    case "none":
      return "no date";
    default:
      return "";
  }
}

// Re-export for use by the page.
export { ArrowDown, ArrowUp };
