"use client";

import * as React from "react";
import { CheckCircle2, Clipboard, Loader2, RefreshCw, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { readApiError } from "@/lib/api/client";
import {
  analyzeSeoDocument,
  generateTitleCandidates,
  scoreTitle,
  type SeoFinding,
  type TitleGeneratorInput,
  type TitleScore,
} from "@/lib/seo/analysis";
import type { SeoWorkspaceData } from "@/lib/seo/wordpress";

export function SeoWorkspace({
  entryId,
  fallbackTitle,
  canApplyDashboardTitle,
  onApplied,
}: {
  entryId: string;
  fallbackTitle: string;
  canApplyDashboardTitle: boolean;
  onApplied: () => void;
}) {
  const [workspace, setWorkspace] = React.useState<SeoWorkspaceData | null>(null);
  const [title, setTitle] = React.useState(fallbackTitle);
  const [keyphrase, setKeyphrase] = React.useState("");
  const [metaDescription, setMetaDescription] = React.useState("");
  const [articleType, setArticleType] = React.useState<NonNullable<TitleGeneratorInput["articleType"]>>("fantasy");
  const [players, setPlayers] = React.useState("");
  const [week, setWeek] = React.useState("");
  const [date, setDate] = React.useState("");
  const [listSize, setListSize] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [applying, setApplying] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/entries/${entryId}/seo`, { signal });
      if (!response.ok) throw new Error(await readApiError(response, "SEO data unavailable"));
      const data = (await response.json()) as { workspace: SeoWorkspaceData };
      setWorkspace(data.workspace);
      setTitle(data.workspace.title);
      setKeyphrase(data.workspace.focusKeyphrase);
      setMetaDescription(data.workspace.metaDescription);
    } catch (loadError) {
      if ((loadError as { name?: string }).name !== "AbortError") {
        setError(loadError instanceof Error ? loadError.message : "SEO data unavailable");
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [entryId]);

  React.useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const titleScore = React.useMemo(
    () => scoreTitle(title, keyphrase),
    [title, keyphrase],
  );
  const findings = React.useMemo<SeoFinding[]>(
    () => workspace
      ? analyzeSeoDocument({
          title,
          contentText: workspace.contentText,
          headings: workspace.headings,
          focusKeyphrase: keyphrase,
          metaDescription,
          slug: workspace.slug,
          imageAlts: workspace.imageAlts,
          paragraphWordCounts: workspace.paragraphWordCounts,
        })
      : [],
    [workspace, title, keyphrase, metaDescription],
  );
  const candidates = React.useMemo<TitleScore[]>(
    () => generateTitleCandidates({
      keyword: keyphrase || title,
      articleType,
      players: players.split(","),
      week,
      date,
      listSize,
    }),
    [title, keyphrase, articleType, players, week, date, listSize],
  );

  const prioritizedFindings = React.useMemo(
    () => findings.filter((finding) => finding.status !== "good").slice(0, 5),
    [findings],
  );

  async function applyTitle() {
    if (!window.confirm(`Use “${title}” as the dashboard title? WordPress content will not be changed.`)) return;
    setApplying(true);
    setError(null);
    try {
      const response = await fetch(`/api/entries/${entryId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      if (!response.ok) throw new Error(await readApiError(response, "Title was not applied"));
      onApplied();
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : "Title was not applied");
    } finally {
      setApplying(false);
    }
  }

  if (loading && !workspace) {
    return <div className="flex min-h-48 items-center justify-center"><Loader2 className="h-4 w-4 animate-spin" /></div>;
  }
  if (error && !workspace) {
    return (
      <div className="rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
        <p>{error}</p>
        <Button variant="outline" size="sm" className="mt-3" onClick={() => void load()}><RefreshCw className="h-3.5 w-3.5" />Retry</Button>
      </div>
    );
  }
  if (!workspace) return null;

  return (
    <div className="space-y-5">
      <section className="rounded-md border border-border bg-card p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold text-text-cell">Pitcher List title studio</h3>
            <p className="mt-1 text-xs text-text-team">One title field, deterministic scoring, and no duplicate data entry.</p>
          </div>
          <Badge variant={titleScore.total >= 75 ? "cyan" : "amber"} className="font-data">{titleScore.total}/100</Badge>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_2fr]">
          <div className="space-y-1.5">
            <Label htmlFor="seo-keyphrase">Focus keyphrase</Label>
            <Input id="seo-keyphrase" value={keyphrase} onChange={(event) => setKeyphrase(event.target.value)} placeholder="Fantasy baseball rankings" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="seo-title">Proposed title</Label>
            <Input id="seo-title" value={title} onChange={(event) => setTitle(event.target.value)} />
          </div>
        </div>
        <div className="mt-3 rounded-sm border border-border bg-surface-3/40 p-3">
          <p className="font-data text-xs text-text-zero">Google preview · {titleScore.fullPixelWidth}px including {titleScore.suffix.trim()}</p>
          <p className="mt-1 text-base text-cyan">{title}{titleScore.suffix}</p>
          <p className="mt-1 text-xs text-text-team">{metaDescription || "Add a useful meta description in WordPress."}</p>
        </div>
        <div className="mt-3 rounded-sm border border-border p-3 text-xs">
          <div className="flex items-center justify-between gap-2"><span className="text-text-zero">WordPress meta description · {metaDescription.length}/160</span><Button variant="ghost" size="sm" onClick={() => void navigator.clipboard.writeText(metaDescription)}><Clipboard className="h-3.5 w-3.5" />Copy</Button></div>
          <p className="mt-2 text-text-cell">{metaDescription || "No meta description reported by WordPress."}</p>
        </div>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {titleScore.categories.map((category) => (
            <li key={category.label} className="rounded-sm border border-border px-2 py-2 text-xs">
              <div className="flex justify-between gap-2"><span className="text-text-cell">{category.label}</span><span className="font-data text-text-zero">{category.score}/{category.max}</span></div>
              <p className="mt-1 text-[10px] text-text-zero">{category.explanation}</p>
            </li>
          ))}
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => void navigator.clipboard.writeText(title)}><Clipboard className="h-3.5 w-3.5" />Copy</Button>
          {canApplyDashboardTitle ? <Button size="sm" onClick={() => void applyTitle()} disabled={applying || title.trim().length < 10}>{applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}Apply to dashboard title</Button> : <Badge variant="outline">View only</Badge>}
        </div>
        {error ? <p className="mt-3 text-xs text-destructive">{error}</p> : null}
      </section>

      <section className="rounded-md border border-border bg-card p-4">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-text-cell"><Search className="h-4 w-4" />Ranked title ideas</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <label className="space-y-1 text-xs text-text-zero">Article type<select className="h-9 w-full rounded-md border border-border bg-surface-3 px-2 text-text-cell" value={articleType} onChange={(event) => setArticleType(event.target.value as typeof articleType)}><optgroup label="Columns / Series"><option value="goingdeep">Going Deep</option><option value="hitterrecap">Hitter Recap</option><option value="morningnews">MLB Morning News</option><option value="plvweekly">PLV Weekly</option><option value="seams">Across the Seams</option><option value="welovebaseball">We Love Baseball</option></optgroup><optgroup label="General"><option value="fantasy">Fantasy</option><option value="dynasty">Dynasty</option><option value="baseball">Baseball</option><option value="other">Other</option></optgroup></select></label>
          <label className="space-y-1 text-xs text-text-zero">Players<Input value={players} onChange={(event) => setPlayers(event.target.value)} placeholder="Name, Name" /></label>
          <label className="space-y-1 text-xs text-text-zero">Week<Input value={week} onChange={(event) => setWeek(event.target.value)} placeholder="15" /></label>
          <label className="space-y-1 text-xs text-text-zero">Date<Input value={date} onChange={(event) => setDate(event.target.value)} placeholder="7/5/26" /></label>
          <label className="space-y-1 text-xs text-text-zero">List size<Input value={listSize} onChange={(event) => setListSize(event.target.value)} placeholder="10" /></label>
        </div>
        <ol className="mt-3 space-y-2">
          {candidates.slice(0, 5).map((candidate, index) => (
            <li key={candidate.title} className="flex flex-wrap items-center gap-2 rounded-sm border border-border p-2 text-xs">
              <span className="font-data text-text-zero">#{index + 1}</span><span className="mr-auto text-text-cell">{candidate.title}</span><span className="font-data text-text-zero">{candidate.total}/100 · {candidate.fullPixelWidth}px</span><Button variant="ghost" size="sm" onClick={() => setTitle(candidate.title)}>Use</Button>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-md border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-text-cell">Pitcher List analysis</h3>
          <p className="mt-1 text-xs text-text-team">Independent, explainable checks—not a Yoast score.</p>
          <ul className="mt-3 space-y-2">
            {(prioritizedFindings.length > 0 ? prioritizedFindings : findings.slice(0, 3)).map((finding) => (
              <li key={finding.key} className="rounded-sm border border-border p-2 text-xs"><div className="flex gap-2"><Badge variant={finding.status === "good" ? "cyan" : finding.status === "problem" ? "danger" : "amber"}>{finding.status}</Badge><span className="text-text-cell">{finding.label}</span></div><p className="mt-1 text-text-zero">{finding.detail}</p></li>
            ))}
          </ul>
        </div>
        <div className="rounded-md border border-border bg-card p-4">
          <h3 className="text-sm font-semibold text-text-cell">Yoast-reported values</h3>
          <p className="mt-1 text-xs text-text-team">Read from WordPress. This dashboard does not write Yoast or article content; copy values and paste them in WordPress when needed.</p>
          <dl className="mt-3 space-y-2 text-xs"><div><dt className="text-text-zero">Focus keyphrase</dt><dd className="text-text-cell">{workspace.yoast.focusKeyphrase || "Not reported"}</dd></div><div><dt className="text-text-zero">SEO title</dt><dd className="text-text-cell">{workspace.yoast.title || "Not reported"}</dd></div><div><dt className="text-text-zero">Meta description</dt><dd className="text-text-cell">{workspace.yoast.description || "Not reported"}</dd></div><div><dt className="text-text-zero">Canonical</dt><dd className="break-all text-text-cell">{workspace.yoast.canonical || "Not reported"}</dd></div></dl>
        </div>
      </section>

      <section className="rounded-md border border-border bg-card p-4">
        <h3 className="text-sm font-semibold text-text-cell">WordPress publication readiness</h3>
        <p className="mt-1 text-xs text-text-team">WordPress owns article content and publication metadata. These are read-only checks from the current revision.</p>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">{workspace.readiness.map((item) => <li key={item.label} className="rounded-sm border border-border p-2 text-xs"><div className="flex items-center gap-2"><Badge variant={item.ready ? "cyan" : "amber"}>{item.ready ? "ready" : "check"}</Badge><span className="text-text-cell">{item.label}</span></div><p className="mt-1 text-text-zero">{item.detail}</p></li>)}</ul>
      </section>
    </div>
  );
}
