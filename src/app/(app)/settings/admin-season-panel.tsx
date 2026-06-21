"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Calendar, Check, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { SeasonModeRecord } from "@/lib/season-modes/data";

type Props = {
  initialModes: SeasonModeRecord[];
};

export function AdminSeasonPanel({ initialModes }: Props) {
  const router = useRouter();
  const [modes, setModes] = React.useState(initialModes);
  const [busy, setBusy] = React.useState<string | null>(null);

  async function refresh() {
    const res = await fetch("/api/season-modes");
    const data = (await res.json()) as { modes: SeasonModeRecord[] };
    setModes(data.modes ?? []);
    router.refresh();
  }

  async function activate(id: string) {
    setBusy(id);
    try {
      const res = await fetch(`/api/season-modes/${id}/activate`, {
        method: "PATCH",
      });
      if (res.ok) await refresh();
    } finally {
      setBusy(null);
    }
  }

  async function saveDates(id: string, start: string, end: string) {
    setBusy(id);
    try {
      await fetch(`/api/season-modes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auto_switch_start: start || null,
          auto_switch_end: end || null,
        }),
      });
      await refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          Season mode
        </CardTitle>
        <CardDescription>
          Control which season is currently active. Recurring templates only
          generate entries when their tagged season is active. The active
          season&apos;s start date is also used for the{" "}
          <code className="font-mono text-cyan">{"{week}"}</code> token in
          titles like &quot;Hitter List — Week 3&quot;.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {modes.map((mode) => (
          <SeasonRow
            key={mode.id}
            mode={mode}
            busy={busy === mode.id}
            onActivate={() => activate(mode.id)}
            onSaveDates={(start, end) => saveDates(mode.id, start, end)}
          />
        ))}
      </CardContent>
    </Card>
  );
}

function SeasonRow({
  mode,
  busy,
  onActivate,
  onSaveDates,
}: {
  mode: SeasonModeRecord;
  busy: boolean;
  onActivate: () => void;
  onSaveDates: (start: string, end: string) => void;
}) {
  const [start, setStart] = React.useState(mode.auto_switch_start ?? "");
  const [end, setEnd] = React.useState(mode.auto_switch_end ?? "");
  const [dirty, setDirty] = React.useState(false);

  React.useEffect(() => {
    setStart(mode.auto_switch_start ?? "");
    setEnd(mode.auto_switch_end ?? "");
    setDirty(false);
  }, [mode]);

  return (
    <div className="rounded-md border border-border bg-surface-3/30 p-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-semibold text-text-cell">
            {mode.name}
          </h3>
          {mode.is_active ? (
            <Badge variant="success">
              <Check className="h-2.5 w-2.5" />
              Active
            </Badge>
          ) : null}
        </div>
        {!mode.is_active ? (
          <Button size="sm" onClick={onActivate} disabled={busy}>
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
            Activate
          </Button>
        ) : null}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <div className="space-y-1">
          <Label className="text-[10px] uppercase text-text-zero">
            Starts
          </Label>
          <Input
            type="date"
            value={start}
            onChange={(e) => {
              setStart(e.target.value);
              setDirty(true);
            }}
            className="w-40"
          />
        </div>
        <div className="space-y-1">
          <Label className="text-[10px] uppercase text-text-zero">Ends</Label>
          <Input
            type="date"
            value={end}
            onChange={(e) => {
              setEnd(e.target.value);
              setDirty(true);
            }}
            className="w-40"
          />
        </div>
        {dirty ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => onSaveDates(start, end)}
            disabled={busy}
            className="self-end"
          >
            Save dates
          </Button>
        ) : null}
      </div>
    </div>
  );
}
