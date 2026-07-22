"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  FileText,
  ImageIcon,
  Loader2,
  Search,
  UserRound,
  UsersRound,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type {
  DashboardSearchKind,
  DashboardSearchResponse,
  DashboardSearchResult,
} from "@/lib/search/types";

const kindPresentation = {
  entry: { label: "Content", icon: FileText },
  staff: { label: "Staff", icon: UserRound },
  assignment: { label: "Assignments", icon: UsersRound },
  graphic: { label: "Graphics", icon: ImageIcon },
  schedule: { label: "Schedule", icon: CalendarClock },
} satisfies Record<DashboardSearchKind, { label: string; icon: typeof Search }>;

function isEditableTarget(target: EventTarget | null) {
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    (target instanceof HTMLElement && target.isContentEditable)
  );
}

export function GlobalSearch() {
  const router = useRouter();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const resultRefs = React.useRef<Array<HTMLButtonElement | null>>([]);
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [response, setResponse] = React.useState<DashboardSearchResponse | null>(
    null,
  );
  const [status, setStatus] = React.useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [attempt, setAttempt] = React.useState(0);

  React.useEffect(() => {
    function openShortcut(event: KeyboardEvent) {
      if (
        (event.key === "/" && !isEditableTarget(event.target)) ||
        ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k")
      ) {
        event.preventDefault();
        setOpen(true);
      }
    }

    window.addEventListener("keydown", openShortcut);
    return () => window.removeEventListener("keydown", openShortcut);
  }, []);

  React.useEffect(() => {
    const normalized = query.trim();
    if (!open || normalized.length < 2) {
      setStatus("idle");
      setResponse(null);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setStatus("loading");
      try {
        const result = await fetch(
          `/api/search?q=${encodeURIComponent(normalized)}&limit=5`,
          { signal: controller.signal },
        );
        if (!result.ok) throw new Error("Search request failed");
        setResponse((await result.json()) as DashboardSearchResponse);
        setStatus("ready");
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setStatus("error");
      }
    }, 180);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [attempt, open, query]);

  function choose(result: DashboardSearchResult) {
    setOpen(false);
    setQuery("");
    router.push(result.href);
  }

  function focusResult(index: number) {
    const count = response?.results.length ?? 0;
    if (count === 0) return;
    const wrapped = (index + count) % count;
    resultRefs.current[wrapped]?.focus();
  }

  const grouped = React.useMemo(() => {
    const groups = new Map<DashboardSearchKind, DashboardSearchResult[]>();
    for (const result of response?.results ?? []) {
      groups.set(result.kind, [...(groups.get(result.kind) ?? []), result]);
    }
    return groups;
  }, [response]);

  let flatIndex = -1;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button
        variant="outline"
        size="sm"
        aria-label="Search dashboard"
        data-tour="global-search"
        onClick={() => setOpen(true)}
        className="h-9 gap-2 px-2 sm:min-w-48 sm:justify-between sm:px-3"
      >
        <span className="flex items-center gap-2">
          <Search className="h-4 w-4" aria-hidden="true" />
          <span className="hidden sm:inline">Search</span>
        </span>
        <kbd className="hidden rounded border border-border bg-surface-3 px-1.5 py-0.5 font-data text-[10px] text-text-zero lg:inline">
          Ctrl K
        </kbd>
      </Button>

      <DialogContent
        className="max-h-[80vh] max-w-2xl overflow-hidden p-0"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          inputRef.current?.focus();
        }}
      >
        <DialogHeader className="border-b border-border px-5 pb-4 pt-5">
          <DialogTitle>Search the dashboard</DialogTitle>
          <DialogDescription>
            Find staff, content, assignments, graphic requests, and scheduled work.
          </DialogDescription>
          <div className="relative pt-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 mt-1 h-4 w-4 -translate-y-1/2 text-text-zero" />
            <Input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  focusResult(0);
                }
              }}
              aria-label="Search staff, content, assignments, graphics, and schedules"
              aria-describedby="global-search-status"
              placeholder="Type at least 2 characters…"
              className="h-11 pl-9"
            />
          </div>
        </DialogHeader>

        <div className="min-h-44 overflow-y-auto px-3 py-3" aria-live="polite">
          <p id="global-search-status" className="sr-only">
            {status === "loading"
              ? "Searching"
              : status === "ready"
                ? `${response?.results.length ?? 0} results`
                : status === "error"
                  ? "Search unavailable"
                  : "Enter at least 2 characters"}
          </p>

          {status === "idle" ? (
            <EmptyState
              icon={<Search className="h-5 w-5" />}
              title="Search across your work"
              description="Enter a name or title. Press / or Ctrl K anytime to return here."
            />
          ) : null}

          {status === "loading" ? (
            <div className="flex min-h-36 items-center justify-center gap-2 text-sm text-text-team">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Searching…
            </div>
          ) : null}

          {status === "error" ? (
            <Alert variant="error">
              <AlertTitle>Search is temporarily unavailable</AlertTitle>
              <AlertDescription className="mt-2 flex items-center justify-between gap-3">
                <span>Your dashboard data was not changed.</span>
                <Button size="sm" variant="outline" onClick={() => setAttempt((n) => n + 1)}>
                  Try again
                </Button>
              </AlertDescription>
            </Alert>
          ) : null}

          {status === "ready" && response?.partial ? (
            <Alert className="mb-3">
              <AlertTitle>Some results are still unavailable</AlertTitle>
              <AlertDescription>
                Available sources are shown below. Retry to include the missing source.
              </AlertDescription>
            </Alert>
          ) : null}

          {status === "ready" && response?.results.length === 0 ? (
            <EmptyState
              icon={<Search className="h-5 w-5" />}
              title={`No results for “${response.query}”`}
              description="Try a staff name, article title, or graphic-request title."
            />
          ) : null}

          {status === "ready" && response && response.results.length > 0 ? (
            <div className="space-y-4">
              {Array.from(grouped.entries()).map(([kind, results]) => {
                const presentation = kindPresentation[kind];
                const Icon = presentation.icon;
                return (
                  <section key={kind} aria-labelledby={`search-group-${kind}`}>
                    <h3
                      id={`search-group-${kind}`}
                      className="mb-1 flex items-center gap-2 px-2 text-xs font-semibold uppercase tracking-wide text-text-zero"
                    >
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                      {presentation.label}
                    </h3>
                    <ul className="space-y-1">
                      {results.map((result) => {
                        flatIndex += 1;
                        const currentIndex = flatIndex;
                        return (
                          <li key={`${result.kind}:${result.id}`}>
                            <button
                              ref={(element) => {
                                resultRefs.current[currentIndex] = element;
                              }}
                              type="button"
                              onClick={() => choose(result)}
                              onKeyDown={(event) => {
                                if (event.key === "ArrowDown") {
                                  event.preventDefault();
                                  focusResult(currentIndex + 1);
                                } else if (event.key === "ArrowUp") {
                                  event.preventDefault();
                                  if (currentIndex === 0) inputRef.current?.focus();
                                  else focusResult(currentIndex - 1);
                                }
                              }}
                              className={cn(
                                "w-full rounded-md border border-transparent px-3 py-2 text-left",
                                "hover:border-border hover:bg-surface-3/40 focus-visible:border-cyan focus-visible:bg-surface-3/40 focus-visible:outline-none",
                              )}
                            >
                              <span className="block text-sm font-medium text-text-cell">
                                {result.title}
                              </span>
                              <span className="mt-0.5 block text-xs text-text-team">
                                {result.context}
                              </span>
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })}
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
