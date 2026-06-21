"use client";

import * as React from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  entryId: string;
  onCreated: (requestId: string) => void;
};

export function CreateGraphicRequestDialog({
  open,
  onOpenChange,
  entryId,
  onCreated,
}: Props) {
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [urgencyInput, setUrgencyInput] = React.useState(""); // datetime-local
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setTitle("");
      setDescription("");
      setUrgencyInput("");
      setError(null);
    }
  }, [open]);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) {
      setError("Title is required");
      return;
    }

    setSaving(true);
    setError(null);

    let urgencyIso: string | null = null;
    if (urgencyInput) {
      const parsed = new Date(urgencyInput);
      if (!Number.isNaN(parsed.getTime())) {
        urgencyIso = parsed.toISOString();
      }
    }

    try {
      const res = await fetch("/api/graphic-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entry_id: entryId,
          title: title.trim(),
          description: description.trim() || undefined,
          urgency_date: urgencyIso,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        id?: string;
        error?: string;
      };
      if (!res.ok || !data.id) {
        setError(data.error ?? "Create failed");
        setSaving(false);
        return;
      }
      onCreated(data.id);
      setSaving(false);
    } catch {
      setError("Network error");
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request a graphic</DialogTitle>
          <DialogDescription>
            Add a new graphic request for this entry. The graphics team will
            see it in the Graphic Requests queue and can claim it.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="graphic-title">Title *</Label>
            <Input
              id="graphic-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Vladdy PLV heatmap, rotation header image"
              autoFocus
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="graphic-description">Description</Label>
            <Textarea
              id="graphic-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Details for the graphic: color, layout, what data to include, reference images…"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="graphic-urgency">Needed by (optional)</Label>
            <Input
              id="graphic-urgency"
              type="datetime-local"
              value={urgencyInput}
              onChange={(e) => setUrgencyInput(e.target.value)}
            />
            <p className="text-xs text-text-zero">
              When this graphic is needed. Shown to the graphics team so they
              can prioritize.
            </p>
          </div>

          {error ? (
            <p className="text-sm text-destructive">{error}</p>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Creating…
                </>
              ) : (
                <>
                  <Plus className="h-3.5 w-3.5" />
                  Request graphic
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
