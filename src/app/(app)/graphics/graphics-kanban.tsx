"use client";

import * as React from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { cn } from "@/lib/utils";
import { GraphicRequestCard } from "@/components/graphics/graphic-request-card";
import { Badge } from "@/components/ui/badge";
import type { GraphicRequestRecord } from "@/lib/graphics/data";
import type { GraphicStatus } from "@/lib/entries/queries";

type GraphicsKanbanProps = {
  requests: GraphicRequestRecord[];
  onChanged: () => void;
};

const COLUMNS: Array<{
  status: GraphicStatus;
  label: string;
  badge: "outline" | "cyan" | "success" | "danger";
  hint: string;
}> = [
  { status: "needed", label: "Needed", badge: "outline", hint: "Waiting for a graphics artist to claim" },
  { status: "claimed", label: "In Progress", badge: "cyan", hint: "Claimed, working on it" },
  { status: "submitted", label: "Submitted", badge: "success", hint: "Uploaded to WP as featured image" },
  { status: "flagged", label: "Flagged", badge: "danger", hint: "Needs a fix from the artist" },
];

/**
 * Kanban board for graphic requests.
 *
 * Drag-to-change-status rules:
 *   - A card can be dragged from `needed` ⇄ `flagged` (unflag)
 *   - A card can be dragged from `needed` → `claimed` (claim, by current user)
 *   - A card can be dragged from `claimed` → `needed` (release)
 *   - `submitted` is a locked column — dragging in/out is disabled (you
 *     must go through the real submit flow, which uploads to WP).
 *   - Flagging via drag is disabled (we need a reason — use the card's
 *     Flag button instead).
 *
 * So in practice: the drag supports claim/release/unflag, and blocks the
 * transitions that need extra input or side-effects.
 */
export function GraphicsKanban({
  requests,
  onChanged,
}: GraphicsKanbanProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    }),
  );

  const [activeId, setActiveId] = React.useState<string | null>(null);
  const [dragError, setDragError] = React.useState<string | null>(null);

  const byStatus = React.useMemo(() => {
    const map: Record<GraphicStatus, GraphicRequestRecord[]> = {
      needed: [],
      claimed: [],
      submitted: [],
      flagged: [],
    };
    for (const r of requests) map[r.graphic_status].push(r);
    return map;
  }, [requests]);

  const activeRequest = activeId
    ? requests.find((r) => r.id === activeId) ?? null
    : null;

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
    setDragError(null);
  }

  async function handleDragEnd(event: DragEndEvent) {
    setActiveId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const activeReq = requests.find((r) => r.id === String(active.id));
    if (!activeReq) return;

    const targetColumn = String(over.id);
    if (!isGraphicStatus(targetColumn)) return;
    const fromStatus = activeReq.graphic_status;

    if (fromStatus === targetColumn) return;

    // Decide which action to take.
    const action = resolveDragAction(fromStatus, targetColumn);
    if (!action) {
      setDragError(
        `Can't drag directly from ${fromStatus} to ${targetColumn}. Use the card buttons instead.`,
      );
      return;
    }
    const allowed =
      (action === "claim" && activeReq.permissions.claim) ||
      (action === "unclaim" && activeReq.permissions.unclaim) ||
      (action === "unflag" && activeReq.permissions.unflag);
    if (!allowed) return;

    try {
      const res = await fetch(`/api/graphic-requests/${activeReq.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setDragError(data.error ?? "Drag action failed");
        return;
      }
      onChanged();
    } catch {
      setDragError("Network error");
    }
  }

  return (
    <div className="space-y-3">
      {dragError ? (
        <p className="rounded-sm border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {dragError}
        </p>
      ) : null}

      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((col) => (
            <KanbanColumn
              key={col.status}
              status={col.status}
              label={col.label}
              hint={col.hint}
              badge={col.badge}
              requests={byStatus[col.status]}
              onChanged={onChanged}
            />
          ))}
        </div>

        <DragOverlay>
          {activeRequest ? (
            <div className="opacity-90 shadow-xl">
              <GraphicRequestCard
                request={activeRequest}
                compact
              />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <p className="text-[11px] italic text-text-zero">
        Drag to claim (Needed → Claimed), release (Claimed → Needed), or
        unflag (Flagged → Needed). Other transitions need a reason or an
        upload — use the card buttons.
      </p>
    </div>
  );
}

// --------------------------------------------------------------------------
// Column
// --------------------------------------------------------------------------

function KanbanColumn({
  status,
  label,
  hint,
  badge,
  requests,
  onChanged,
}: {
  status: GraphicStatus;
  label: string;
  hint: string;
  badge: "outline" | "cyan" | "success" | "danger";
  requests: GraphicRequestRecord[];
  onChanged: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });

  return (
    <div
      ref={setNodeRef}
      className={cn(
        "flex min-h-[200px] flex-col rounded-lg border border-border bg-card p-3",
        isOver && "border-cyan/60 bg-cyan-dim",
      )}
    >
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-text-cell">{label}</h3>
          <Badge variant={badge}>{requests.length}</Badge>
        </div>
      </div>
      <p className="mb-3 text-[11px] text-text-zero">{hint}</p>

      <SortableContext
        items={requests.map((r) => r.id)}
        strategy={verticalListSortingStrategy}
      >
        <div className="flex-1 space-y-2">
          {requests.length === 0 ? (
            <p className="rounded-md border border-dashed border-border bg-card/30 p-4 text-center text-xs italic text-text-zero">
              Empty
            </p>
          ) : (
            requests.map((r) => (
              <SortableCard
                key={r.id}
                request={r}
                onChanged={onChanged}
              />
            ))
          )}
        </div>
      </SortableContext>
    </div>
  );
}

// --------------------------------------------------------------------------
// Sortable card wrapper
// --------------------------------------------------------------------------

function SortableCard({
  request,
  onChanged,
}: {
  request: GraphicRequestRecord;
  onChanged: () => void;
}) {
  const canDrag =
    (request.graphic_status === "needed" && request.permissions.claim) ||
    (request.graphic_status === "claimed" && request.permissions.unclaim) ||
    (request.graphic_status === "flagged" && request.permissions.unflag);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: request.id, disabled: !canDrag });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  };

  return (
    <div ref={setNodeRef} style={style} {...attributes} {...listeners}>
      <GraphicRequestCard
        request={request}
        compact
        onChanged={onChanged}
      />
    </div>
  );
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function isGraphicStatus(value: string): value is GraphicStatus {
  return ["needed", "claimed", "submitted", "flagged"].includes(value);
}

/**
 * Return the claim/unclaim/unflag action for a drag transition, or null if
 * the transition isn't supported by drag alone.
 */
function resolveDragAction(
  from: GraphicStatus,
  to: GraphicStatus,
): "claim" | "unclaim" | "unflag" | null {
  if (from === "needed" && to === "claimed") return "claim";
  if (from === "claimed" && to === "needed") return "unclaim";
  if (from === "flagged" && to === "needed") return "unflag";
  if (from === "flagged" && to === "claimed") return "unflag";
  return null;
}
