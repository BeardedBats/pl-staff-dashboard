"use client";

import * as React from "react";
import {
  Check,
  Database,
  History,
  Image as ImageIcon,
  Loader2,
  RefreshCw,
  UserCog,
  X,
} from "lucide-react";
import { formatDate } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

type Props = {
  initialLastSync: {
    pl: string | null;
    qb: string | null;
  };
  /** Operations-only — gates the historical import section. */
  canRunHistoricalImport?: boolean;
};

type SyncState = {
  running: boolean;
  result: string | null;
  error: string | null;
};

type ImportSite = "pl" | "qb" | "both";

type ImportSiteReport = {
  site: string;
  postsFound: number;
  postsImported: number;
  postsSkipped: number;
  authorsMatched: number;
  authorsUnmatched: number;
  categoriesMatched: number;
  errors: string[];
};

type ImportResponse = {
  ok: boolean;
  dryRun: boolean;
  site: ImportSite;
  note: string | null;
  reports: ImportSiteReport[];
  totals: {
    postsFound: number;
    postsImported: number;
    postsSkipped: number;
    authorsMatched: number;
    authorsUnmatched: number;
    categoriesMatched: number;
    errors: string[];
  };
};

const initialState: SyncState = { running: false, result: null, error: null };

export function AdminSyncPanel({
  initialLastSync,
  canRunHistoricalImport = false,
}: Props) {
  const [posts, setPosts] = React.useState<SyncState>(initialState);
  const [categories, setCategories] = React.useState<SyncState>(initialState);
  const [profiles, setProfiles] = React.useState<SyncState>(initialState);
  const [lastSync, setLastSync] = React.useState(initialLastSync);

  async function runSync(
    key: "posts" | "categories" | "profiles",
    endpoint: string,
    renderResult: (data: unknown) => string,
  ) {
    const setter =
      key === "posts" ? setPosts : key === "categories" ? setCategories : setProfiles;
    setter({ running: true, result: null, error: null });
    try {
      const res = await fetch(endpoint, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setter({
          running: false,
          result: null,
          error:
            (data as { error?: string }).error ?? `Sync failed (${res.status})`,
        });
        return;
      }
      setter({ running: false, result: renderResult(data), error: null });
      // Refresh last-sync timestamps from the server after a posts sync.
      if (key === "posts") {
        const fresh = await fetch("/api/settings/wp-sync-status").then((r) =>
          r.json(),
        );
        setLastSync(fresh.lastSync);
      }
    } catch {
      setter({ running: false, result: null, error: "Network error" });
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Database className="h-4 w-4" />
            WordPress post sync
          </CardTitle>
          <CardDescription>
            Polls both Pitcher List and QB List every 5 minutes. Refreshes
            status on existing entries and auto-creates entries for drafts
            that writers start directly in wp-admin.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2">
            <LastSyncRow site="PL" timestamp={lastSync.pl} />
            <LastSyncRow site="QB" timestamp={lastSync.qb} />
          </div>

          <SyncButton
            label="Sync WP posts now"
            state={posts}
            onClick={() =>
              runSync("posts", "/api/cron/wp-sync", (data) => {
                const reports = (data as {
                  reports: Array<{
                    site: string;
                    postsFetched: number;
                    entriesUpdated: number;
                    draftedEntriesCreated: number;
                    skippedNoMatchingUser: number;
                    errors: Array<unknown>;
                  }>;
                }).reports;
                return reports
                  .map(
                    (r) =>
                      `${r.site.toUpperCase()}: fetched ${r.postsFetched} · updated ${r.entriesUpdated} · drafted ${r.draftedEntriesCreated} · skipped ${r.skippedNoMatchingUser} · errors ${r.errors.length}`,
                  )
                  .join(" · ");
              })
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <ImageIcon className="h-4 w-4" />
            WordPress categories
          </CardTitle>
          <CardDescription>
            Pulls your PL + QB WordPress categories into the dashboard so the
            Create Entry form can pick from them. Runs weekly automatically;
            use the button if you just added or renamed one.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <SyncButton
            label="Sync categories now"
            state={categories}
            onClick={() =>
              runSync(
                "categories",
                "/api/cron/category-sync",
                (data) => {
                  const reports = (data as {
                    reports: Array<{
                      site: string;
                      fetched: number;
                      created: number;
                      updated: number;
                      deactivated: number;
                    }>;
                  }).reports;
                  return reports
                    .map(
                      (r) =>
                        `${r.site.toUpperCase()}: fetched ${r.fetched} · created ${r.created} · updated ${r.updated} · deactivated ${r.deactivated}`,
                    )
                    .join(" · ");
                },
              )
            }
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <UserCog className="h-4 w-4" />
            Profile sync
          </CardTitle>
          <CardDescription>
            Refreshes each staff member&apos;s display name, bio, and gravatar
            from their WordPress profile. Runs every 6 hours. Also runs on
            login for the user who&apos;s signing in.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <SyncButton
            label="Sync profiles now"
            state={profiles}
            onClick={() =>
              runSync(
                "profiles",
                "/api/cron/profile-sync",
                (data) => {
                  const report = (data as {
                    report: {
                      usersChecked: number;
                      usersUpdated: number;
                      unchanged: number;
                      notFound: number;
                      errors: Array<unknown>;
                    };
                  }).report;
                  return `Checked ${report.usersChecked} · updated ${report.usersUpdated} · unchanged ${report.unchanged} · not found ${report.notFound} · errors ${report.errors.length}`;
                },
              )
            }
          />
        </CardContent>
      </Card>

      {canRunHistoricalImport ? <HistoricalImportSection /> : null}
    </div>
  );
}

function HistoricalImportSection() {
  const [site, setSite] = React.useState<ImportSite>("pl");
  const [dryRunFirst, setDryRunFirst] = React.useState(true);
  const [running, setRunning] = React.useState(false);
  const [response, setResponse] = React.useState<ImportResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function runImport(dryRun: boolean) {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/historical-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ site, dry_run: dryRun }),
      });
      const data = (await res.json().catch(() => ({}))) as Partial<ImportResponse> & {
        error?: string;
      };
      if (!res.ok || data.ok === false) {
        setError(data.error ?? `Import failed (${res.status})`);
        setResponse(null);
        return;
      }
      setResponse(data as ImportResponse);
    } catch {
      setError("Network error");
    } finally {
      setRunning(false);
    }
  }

  async function handleRunClick() {
    if (dryRunFirst) {
      await runImport(true);
      return;
    }
    const confirmed = window.confirm(
      "This will import up to several thousand entries. Continue?",
    );
    if (!confirmed) return;
    await runImport(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <History className="h-4 w-4" />
          Historical article import
        </CardTitle>
        <CardDescription>
          One-time import of all published articles from October 2022 onward.
          Safe to re-run — existing entries are skipped. Historical entries
          stay out of the active pipeline but are visible to analytics.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
            Site
          </p>
          <div className="flex flex-col gap-1.5 text-sm">
            <SiteRadio
              label="Pitcher List only"
              value="pl"
              selected={site}
              onChange={setSite}
            />
            <SiteRadio
              label="QB List only"
              value="qb"
              selected={site}
              onChange={setSite}
            />
            <SiteRadio
              label="Both sites"
              value="both"
              selected={site}
              onChange={setSite}
            />
          </div>
        </div>

        <label className="flex items-center gap-2 text-xs text-text-secondary">
          <input
            type="checkbox"
            checked={dryRunFirst}
            onChange={(e) => setDryRunFirst(e.target.checked)}
            className="h-3.5 w-3.5"
          />
          <span>Dry run first (count posts without writing)</span>
        </label>

        <Button onClick={handleRunClick} disabled={running}>
          {running ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {dryRunFirst ? "Run dry run" : "Run import"}
        </Button>

        {error ? (
          <p className="flex items-start gap-1.5 rounded-sm border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            <X className="mt-0.5 h-3 w-3 shrink-0" />
            {error}
          </p>
        ) : null}

        {response ? <ImportResults response={response} /> : null}
      </CardContent>
    </Card>
  );
}

function SiteRadio({
  label,
  value,
  selected,
  onChange,
}: {
  label: string;
  value: ImportSite;
  selected: ImportSite;
  onChange: (v: ImportSite) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2">
      <input
        type="radio"
        name="historical-site"
        value={value}
        checked={selected === value}
        onChange={() => onChange(value)}
        className="h-3.5 w-3.5"
      />
      <span>{label}</span>
    </label>
  );
}

function ImportResults({ response }: { response: ImportResponse }) {
  const { totals, reports, dryRun, note } = response;
  return (
    <div className="space-y-3 rounded-md border border-cyan/30 bg-cyan-dim/40 p-3 text-xs">
      <p className="flex items-center gap-1.5 font-medium text-cyan">
        <Check className="h-3 w-3" />
        {dryRun ? "Dry run complete" : "Import complete"}
      </p>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-text-secondary">
        <dt>Posts found</dt>
        <dd className="tabular-nums text-text-primary">{totals.postsFound}</dd>
        <dt>Posts imported</dt>
        <dd className="tabular-nums text-text-primary">{totals.postsImported}</dd>
        <dt>Posts skipped (already imported)</dt>
        <dd className="tabular-nums text-text-primary">{totals.postsSkipped}</dd>
        <dt>Authors matched</dt>
        <dd className="tabular-nums text-text-primary">{totals.authorsMatched}</dd>
        <dt>Authors unmatched</dt>
        <dd className="tabular-nums text-text-primary">{totals.authorsUnmatched}</dd>
        <dt>Categories matched</dt>
        <dd className="tabular-nums text-text-primary">{totals.categoriesMatched}</dd>
      </dl>

      {reports.length > 1 ? (
        <div className="space-y-1 border-t border-cyan/20 pt-2">
          <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
            By site
          </p>
          {reports.map((r) => (
            <p key={r.site} className="text-text-secondary">
              <span className="font-medium text-text-primary">
                {r.site.toUpperCase()}:
              </span>{" "}
              found {r.postsFound} · imported {r.postsImported} · skipped{" "}
              {r.postsSkipped} · unmatched authors {r.authorsUnmatched} · errors{" "}
              {r.errors.length}
            </p>
          ))}
        </div>
      ) : null}

      {note ? <p className="text-text-muted">{note}</p> : null}

      {totals.errors.length > 0 ? (
        <details className="border-t border-cyan/20 pt-2">
          <summary className="cursor-pointer font-mono text-[10px] uppercase tracking-wider text-amber">
            {totals.errors.length} error{totals.errors.length === 1 ? "" : "s"}
          </summary>
          <ul className="mt-1 space-y-0.5 text-amber">
            {totals.errors.slice(0, 50).map((err, idx) => (
              <li key={idx}>{err}</li>
            ))}
            {totals.errors.length > 50 ? (
              <li className="text-text-muted">
                …{totals.errors.length - 50} more
              </li>
            ) : null}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

function LastSyncRow({
  site,
  timestamp,
}: {
  site: string;
  timestamp: string | null;
}) {
  return (
    <div className="rounded-md border border-border bg-navy-3/30 p-3">
      <p className="font-mono text-[10px] uppercase tracking-wider text-text-muted">
        Last {site} sync
      </p>
      <p className="mt-1 text-sm text-text-primary">
        {timestamp
          ? formatDate(timestamp, { dateStyle: "medium", timeStyle: "short" })
          : "Never"}
      </p>
    </div>
  );
}

function SyncButton({
  label,
  state,
  onClick,
}: {
  label: string;
  state: SyncState;
  onClick: () => void;
}) {
  return (
    <div className="space-y-2">
      <Button onClick={onClick} disabled={state.running}>
        {state.running ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5" />
        )}
        {label}
      </Button>
      {state.result ? (
        <p className="flex items-start gap-1.5 rounded-sm border border-cyan/30 bg-cyan-dim px-3 py-2 text-xs text-cyan">
          <Check className="mt-0.5 h-3 w-3 shrink-0" />
          {state.result}
        </p>
      ) : null}
      {state.error ? (
        <p className="flex items-start gap-1.5 rounded-sm border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          <X className="mt-0.5 h-3 w-3 shrink-0" />
          {state.error}
        </p>
      ) : null}
    </div>
  );
}
