"use client";

import * as React from "react";
import { Archive, ExternalLink, Loader2, Search, Undo2 } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { UserAvatar } from "@/components/users/user-avatar";
import { formatDate } from "@/lib/utils";
import type { EntrySummary } from "@/lib/entries/queries";
import type { AppRole, AppSite } from "@/lib/auth/current-user";

const SITE_ALL = "__all__";
const PAGE_SIZE = 50;

type SiteFilter = AppSite | "";

export default function ArchivePage() {
  const [roleRows, setRoleRows] = React.useState<
    Array<{ role: AppRole; site: AppSite }>
  >([]);
  const [siteArchived, setSiteArchived] = React.useState<SiteFilter>("");
  const [siteHistorical, setSiteHistorical] = React.useState<SiteFilter>("");
  const [searchArchived, setSearchArchived] = React.useState("");
  const [searchHistorical, setSearchHistorical] = React.useState("");
  const [archived, setArchived] = React.useState<EntrySummary[]>([]);
  const [historical, setHistorical] = React.useState<EntrySummary[]>([]);
  const [totalArchived, setTotalArchived] = React.useState(0);
  const [totalHistorical, setTotalHistorical] = React.useState(0);
  const [pageArchived, setPageArchived] = React.useState(1);
  const [pageHistorical, setPageHistorical] = React.useState(1);
  const [loadingArchived, setLoadingArchived] = React.useState(true);
  const [loadingHistorical, setLoadingHistorical] = React.useState(true);
  const [busyId, setBusyId] = React.useState<string | null>(null);

  React.useEffect(() => {
    void (async () => {
      const res = await fetch("/api/auth/me");
      if (!res.ok) return;
      const data = (await res.json()) as {
        user: { role_rows: Array<{ role: AppRole; site: AppSite }> };
      };
      setRoleRows(data.user.role_rows ?? []);
    })();
  }, []);

  const canUnarchive = React.useCallback(
    (site: AppSite) =>
      roleRows.some(
        (row) =>
          ["manager", "admin", "eic", "operations"].includes(row.role) &&
          (row.site === "both" || row.site === site),
      ),
    [roleRows],
  );

  const fetchArchived = React.useCallback(async () => {
    setLoadingArchived(true);
    try {
      const params = new URLSearchParams({
        archivedOnly: "true",
        sortBy: "publish_date",
        sortDir: "desc",
        page: String(pageArchived),
        pageSize: String(PAGE_SIZE),
      });
      if (siteArchived) params.set("site", siteArchived);
      if (searchArchived) params.set("search", searchArchived);
      const res = await fetch(`/api/entries?${params.toString()}`);
      if (!res.ok) {
        setArchived([]);
        setTotalArchived(0);
        return;
      }
      const data = (await res.json()) as {
        entries: EntrySummary[];
        totalCount: number;
      };
      setArchived(data.entries ?? []);
      setTotalArchived(data.totalCount ?? 0);
    } finally {
      setLoadingArchived(false);
    }
  }, [siteArchived, searchArchived, pageArchived]);

  const fetchHistorical = React.useCallback(async () => {
    setLoadingHistorical(true);
    try {
      const params = new URLSearchParams({
        historicalOnly: "true",
        sortBy: "publish_date",
        sortDir: "desc",
        page: String(pageHistorical),
        pageSize: String(PAGE_SIZE),
      });
      if (siteHistorical) params.set("site", siteHistorical);
      if (searchHistorical) params.set("search", searchHistorical);
      const res = await fetch(`/api/entries?${params.toString()}`);
      if (!res.ok) {
        setHistorical([]);
        setTotalHistorical(0);
        return;
      }
      const data = (await res.json()) as {
        entries: EntrySummary[];
        totalCount: number;
      };
      setHistorical(data.entries ?? []);
      setTotalHistorical(data.totalCount ?? 0);
    } finally {
      setLoadingHistorical(false);
    }
  }, [siteHistorical, searchHistorical, pageHistorical]);

  React.useEffect(() => {
    setPageArchived(1);
  }, [siteArchived, searchArchived]);

  React.useEffect(() => {
    setPageHistorical(1);
  }, [siteHistorical, searchHistorical]);

  React.useEffect(() => {
    const id = setTimeout(() => {
      void fetchArchived();
    }, 200);
    return () => clearTimeout(id);
  }, [fetchArchived]);

  React.useEffect(() => {
    const id = setTimeout(() => {
      void fetchHistorical();
    }, 200);
    return () => clearTimeout(id);
  }, [fetchHistorical]);

  async function unarchive(id: string) {
    setBusyId(id);
    try {
      const res = await fetch("/api/entries/bulk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "unarchive", entry_ids: [id] }),
      });
      if (res.ok) await fetchArchived();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-cell">
          Published Archive
        </h1>
        <p className="mt-1 text-sm text-text-team">
          Archived pipeline entries and historical articles imported from
          WordPress.
        </p>
      </div>

      <Tabs defaultValue="archived" className="w-full">
        <TabsList>
          <TabsTrigger value="archived">
            Archived
            <Badge variant="outline" className="ml-2">
              {totalArchived}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="historical">
            Historical imports
            <Badge variant="outline" className="ml-2">
              {totalHistorical}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="archived">
          <ArchiveFilters
            search={searchArchived}
            onSearch={setSearchArchived}
            site={siteArchived}
            onSite={setSiteArchived}
          />
          <ArchivedTable
            entries={archived}
            loading={loadingArchived}
            canUnarchive={canUnarchive}
            onUnarchive={unarchive}
            busyId={busyId}
          />
          <PaginationControls
            page={pageArchived}
            total={totalArchived}
            pageSize={PAGE_SIZE}
            onPageChange={setPageArchived}
          />
        </TabsContent>

        <TabsContent value="historical">
          <ArchiveFilters
            search={searchHistorical}
            onSearch={setSearchHistorical}
            site={siteHistorical}
            onSite={setSiteHistorical}
          />
          <HistoricalTable
            entries={historical}
            loading={loadingHistorical}
          />
          <PaginationControls
            page={pageHistorical}
            total={totalHistorical}
            pageSize={PAGE_SIZE}
            onPageChange={setPageHistorical}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function PaginationControls({
  page,
  total,
  pageSize,
  onPageChange,
}: {
  page: number;
  total: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  if (total === 0) return null;
  const totalPages = Math.max(Math.ceil(total / pageSize), 1);
  return (
    <div className="mt-3 flex items-center justify-center gap-3 text-xs text-text-team">
      <Button
        size="sm"
        variant="outline"
        disabled={page <= 1}
        onClick={() => onPageChange(page - 1)}
      >
        ← Previous
      </Button>
      <span>
        Page {page} of {totalPages}
      </span>
      <Button
        size="sm"
        variant="outline"
        disabled={page >= totalPages}
        onClick={() => onPageChange(page + 1)}
      >
        Next →
      </Button>
    </div>
  );
}

function ArchiveFilters({
  search,
  onSearch,
  site,
  onSite,
}: {
  search: string;
  onSearch: (v: string) => void;
  site: SiteFilter;
  onSite: (v: SiteFilter) => void;
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <div className="relative flex-1 max-w-md">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-zero" />
        <Input
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search titles…"
          className="pl-8"
        />
      </div>
      <Select
        value={site || SITE_ALL}
        onValueChange={(v) => onSite(v === SITE_ALL ? "" : (v as AppSite))}
      >
        <SelectTrigger className="h-9 w-[140px] text-xs">
          <SelectValue placeholder="Site" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={SITE_ALL}>All sites</SelectItem>
          <SelectItem value="pl">Pitcher List</SelectItem>
          <SelectItem value="qb">QB List</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function ArchivedTable({
  entries,
  loading,
  canUnarchive,
  onUnarchive,
  busyId,
}: {
  entries: EntrySummary[];
  loading: boolean;
  canUnarchive: (site: AppSite) => boolean;
  onUnarchive: (id: string) => void | Promise<void>;
  busyId: string | null;
}) {
  if (loading && entries.length === 0) {
    return (
      <div className="flex justify-center rounded-lg border border-border bg-card p-10">
        <Loader2 className="h-5 w-5 animate-spin text-text-zero" />
      </div>
    );
  }
  if (entries.length === 0) {
    return (
      <EmptyState
        icon={<Archive className="h-5 w-5" />}
        title="No archived entries"
        description="Entries archived from the pipeline will show here. Filters or search may be hiding results."
      />
    );
  }
  const showUnarchiveColumn = entries.some((entry) =>
    canUnarchive(entry.site),
  );
  return (
    <div className="overflow-auto rounded-lg border border-border bg-card">
      <table className="w-full font-data text-sm">
        <thead className="plpd-thead border-b border-border-thead">
          <tr className="text-left font-data text-[13px] font-semibold uppercase tracking-wide text-cyan-header">
            <th className="px-3 py-2">Title</th>
            <th className="px-3 py-2">Author</th>
            <th className="px-3 py-2">Tier</th>
            <th className="px-3 py-2">Site</th>
            <th className="px-3 py-2">Publish date</th>
            <th className="px-3 py-2">Archive reason</th>
            {showUnarchiveColumn ? <th className="px-3 py-2" /> : null}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {entries.map((entry) => (
            <tr key={entry.id} className="hover:bg-surface-3/40">
              <td className="px-3 py-3 align-top">
                <span className="font-medium text-text-cell">
                  {entry.title}
                </span>
              </td>
              <td className="px-3 py-3 align-top">
                {entry.authors.length > 0 ? (
                  <div className="flex items-center gap-1.5">
                    {entry.authors.slice(0, 2).map((a) => (
                      <UserAvatar
                        key={a.user_id}
                        displayName={a.display_name}
                        avatarUrl={a.avatar_url}
                        size="xs"
                      />
                    ))}
                    <span className="text-xs text-text-team">
                      {entry.authors.map((a) => a.display_name).join(", ")}
                    </span>
                  </div>
                ) : (
                  <span className="text-xs italic text-text-zero">—</span>
                )}
              </td>
              <td className="px-3 py-3 align-top">
                <Badge variant="outline" className="font-data">{entry.tier.name}</Badge>
              </td>
              <td className="px-3 py-3 align-top">
                <Badge variant="outline" className="font-data">{entry.site.toUpperCase()}</Badge>
              </td>
              <td className="px-3 py-3 align-top text-xs text-text-team">
                {entry.publish_date
                  ? formatDate(entry.publish_date, { dateStyle: "medium" })
                  : "—"}
              </td>
              <td className="px-3 py-3 align-top">
                <span className="line-clamp-2 max-w-md text-xs text-text-team">
                  {entry.archive_reason ?? (
                    <span className="italic text-text-zero">—</span>
                  )}
                </span>
              </td>
              {showUnarchiveColumn ? (
                <td className="px-3 py-3 align-top text-right">
                  {canUnarchive(entry.site) ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busyId === entry.id}
                      onClick={() => void onUnarchive(entry.id)}
                    >
                      {busyId === entry.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <Undo2 className="h-3 w-3" />
                      )}
                      Unarchive
                    </Button>
                  ) : null}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function HistoricalTable({
  entries,
  loading,
}: {
  entries: EntrySummary[];
  loading: boolean;
}) {
  if (loading && entries.length === 0) {
    return (
      <div className="flex justify-center rounded-lg border border-border bg-card p-10">
        <Loader2 className="h-5 w-5 animate-spin text-text-zero" />
      </div>
    );
  }
  if (entries.length === 0) {
    return (
      <EmptyState
        icon={<Archive className="h-5 w-5" />}
        title="No historical imports"
        description="Articles imported from WordPress for analytics will appear here after the historical import runs."
      />
    );
  }
  return (
    <div className="overflow-auto rounded-lg border border-border bg-card">
      <table className="w-full font-data text-sm">
        <thead className="plpd-thead border-b border-border-thead">
          <tr className="text-left font-data text-[13px] font-semibold uppercase tracking-wide text-cyan-header">
            <th className="px-3 py-2">Title</th>
            <th className="px-3 py-2">Author</th>
            <th className="px-3 py-2">Site</th>
            <th className="px-3 py-2">Publish date</th>
            <th className="px-3 py-2">Category</th>
            <th className="px-3 py-2">WP link</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {entries.map((entry) => (
            <tr key={entry.id} className="hover:bg-surface-3/40">
              <td className="px-3 py-3 align-top">
                <span className="font-medium text-text-cell">
                  {entry.title}
                </span>
              </td>
              <td className="px-3 py-3 align-top">
                {entry.authors.length > 0 ? (
                  <div className="flex items-center gap-1.5">
                    {entry.authors.slice(0, 2).map((a) => (
                      <UserAvatar
                        key={a.user_id}
                        displayName={a.display_name}
                        avatarUrl={a.avatar_url}
                        size="xs"
                      />
                    ))}
                    <span className="text-xs text-text-team">
                      {entry.authors.map((a) => a.display_name).join(", ")}
                    </span>
                  </div>
                ) : (
                  <span className="text-xs italic text-text-zero">—</span>
                )}
              </td>
              <td className="px-3 py-3 align-top">
                <Badge variant="outline" className="font-data">{entry.site.toUpperCase()}</Badge>
              </td>
              <td className="px-3 py-3 align-top text-xs text-text-team">
                {entry.publish_date
                  ? formatDate(entry.publish_date, { dateStyle: "medium" })
                  : "—"}
              </td>
              <td className="px-3 py-3 align-top text-xs text-text-team">
                {entry.category?.name ?? (
                  <span className="italic text-text-zero">—</span>
                )}
              </td>
              <td className="px-3 py-3 align-top">
                {entry.wp_post_url ? (
                  <a
                    href={entry.wp_post_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-cyan hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Open
                  </a>
                ) : (
                  <span className="text-xs italic text-text-zero">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
