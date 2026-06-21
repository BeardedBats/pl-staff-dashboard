"use client";

import * as React from "react";
import { ImageIcon, LayoutGrid, List, Loader2, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { GraphicRequestCard } from "@/components/graphics/graphic-request-card";
import { GraphicsKanban } from "./graphics-kanban";
import type { GraphicRequestRecord } from "@/lib/graphics/data";
import type { GraphicStatus } from "@/lib/entries/queries";
import type { AppSite } from "@/lib/auth/current-user";

type GraphicsPageClientProps = {
  initialRequests: GraphicRequestRecord[];
  currentUserId: string;
};

type ViewMode = "table" | "kanban";

const ALL = "__all__";

export function GraphicsPageClient({
  initialRequests,
  currentUserId,
}: GraphicsPageClientProps) {
  const [requests, setRequests] = React.useState(initialRequests);
  const [view, setView] = React.useState<ViewMode>("table");
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<GraphicStatus | "">("");
  const [siteFilter, setSiteFilter] = React.useState<AppSite | "">("");
  const [loading, setLoading] = React.useState(false);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set("status", statusFilter);
      if (siteFilter) params.set("site", siteFilter);
      const res = await fetch(`/api/graphic-requests?${params.toString()}`);
      const data = (await res.json()) as { requests: GraphicRequestRecord[] };
      setRequests(data.requests ?? []);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, siteFilter]);

  // Re-fetch whenever a filter changes.
  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = React.useMemo(() => {
    if (!search.trim()) return requests;
    const term = search.toLowerCase();
    return requests.filter(
      (r) =>
        r.title.toLowerCase().includes(term) ||
        r.entry_title.toLowerCase().includes(term) ||
        (r.description?.toLowerCase().includes(term) ?? false),
    );
  }, [requests, search]);

  const statusCounts = React.useMemo(() => {
    const counts: Record<GraphicStatus, number> = {
      needed: 0,
      claimed: 0,
      submitted: 0,
      flagged: 0,
    };
    for (const r of requests) counts[r.graphic_status] += 1;
    return counts;
  }, [requests]);

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-zero" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search graphic or entry titles…"
            className="pl-8"
          />
        </div>

        <Select
          value={statusFilter || ALL}
          onValueChange={(v) =>
            setStatusFilter(v === ALL ? "" : (v as GraphicStatus))
          }
        >
          <SelectTrigger className="h-8 w-[150px] text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Any status</SelectItem>
            <SelectItem value="needed">Needed</SelectItem>
            <SelectItem value="claimed">Claimed</SelectItem>
            <SelectItem value="submitted">Submitted</SelectItem>
            <SelectItem value="flagged">Flagged</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={siteFilter || ALL}
          onValueChange={(v) => setSiteFilter(v === ALL ? "" : (v as AppSite))}
        >
          <SelectTrigger className="h-8 w-[130px] text-xs">
            <SelectValue placeholder="Site" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All sites</SelectItem>
            <SelectItem value="pl">Pitcher List</SelectItem>
            <SelectItem value="qb">QB List</SelectItem>
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center rounded-sm border border-border">
          <Button
            size="sm"
            variant={view === "table" ? "secondary" : "ghost"}
            onClick={() => setView("table")}
            className="rounded-none rounded-l-sm"
          >
            <List className="h-3.5 w-3.5" />
            Table
          </Button>
          <Button
            size="sm"
            variant={view === "kanban" ? "secondary" : "ghost"}
            onClick={() => setView("kanban")}
            className="rounded-none rounded-r-sm"
          >
            <LayoutGrid className="h-3.5 w-3.5" />
            Kanban
          </Button>
        </div>
      </div>

      {/* Status tally */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-text-zero">Summary:</span>
        <Badge variant="outline">
          Needed <span className="ml-1 font-mono tabular-nums">{statusCounts.needed}</span>
        </Badge>
        <Badge variant="cyan">
          Claimed <span className="ml-1 font-mono tabular-nums">{statusCounts.claimed}</span>
        </Badge>
        <Badge variant="success">
          Submitted{" "}
          <span className="ml-1 font-mono tabular-nums">
            {statusCounts.submitted}
          </span>
        </Badge>
        <Badge variant="danger">
          Flagged{" "}
          <span className="ml-1 font-mono tabular-nums">{statusCounts.flagged}</span>
        </Badge>
      </div>

      {/* Content */}
      {loading && requests.length === 0 ? (
        <div className="flex items-center justify-center rounded-lg border border-border bg-card py-10">
          <Loader2 className="h-5 w-5 animate-spin text-text-zero" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<ImageIcon className="h-5 w-5" />}
          title="No graphic requests match"
          description={
            requests.length === 0
              ? "Graphic requests appear here when writers or editors ask for them from the entry detail panel."
              : "Try clearing filters or widening your search."
          }
        />
      ) : view === "table" ? (
        <TableView
          requests={filtered}
          currentUserId={currentUserId}
          onChanged={refresh}
        />
      ) : (
        <GraphicsKanban
          requests={filtered}
          currentUserId={currentUserId}
          onChanged={refresh}
        />
      )}
    </div>
  );
}

// --------------------------------------------------------------------------
// Table view — a dense grid of cards (not a real table for now; the spec
// says "table view" but for graphics with thumbnails a card grid reads
// better on screens of any size).
// --------------------------------------------------------------------------

function TableView({
  requests,
  currentUserId,
  onChanged,
}: {
  requests: GraphicRequestRecord[];
  currentUserId: string;
  onChanged: () => void;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {requests.map((r) => (
        <GraphicRequestCard
          key={r.id}
          request={r}
          currentUserId={currentUserId}
          showEntryLink
          onChanged={onChanged}
        />
      ))}
    </div>
  );
}
