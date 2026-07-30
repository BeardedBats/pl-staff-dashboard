"use client";

import * as React from "react";
import { Check, Loader2, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MAX_RAPTIVE_UPLOAD_BYTES } from "@/lib/analytics/raptive-contract";

type PreviewData = {
  fileName: string;
  fileSizeBytes: number;
  totalRows: number;
  dateRange: { start: string; end: string };
  matchedCount: number;
  unmatchedCount: number;
  sampleUnmatched: string[];
  totalEarnings: number;
  dataSheetCount: number;
  duplicateCount: number;
  rejectedCount: number;
  sampleRejected: Array<{ sheet: string; row: number; reason: string }>;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCommitted: () => void;
};

export function RaptiveUploadDialog({
  open,
  onOpenChange,
  onCommitted,
}: Props) {
  const [file, setFile] = React.useState<File | null>(null);
  const [preview, setPreview] = React.useState<PreviewData | null>(null);
  const [phase, setPhase] = React.useState<
    "idle" | "parsing" | "previewed" | "committing" | "done"
  >("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [dragging, setDragging] = React.useState(false);

  // Accept a dropped file the same way the file picker does. We don't bother
  // distinguishing between drag/drop and click — both end up setting `file`
  // and clearing the previous preview.
  function acceptFile(f: File) {
    // Validate by extension since dragged files sometimes lack a MIME type
    const name = f.name.toLowerCase();
    if (!name.endsWith(".xlsx")) {
      setError("Drop an .xlsx file");
      return;
    }
    if (f.size < 1 || f.size > MAX_RAPTIVE_UPLOAD_BYTES) {
      setError("Workbook must be between 1 byte and 10 MB");
      return;
    }
    setFile(f);
    setPreview(null);
    setPhase("idle");
    setError(null);
  }

  function reset() {
    setFile(null);
    setPreview(null);
    setPhase("idle");
    setError(null);
    setDragging(false);
  }

  React.useEffect(() => {
    if (!open) {
      // Wait for the close animation before reset
      const t = setTimeout(reset, 300);
      return () => clearTimeout(t);
    }
  }, [open]);

  async function handlePreview() {
    if (!file) return;
    setPhase("parsing");
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("mode", "preview");
      const res = await fetch("/api/raptive/upload", {
        method: "POST",
        body: form,
      });
      const data = (await res.json()) as {
        preview?: PreviewData;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Preview failed");
        setPhase("idle");
        return;
      }
      if (data.preview) {
        setPreview(data.preview);
        setPhase("previewed");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setPhase("idle");
    }
  }

  async function handleCommit() {
    if (!file) return;
    setPhase("committing");
    setError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("mode", "commit");
      const res = await fetch("/api/raptive/upload", {
        method: "POST",
        body: form,
      });
      const data = (await res.json()) as {
        preview?: PreviewData;
        inserted?: number;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Commit failed");
        setPhase("previewed");
        return;
      }
      setPhase("done");
      onCommitted();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
      setPhase("previewed");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload Raptive Excel</DialogTitle>
          <DialogDescription>
            Drop in a Raptive export (.xlsx). We&apos;ll parse it, match rows to
            entries by URL, and show a preview before you commit.
          </DialogDescription>
        </DialogHeader>

        {phase === "done" ? (
          <div className="flex flex-col items-center gap-2 py-6 text-center">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-dim text-cyan">
              <Check className="h-5 w-5" />
            </div>
            <p className="text-sm font-medium text-text-cell">
              Imported {preview?.totalRows.toLocaleString()} rows
            </p>
            <p className="text-xs text-text-zero">
              {preview?.matchedCount.toLocaleString()} matched to entries,{" "}
              {preview?.unmatchedCount.toLocaleString()} unmatched.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <label
              onDragEnter={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={(e) => {
                // Only flip off when we actually leave the target, not on
                // child-element transitions (relatedTarget gives us that).
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                  setDragging(false);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                const dropped = e.dataTransfer.files?.[0];
                if (dropped) acceptFile(dropped);
              }}
              className={
                dragging
                  ? "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-cyan bg-cyan-dim/40 py-8 text-center text-xs text-cyan transition-colors"
                  : "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed border-border bg-surface-3/20 py-6 text-center text-xs text-text-zero transition-colors hover:bg-surface-3/40"
              }
            >
              <Upload className="h-5 w-5" />
              {file ? (
                <span className="font-medium text-text-cell">{file.name}</span>
              ) : dragging ? (
                <span className="font-medium">Drop to upload</span>
              ) : (
                <span>Drop an .xlsx file here, or click to pick one</span>
              )}
              <input
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) acceptFile(f);
                }}
              />
            </label>

            {preview ? (
              <div className="rounded-md border border-border bg-card/60 p-3 text-xs">
                <div className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-text-zero">
                  Preview
                </div>
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <dt className="text-text-zero">Date range</dt>
                  <dd className="text-right text-text-cell">
                    {preview.dateRange.start} → {preview.dateRange.end}
                  </dd>
                  <dt className="text-text-zero">Total rows</dt>
                  <dd className="text-right text-text-cell">
                    {preview.totalRows.toLocaleString()}
                  </dd>
                  <dt className="text-text-zero">File size</dt>
                  <dd className="text-right text-text-cell">
                    {(preview.fileSizeBytes / (1024 * 1024)).toFixed(2)} MB
                  </dd>
                  <dt className="text-text-zero">Matched to entries</dt>
                  <dd className="text-right text-cyan">
                    {preview.matchedCount.toLocaleString()}
                  </dd>
                  <dt className="text-text-zero">Unmatched</dt>
                  <dd
                    className={
                      preview.unmatchedCount > 0
                        ? "text-right text-amber"
                        : "text-right text-text-cell"
                    }
                  >
                    {preview.unmatchedCount.toLocaleString()}
                  </dd>
                  <dt className="text-text-zero">Total earnings</dt>
                  <dd className="text-right font-medium text-amber">
                    ${preview.totalEarnings.toFixed(2)}
                  </dd>
                </dl>
                <div className="mt-3 border-t border-border/60 pt-2 text-[10px] text-text-zero">
                  Parsed {preview.dataSheetCount} data sheet
                  {preview.dataSheetCount === 1 ? "" : "s"}; collapsed{" "}
                  {preview.duplicateCount.toLocaleString()} exact duplicate
                  {preview.duplicateCount === 1 ? "" : "s"}; rejected{" "}
                  {preview.rejectedCount.toLocaleString()} malformed row
                  {preview.rejectedCount === 1 ? "" : "s"}.
                </div>
                {preview.sampleRejected.length > 0 ? (
                  <div className="mt-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-[10px]">
                    <p className="mb-1 font-semibold uppercase tracking-wide text-destructive">
                      Resolve rejected rows before committing
                    </p>
                    {preview.sampleRejected.slice(0, 5).map((row) => (
                      <p key={`${row.sheet}-${row.row}`}>
                        {row.sheet} row {row.row}: {row.reason}
                      </p>
                    ))}
                  </div>
                ) : null}
                {preview.sampleUnmatched.length > 0 ? (
                  <div className="mt-3 border-t border-border/60 pt-2">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-text-zero">
                      Sample unmatched URLs
                    </div>
                    <ul className="space-y-0.5">
                      {preview.sampleUnmatched.slice(0, 5).map((u) => (
                        <li
                          key={u}
                          className="break-words text-[10px] text-text-zero"
                          title={u}
                        >
                          {u}
                        </li>
                      ))}
                    </ul>
                    <p className="mt-1 text-[10px] text-text-zero">
                      Unmatched rows still import — they just have no entry
                      linked. Usually means the URL changed or the article was
                      archived.
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}

            {error ? (
              <p
                className="flex items-center gap-1 text-xs text-destructive"
                role="alert"
              >
                <X className="h-3 w-3" />
                {error}
              </p>
            ) : null}
          </div>
        )}

        <DialogFooter>
          {phase === "done" ? (
            <Button onClick={() => onOpenChange(false)}>Close</Button>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={phase === "parsing" || phase === "committing"}
              >
                Cancel
              </Button>
              {preview ? (
                <Button
                  onClick={handleCommit}
                  disabled={phase === "committing" || preview.rejectedCount > 0}
                >
                  {phase === "committing" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Check className="h-3.5 w-3.5" />
                  )}
                  Commit import
                </Button>
              ) : (
                <Button
                  onClick={handlePreview}
                  disabled={!file || phase === "parsing"}
                >
                  {phase === "parsing" ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Upload className="h-3.5 w-3.5" />
                  )}
                  Preview
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
