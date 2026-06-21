"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import {
  BarChart3,
  Calendar as CalendarIcon,
  Check,
  History,
  Link2,
  Loader2,
  Plug,
  RefreshCcw,
  TriangleAlert,
  Unlink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import type { Ga4Status } from "@/lib/analytics/ga4";
import type { RaptiveUploadHistoryRow } from "@/lib/analytics/raptive";

type Props = {
  initialGa4Status: Ga4Status;
  initialUploads: RaptiveUploadHistoryRow[];
  canConnectGa4: boolean;
};

export function AdminAnalyticsPanel({
  initialGa4Status,
  initialUploads,
  canConnectGa4,
}: Props) {
  const searchParams = useSearchParams();
  const ga4Flag = searchParams.get("ga4");
  const [status, setStatus] = React.useState(initialGa4Status);
  const [uploads, setUploads] = React.useState(initialUploads);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [flash, setFlash] = React.useState<
    { kind: "success" | "error"; message: string } | null
  >(null);

  // Surface GA4 OAuth result from the callback redirect
  React.useEffect(() => {
    if (!ga4Flag) return;
    if (ga4Flag === "connected") {
      setFlash({ kind: "success", message: "GA4 connected successfully." });
      void refreshStatus();
    } else if (ga4Flag.startsWith("error:")) {
      setFlash({
        kind: "error",
        message: `GA4 connection failed: ${decodeURIComponent(ga4Flag.slice(6))}`,
      });
    }
  }, [ga4Flag]);

  async function refreshStatus() {
    try {
      const res = await fetch("/api/ga4/status");
      const data = (await res.json()) as { status?: Ga4Status };
      if (data.status) setStatus(data.status);
    } catch {
      // ignore
    }
  }

  async function refreshUploads() {
    try {
      const res = await fetch("/api/raptive/uploads");
      const data = (await res.json()) as { uploads?: RaptiveUploadHistoryRow[] };
      if (data.uploads) setUploads(data.uploads);
    } catch {
      // ignore
    }
  }

  async function handleConnect() {
    setBusy("connect");
    setFlash(null);
    try {
      const res = await fetch("/api/ga4/connect", { method: "POST" });
      const data = (await res.json()) as { url?: string; error?: string };
      if (!res.ok || !data.url) {
        setFlash({
          kind: "error",
          message: data.error ?? "Failed to start OAuth",
        });
        return;
      }
      window.location.href = data.url;
    } finally {
      setBusy(null);
    }
  }

  async function handleDisconnect() {
    if (!window.confirm("Disconnect GA4? You'll need to re-authorise to resume sync.")) {
      return;
    }
    setBusy("disconnect");
    try {
      await fetch("/api/ga4/disconnect", { method: "POST" });
      await refreshStatus();
      setFlash({ kind: "success", message: "GA4 disconnected." });
    } finally {
      setBusy(null);
    }
  }

  async function handleSync() {
    setBusy("sync");
    setFlash(null);
    try {
      const res = await fetch("/api/ga4/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = (await res.json()) as {
        rowsUpserted?: number;
        matchedArticles?: number;
        error?: string;
      };
      if (!res.ok) {
        setFlash({ kind: "error", message: data.error ?? "Sync failed" });
        return;
      }
      setFlash({
        kind: "success",
        message: `Synced — ${data.rowsUpserted ?? 0} rows across ${data.matchedArticles ?? 0} articles.`,
      });
      await refreshStatus();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {flash ? (
        <div
          className={
            flash.kind === "success"
              ? "flex items-center gap-2 rounded-md border border-cyan/40 bg-cyan-dim/40 px-3 py-2 text-xs text-cyan"
              : "flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          }
        >
          {flash.kind === "success" ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <TriangleAlert className="h-3.5 w-3.5" />
          )}
          {flash.message}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            Google Analytics 4
          </CardTitle>
          <CardDescription>
            Grants the dashboard read-only access to your GA4 property. The
            nightly cron upserts pagePath pageviews into article_analytics.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            <dt className="text-text-zero">Configured</dt>
            <dd>
              {status.configured ? (
                <Badge variant="outline" className="border-cyan/40 text-cyan">
                  Yes
                </Badge>
              ) : (
                <Badge variant="outline" className="border-amber/40 text-amber">
                  Missing env vars
                </Badge>
              )}
            </dd>
            <dt className="text-text-zero">Connected</dt>
            <dd>
              {status.connected ? (
                <Badge variant="outline" className="border-cyan/40 text-cyan">
                  Yes
                </Badge>
              ) : (
                <Badge variant="outline">No</Badge>
              )}
            </dd>
            <dt className="text-text-zero">Property ID</dt>
            <dd className="text-text-cell">
              {status.propertyId ?? <span className="text-text-zero">—</span>}
            </dd>
            <dt className="text-text-zero">Last synced</dt>
            <dd className="text-text-cell">
              {status.lastSyncedAt
                ? new Date(status.lastSyncedAt).toLocaleString()
                : <span className="text-text-zero">never</span>}
            </dd>
          </dl>

          {!status.configured ? (
            <p className="rounded-md border border-amber/40 bg-amber/5 p-2 text-xs text-amber">
              Set <code>GA4_CLIENT_ID</code>, <code>GA4_CLIENT_SECRET</code>,
              and <code>GA4_PROPERTY_ID</code> in your Vercel env, then
              redeploy to enable OAuth. The authorised redirect URI is{" "}
              <code>
                {typeof window !== "undefined"
                  ? `${window.location.origin}/api/ga4/callback`
                  : "/api/ga4/callback"}
              </code>
              .
            </p>
          ) : null}

          {canConnectGa4 ? (
            <div className="flex flex-wrap gap-2">
              {!status.connected ? (
                <Button
                  onClick={handleConnect}
                  disabled={!status.configured || busy === "connect"}
                >
                  {busy === "connect" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plug className="h-3.5 w-3.5" />
                  )}
                  Connect GA4
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    onClick={handleSync}
                    disabled={busy === "sync"}
                  >
                    {busy === "sync" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCcw className="h-3.5 w-3.5" />
                    )}
                    Sync yesterday
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleDisconnect}
                    disabled={busy === "disconnect"}
                  >
                    {busy === "disconnect" ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Unlink className="h-3.5 w-3.5" />
                    )}
                    Disconnect
                  </Button>
                </>
              )}
            </div>
          ) : (
            <p className="text-xs text-text-zero">
              Only Operations can connect or disconnect GA4.
            </p>
          )}

          {canConnectGa4 && status.connected ? (
            <Ga4BackfillSection
              setFlash={setFlash}
              onComplete={() => void refreshStatus()}
            />
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Link2 className="h-4 w-4" />
              Raptive upload history
            </CardTitle>
            <CardDescription>
              Last 50 imports. Re-uploading a period replaces existing rows
              for that date range.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refreshUploads()}
          >
            <RefreshCcw className="h-3.5 w-3.5" />
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {uploads.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={<Link2 className="h-5 w-5" />}
                title="No uploads yet"
                description="Head to Analytics → Upload Raptive to import your first sheet."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-card text-[10px] uppercase tracking-wide text-text-zero">
                  <tr className="border-b border-border">
                    <th className="px-3 py-2 text-left">File</th>
                    <th className="px-3 py-2 text-left">Range</th>
                    <th className="px-3 py-2 text-right">Rows</th>
                    <th className="px-3 py-2 text-left">Uploaded by</th>
                    <th className="px-3 py-2 text-left">When</th>
                  </tr>
                </thead>
                <tbody>
                  {uploads.map((u) => (
                    <tr key={u.id} className="border-b border-border/50">
                      <td className="px-3 py-2 font-medium text-text-cell">
                        {u.file_name}
                      </td>
                      <td className="px-3 py-2 text-[11px] text-text-team">
                        {u.date_range_start} → {u.date_range_end}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {u.rows_imported.toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-text-team">
                        {u.uploader_name}
                      </td>
                      <td className="px-3 py-2 text-[11px] text-text-zero">
                        {new Date(u.created_at).toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function yesterdayIso(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function Ga4BackfillSection({
  setFlash,
  onComplete,
}: {
  setFlash: (flash: { kind: "success" | "error"; message: string } | null) => void;
  onComplete: () => void;
}) {
  const [from, setFrom] = React.useState("2022-10-01");
  const [to, setTo] = React.useState(yesterdayIso);
  const [running, setRunning] = React.useState(false);
  const [result, setResult] = React.useState<{
    rowsUpserted: number;
    matchedArticles: number;
    dateFrom: string;
    dateTo: string;
    monthsProcessed: number;
    errors: string[];
  } | null>(null);

  async function handleBackfill() {
    setRunning(true);
    setResult(null);
    setFlash(null);
    try {
      const res = await fetch("/api/admin/ga4-backfill", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date_from: from, date_to: to }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        rowsUpserted?: number;
        matchedArticles?: number;
        dateFrom?: string;
        dateTo?: string;
        monthsProcessed?: number;
        errors?: string[];
        error?: string;
      };
      if (!res.ok) {
        setFlash({
          kind: "error",
          message: data.error ?? `Backfill failed (${res.status})`,
        });
        return;
      }
      const rows = data.rowsUpserted ?? 0;
      const articles = data.matchedArticles ?? 0;
      const months = data.monthsProcessed ?? 0;
      setResult({
        rowsUpserted: rows,
        matchedArticles: articles,
        dateFrom: data.dateFrom ?? from,
        dateTo: data.dateTo ?? to,
        monthsProcessed: months,
        errors: data.errors ?? [],
      });
      setFlash({
        kind: "success",
        message: `Backfill complete — ${rows.toLocaleString()} rows across ${articles.toLocaleString()} articles across ${months} months.`,
      });
      onComplete();
    } catch {
      setFlash({ kind: "error", message: "Network error" });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-border bg-surface-3/30 p-3">
      <div className="flex items-center gap-2">
        <History className="h-3.5 w-3.5 text-text-zero" />
        <p className="text-sm font-medium text-text-cell">
          Backfill GA4 data
        </p>
      </div>
      <p className="text-xs text-text-zero">
        Pulls pageviews and sessions for a date range. Pair this with the
        historical article import so GA4 rows have entries to match against.
      </p>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <label className="space-y-1">
          <span className="block font-mono text-[10px] uppercase tracking-wider text-text-zero">
            From
          </span>
          <div className="flex items-center gap-1 rounded-sm border border-border bg-surface-2 px-2 py-1">
            <CalendarIcon className="h-3 w-3 text-text-zero" />
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="flex-1 bg-transparent text-text-cell outline-none"
            />
          </div>
        </label>
        <label className="space-y-1">
          <span className="block font-mono text-[10px] uppercase tracking-wider text-text-zero">
            To
          </span>
          <div className="flex items-center gap-1 rounded-sm border border-border bg-surface-2 px-2 py-1">
            <CalendarIcon className="h-3 w-3 text-text-zero" />
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="flex-1 bg-transparent text-text-cell outline-none"
            />
          </div>
        </label>
      </div>
      <Button
        variant="outline"
        onClick={handleBackfill}
        disabled={running || !from || !to}
      >
        {running ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <RefreshCcw className="h-3.5 w-3.5" />
        )}
        Run backfill
      </Button>
      {result ? (
        <div className="space-y-1">
          <p className="text-xs text-text-team">
            {result.dateFrom} → {result.dateTo}:{" "}
            <span className="font-medium text-text-cell">
              {result.rowsUpserted.toLocaleString()}
            </span>{" "}
            rows upserted across{" "}
            <span className="font-medium text-text-cell">
              {result.matchedArticles.toLocaleString()}
            </span>{" "}
            articles across{" "}
            <span className="font-medium text-text-cell">
              {result.monthsProcessed}
            </span>{" "}
            months.
          </p>
          {result.errors.length > 0 ? (
            <div className="space-y-0.5">
              {result.errors.map((err, idx) => (
                <p key={idx} className="text-[11px] text-red">
                  {err}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
