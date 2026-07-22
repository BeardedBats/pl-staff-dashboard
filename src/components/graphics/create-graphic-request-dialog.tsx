"use client";

import * as React from "react";
import { Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { GraphicRequirements } from "@/lib/graphics/data";
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
  const [assetType, setAssetType] = React.useState<GraphicRequirements["asset_type"]>("featured");
  const [placement, setPlacement] = React.useState("Featured image");
  const [width, setWidth] = React.useState("1200");
  const [height, setHeight] = React.useState("675");
  const [format, setFormat] = React.useState<GraphicRequirements["format"]>("webp");
  const [altText, setAltText] = React.useState("");
  const [referenceUrl, setReferenceUrl] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      setTitle("");
      setDescription("");
      setUrgencyInput("");
      setAssetType("featured");
      setPlacement("Featured image");
      setWidth("1200");
      setHeight("675");
      setFormat("webp");
      setAltText("");
      setReferenceUrl("");
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
          requirements: {
            asset_type: assetType,
            placement: placement.trim(),
            width: Number(width),
            height: Number(height),
            format,
            alt_text: altText.trim(),
            ...(referenceUrl.trim() ? { reference_url: referenceUrl.trim() } : {}),
          },
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
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="graphic-asset-type">Asset type *</Label>
              <Select value={assetType} onValueChange={(value) => setAssetType(value as GraphicRequirements["asset_type"])}>
                <SelectTrigger id="graphic-asset-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="featured">Featured image</SelectItem>
                  <SelectItem value="inline">Inline graphic</SelectItem>
                  <SelectItem value="social">Social image</SelectItem>
                  <SelectItem value="chart">Chart or data visual</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="graphic-format">Delivery format *</Label>
              <Select value={format} onValueChange={(value) => setFormat(value as GraphicRequirements["format"])}>
                <SelectTrigger id="graphic-format"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="webp">WebP</SelectItem>
                  <SelectItem value="png">PNG</SelectItem>
                  <SelectItem value="jpeg">JPEG</SelectItem>
                  <SelectItem value="gif">GIF</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="graphic-placement">Placement or purpose *</Label>
            <Input id="graphic-placement" value={placement} onChange={(event) => setPlacement(event.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="graphic-width">Width (px) *</Label>
              <Input id="graphic-width" type="number" min={1} max={10000} value={width} onChange={(event) => setWidth(event.target.value)} required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="graphic-height">Height (px) *</Label>
              <Input id="graphic-height" type="number" min={1} max={10000} value={height} onChange={(event) => setHeight(event.target.value)} required />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="graphic-alt-text">Alt text *</Label>
            <Input id="graphic-alt-text" value={altText} onChange={(event) => setAltText(event.target.value)} placeholder="Describe the image's meaning for a reader who cannot see it." required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="graphic-reference-url">Reference URL (optional)</Label>
            <Input id="graphic-reference-url" type="url" value={referenceUrl} onChange={(event) => setReferenceUrl(event.target.value)} placeholder="https://…" />
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
