"use client";

import * as React from "react";
import { BarChart3, Download, FileText, Upload } from "lucide-react";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import type { EntryCategory, EntryTier } from "@/lib/entries/queries";
import { AnalyticsFiltersBar } from "./analytics-filters-bar";
import { AnalyticsOverviewTab } from "./analytics-overview-tab";
import { AnalyticsArticlesTab } from "./analytics-articles-tab";
import { AnalyticsWritersTab } from "./analytics-writers-tab";
import { AnalyticsTrendsTab } from "./analytics-trends-tab";
import { RaptiveUploadDialog } from "./raptive-upload-dialog";

export type AnalyticsFilterState = {
  dateFrom: string; // YYYY-MM-DD
  dateTo: string;
  site: "pl" | "qb" | "both" | "all";
  tierId: string; // "" = all
  categoryId: string; // "" = all
  authorId: string; // "" = all
};

export type AuthorCandidate = { id: string; display_name: string };

function defaultFilters(
  allowedSites: Array<"pl" | "qb">,
): AnalyticsFilterState {
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  const from = new Date(now);
  from.setDate(from.getDate() - 29);
  return {
    dateFrom: from.toISOString().slice(0, 10),
    dateTo: to,
    site: allowedSites.length === 2 ? "all" : (allowedSites[0] ?? "all"),
    tierId: "",
    categoryId: "",
    authorId: "",
  };
}

export function filterStateToQuery(state: AnalyticsFilterState): URLSearchParams {
  const params = new URLSearchParams();
  params.set("dateFrom", state.dateFrom);
  params.set("dateTo", state.dateTo);
  if (state.site !== "all") params.set("site", state.site);
  if (state.tierId) params.set("tierId", state.tierId);
  if (state.categoryId) params.set("categoryId", state.categoryId);
  if (state.authorId) params.set("authorId", state.authorId);
  return params;
}

type Props = {
  tiers: EntryTier[];
  categories: EntryCategory[];
  authorCandidates: AuthorCandidate[];
  isOperations: boolean;
  allowedSites: Array<"pl" | "qb">;
};

export function AnalyticsPageClient({
  tiers,
  categories,
  authorCandidates,
  isOperations,
  allowedSites,
}: Props) {
  const [filters, setFilters] = React.useState<AnalyticsFilterState>(() =>
    defaultFilters(allowedSites),
  );
  const [raptiveOpen, setRaptiveOpen] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState("overview");

  const queryStr = filterStateToQuery(filters).toString();

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <AnalyticsFiltersBar
          tiers={tiers}
          categories={categories}
          authorCandidates={authorCandidates}
          allowedSites={allowedSites}
          value={filters}
          onChange={setFilters}
        />
        <div className="no-print ml-auto flex items-center gap-2">
          {activeTab === "articles" ? (
            <Button variant="outline" size="sm" asChild>
              <a
                href={`/api/analytics/articles/export?${queryStr}`}
                download
              >
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </a>
            </Button>
          ) : null}
          {activeTab === "writers" ? (
            <Button variant="outline" size="sm" asChild>
              <a href={`/api/analytics/writers/export?${queryStr}`} download>
                <Download className="h-3.5 w-3.5" />
                Export CSV
              </a>
            </Button>
          ) : null}
          {/* Print/PDF — uses the browser's print dialog. globals.css has
              `@media print` rules that hide chrome and reflow the tables. */}
          {(activeTab === "articles" || activeTab === "writers" || activeTab === "overview") ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.print()}
            >
              <FileText className="h-3.5 w-3.5" />
              Print / PDF
            </Button>
          ) : null}
          {isOperations ? (
            <Button size="sm" onClick={() => setRaptiveOpen(true)}>
              <Upload className="h-3.5 w-3.5" />
              Upload Raptive
            </Button>
          ) : null}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList>
          <TabsTrigger value="overview">
            <BarChart3 className="h-3.5 w-3.5" />
            Overview
          </TabsTrigger>
          <TabsTrigger value="articles">Articles</TabsTrigger>
          <TabsTrigger value="writers">Writers</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <AnalyticsOverviewTab query={queryStr} />
        </TabsContent>
        <TabsContent value="articles" className="mt-4">
          <AnalyticsArticlesTab query={queryStr} />
        </TabsContent>
        <TabsContent value="writers" className="mt-4">
          <AnalyticsWritersTab query={queryStr} />
        </TabsContent>
        <TabsContent value="trends" className="mt-4">
          <AnalyticsTrendsTab query={queryStr} />
        </TabsContent>
      </Tabs>

      <RaptiveUploadDialog
        open={raptiveOpen}
        onOpenChange={setRaptiveOpen}
        onCommitted={() => {
          // Force each tab to re-fetch by nudging the filter state
          setFilters((f) => ({ ...f }));
        }}
      />
    </div>
  );
}
