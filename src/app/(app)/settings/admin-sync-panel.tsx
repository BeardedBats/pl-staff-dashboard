"use client";

import * as React from "react";
import {
  Check,
  Database,
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
};

type SyncState = {
  running: boolean;
  result: string | null;
  error: string | null;
};

const initialState: SyncState = { running: false, result: null, error: null };

export function AdminSyncPanel({ initialLastSync }: Props) {
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
