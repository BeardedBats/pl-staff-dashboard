"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import listPlugin from "@fullcalendar/list";
import interactionPlugin from "@fullcalendar/interaction";
import type { EventClickArg, EventInput } from "@fullcalendar/core";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import type { EntrySummary, EntryTier } from "@/lib/entries/queries";
import type { AppSite } from "@/lib/auth/current-user";

type CalendarPageClientProps = {
  initialEntries: EntrySummary[];
  tiers: EntryTier[];
};

/**
 * Tier → color mapping. Uses CSS variables so the calendar follows the
 * current theme (dark/light). The text color is chosen for contrast
 * against each tier background.
 */
const TIER_COLOR: Record<string, { bg: string; text: string }> = {
  S: { bg: "var(--amber)", text: "#0f1420" },
  A: { bg: "var(--cyan)", text: "#0f1420" },
  B: { bg: "var(--purple)", text: "#0f1420" },
  C: { bg: "var(--navy-4)", text: "var(--text-primary)" },
};

const ALL = "__all__";

export function CalendarPageClient({
  initialEntries,
  tiers,
}: CalendarPageClientProps) {
  const router = useRouter();
  const [entries, setEntries] = React.useState(initialEntries);
  const [siteFilter, setSiteFilter] = React.useState<AppSite | "">("");
  const [tierFilter, setTierFilter] = React.useState<string>("");
  const [calendarView, setCalendarView] = React.useState<
    "dayGridMonth" | "timeGridWeek" | "listMonth"
  >("dayGridMonth");

  const calendarRef = React.useRef<FullCalendar | null>(null);

  // Re-fetch when filters change.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const params = new URLSearchParams({ limit: "500" });
      if (siteFilter) params.set("site", siteFilter);
      if (tierFilter) params.set("tierId", tierFilter);
      const res = await fetch(`/api/entries?${params.toString()}`);
      if (!res.ok) return;
      const data = (await res.json()) as { entries: EntrySummary[] };
      if (!cancelled) setEntries(data.entries ?? []);
    })();
    return () => {
      cancelled = true;
    };
  }, [siteFilter, tierFilter]);

  // Sync the calendar API view when the toggle changes.
  React.useEffect(() => {
    const api = calendarRef.current?.getApi();
    if (api) api.changeView(calendarView);
  }, [calendarView]);

  const events: EventInput[] = React.useMemo(
    () =>
      entries
        .filter((e) => Boolean(e.publish_date))
        .map((e) => {
          const tierName = e.tier.name.toUpperCase();
          const color = TIER_COLOR[tierName] ?? TIER_COLOR.C;
          const hasTime =
            e.publish_date_precision === "exact" ||
            e.publish_date_precision === "loose_time";
          return {
            id: e.id,
            title: e.title,
            start: e.publish_date!,
            allDay: !hasTime,
            backgroundColor: color.bg,
            borderColor: color.bg,
            textColor: color.text,
            extendedProps: {
              entryId: e.id,
              tier: tierName,
              site: e.site,
              status: e.content_status,
              priority: e.priority,
              precision: e.publish_date_precision,
            },
          };
        }),
    [entries],
  );

  function handleEventClick(arg: EventClickArg) {
    const entryId = (arg.event.extendedProps as { entryId?: string }).entryId;
    if (entryId) {
      router.push(`/content?entry=${entryId}`);
    }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3">
        <Select
          value={siteFilter || ALL}
          onValueChange={(v) => setSiteFilter(v === ALL ? "" : (v as AppSite))}
        >
          <SelectTrigger className="h-8 w-[140px] text-xs">
            <SelectValue placeholder="Site" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Both sites</SelectItem>
            <SelectItem value="pl">Pitcher List</SelectItem>
            <SelectItem value="qb">QB List</SelectItem>
          </SelectContent>
        </Select>

        <Select
          value={tierFilter || ALL}
          onValueChange={(v) => setTierFilter(v === ALL ? "" : v)}
        >
          <SelectTrigger className="h-8 w-[160px] text-xs">
            <SelectValue placeholder="Tier" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>All tiers</SelectItem>
            {tiers.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name} — {t.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="ml-auto flex items-center rounded-sm border border-border">
          <Button
            size="sm"
            variant={calendarView === "dayGridMonth" ? "secondary" : "ghost"}
            onClick={() => setCalendarView("dayGridMonth")}
            className="rounded-none rounded-l-sm"
          >
            Month
          </Button>
          <Button
            size="sm"
            variant={calendarView === "timeGridWeek" ? "secondary" : "ghost"}
            onClick={() => setCalendarView("timeGridWeek")}
            className="rounded-none"
          >
            Week
          </Button>
          <Button
            size="sm"
            variant={calendarView === "listMonth" ? "secondary" : "ghost"}
            onClick={() => setCalendarView("listMonth")}
            className="rounded-none rounded-r-sm"
          >
            Agenda
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-text-muted">Tiers:</span>
        {tiers.map((t) => {
          const color = TIER_COLOR[t.name.toUpperCase()] ?? TIER_COLOR.C;
          return (
            <span
              key={t.id}
              className="inline-flex items-center gap-1 rounded-sm border border-border px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider"
            >
              <span
                className="h-2 w-2 rounded-sm"
                style={{ background: color.bg }}
              />
              {t.name} · {t.label}
            </span>
          );
        })}
        <span className="text-text-muted">
          · {events.length}{" "}
          {events.length === 1 ? "entry" : "entries"} scheduled
        </span>
      </div>

      {/* Calendar */}
      <div className="calendar-wrapper rounded-lg border border-border bg-card p-3">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
          initialView={calendarView}
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "",
          }}
          events={events}
          eventClick={handleEventClick}
          height="auto"
          dayMaxEvents={4}
          weekends={true}
          eventDisplay="block"
          displayEventTime={true}
          nowIndicator={true}
          firstDay={1}
        />
        <style jsx global>{`
          .calendar-wrapper .fc {
            font-family: var(--font-sans);
            color: var(--text-primary);
          }
          .calendar-wrapper .fc-theme-standard td,
          .calendar-wrapper .fc-theme-standard th,
          .calendar-wrapper .fc-theme-standard .fc-scrollgrid {
            border-color: var(--border);
          }
          .calendar-wrapper .fc-col-header-cell {
            background: var(--navy-3);
          }
          .calendar-wrapper .fc-col-header-cell-cushion {
            color: var(--text-muted);
            font-size: 10px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
            padding: 8px 4px;
          }
          .calendar-wrapper .fc-daygrid-day-number {
            color: var(--text-secondary);
            font-size: 12px;
            padding: 4px 6px;
          }
          .calendar-wrapper .fc-day-today {
            background: var(--cyan-dim) !important;
          }
          .calendar-wrapper .fc-day-today .fc-daygrid-day-number {
            color: var(--cyan);
            font-weight: 600;
          }
          .calendar-wrapper .fc-button {
            background: var(--secondary);
            border: 1px solid var(--border);
            color: var(--text-secondary);
            text-transform: none;
            font-size: 12px;
            padding: 4px 10px;
          }
          .calendar-wrapper .fc-button:hover {
            background: var(--navy-4);
            color: var(--text-primary);
          }
          .calendar-wrapper .fc-button-primary:not(:disabled).fc-button-active,
          .calendar-wrapper .fc-button-primary:not(:disabled):active {
            background: var(--cyan);
            color: var(--navy-1);
            border-color: var(--cyan);
          }
          .calendar-wrapper .fc-toolbar-title {
            font-size: 16px;
            font-weight: 600;
            color: var(--text-primary);
          }
          .calendar-wrapper .fc-event {
            border-radius: 3px;
            padding: 1px 4px;
            font-size: 11px;
            cursor: pointer;
          }
          .calendar-wrapper .fc-list-day-cushion {
            background: var(--navy-3) !important;
          }
          .calendar-wrapper .fc-list-event:hover td {
            background: var(--navy-3) !important;
          }
          .calendar-wrapper .fc-list-empty {
            background: var(--card);
            color: var(--text-muted);
          }
        `}</style>
      </div>

      {/* Unscheduled entries section */}
      {entries.filter((e) => !e.publish_date).length > 0 ? (
        <div className="rounded-lg border border-border bg-card p-4">
          <h3 className="mb-2 font-mono text-[10px] font-medium uppercase tracking-wider text-text-muted">
            Unscheduled ({entries.filter((e) => !e.publish_date).length})
          </h3>
          <p className="mb-3 text-xs text-text-muted">
            Entries without a publish date yet.
          </p>
          <ul className="space-y-1">
            {entries
              .filter((e) => !e.publish_date)
              .slice(0, 10)
              .map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => router.push(`/content?entry=${e.id}`)}
                    className="flex w-full items-center gap-2 rounded-sm px-2 py-1 text-left text-sm hover:bg-navy-3"
                  >
                    <Badge variant="outline">{e.tier.name}</Badge>
                    <Badge variant="outline">{e.site.toUpperCase()}</Badge>
                    <span className="truncate text-text-primary">{e.title}</span>
                  </button>
                </li>
              ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
