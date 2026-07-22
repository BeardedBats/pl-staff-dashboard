import type * as React from "react";
import { Badge } from "@/components/ui/badge";
import type {
  ContentStatus,
  EditorStatus,
  GraphicStatus,
} from "@/lib/entries/queries";

// PLPD status → semantic mapping (approved artifact §4 + addendum Q1).
// gray/zero · gold · blue · green · violet · val-pos · red. Exact values live
// only in the centralized PLPD registry. CONFLICT-equivalent states (polishing,
// flagged) are always visible — never hidden.

type BadgeVariant = React.ComponentProps<typeof Badge>["variant"];

// --------------------------------------------------------------------------
// Content track
// --------------------------------------------------------------------------

const CONTENT_VARIANT: Record<ContentStatus, BadgeVariant> = {
  writer_needed: "zero",
  claim_requested: "gold",
  claimed: "blue",
  submitted: "green",
  polishing: "violet",
};

const CONTENT_LABEL: Record<ContentStatus, string> = {
  writer_needed: "Writer needed",
  claim_requested: "Claim pending",
  claimed: "Claimed",
  submitted: "Submitted",
  polishing: "Polishing",
};

export function ContentStatusBadge({ status }: { status: ContentStatus }) {
  return <Badge variant={CONTENT_VARIANT[status]}>{CONTENT_LABEL[status]}</Badge>;
}

// --------------------------------------------------------------------------
// Editor track
// --------------------------------------------------------------------------

const EDITOR_VARIANT: Record<EditorStatus, BadgeVariant> = {
  none: "zero",
  ready_for_edit: "gold",
  edited: "blue",
  scheduled: "valpos", // done, pending go-live (Q1)
  published: "green", // LIVE (Q1)
};

const EDITOR_LABEL: Record<EditorStatus, string> = {
  none: "—",
  ready_for_edit: "Ready for edit",
  edited: "Edited",
  scheduled: "Scheduled",
  published: "Published",
};

export function EditorStatusBadge({ status }: { status: EditorStatus }) {
  if (status === "none") {
    return <Badge variant="zero">—</Badge>;
  }
  return <Badge variant={EDITOR_VARIANT[status]}>{EDITOR_LABEL[status]}</Badge>;
}

// --------------------------------------------------------------------------
// Graphic track (rolled up to an aggregate summary across multiple requests)
// --------------------------------------------------------------------------

const GRAPHIC_VARIANT: Record<GraphicStatus, BadgeVariant> = {
  needed: "zero",
  claimed: "blue",
  submitted: "green",
  flagged: "red",
};

const GRAPHIC_LABEL: Record<GraphicStatus, string> = {
  needed: "Needed",
  claimed: "Claimed",
  submitted: "Done",
  flagged: "Flagged",
};

export function GraphicStatusBadge({ status }: { status: GraphicStatus }) {
  return <Badge variant={GRAPHIC_VARIANT[status]}>{GRAPHIC_LABEL[status]}</Badge>;
}

/**
 * Aggregate graphic status for an entry. Returns the worst status (most
 * needing attention) so the table row conveys urgency at a glance.
 *
 * Precedence: flagged > needed > claimed > submitted > (none).
 */
export function aggregateGraphicStatus(
  statuses: GraphicStatus[],
): GraphicStatus | null {
  if (statuses.length === 0) return null;
  if (statuses.includes("flagged")) return "flagged";
  if (statuses.includes("needed")) return "needed";
  if (statuses.includes("claimed")) return "claimed";
  return "submitted";
}
