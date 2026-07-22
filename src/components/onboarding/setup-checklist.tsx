"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, Circle, Loader2, Rocket } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { SetupItem } from "@/lib/onboarding/setup";

type Props = {
  userId: string;
  items: SetupItem[];
};

function storageKey(userId: string) {
  return `pl-dashboard-setup:${userId}`;
}

export function SetupChecklist({ userId, items }: Props) {
  const [completed, setCompleted] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState(false);
  const [finished, setFinished] = React.useState(false);

  React.useEffect(() => {
    try {
      const stored = JSON.parse(
        window.localStorage.getItem(storageKey(userId)) ?? "[]",
      ) as unknown;
      if (Array.isArray(stored)) {
        setCompleted(new Set(stored.filter((value): value is string => typeof value === "string")));
      }
    } catch {
      window.localStorage.removeItem(storageKey(userId));
    }
  }, [userId]);

  function markVisited(id: string) {
    setCompleted((current) => {
      const next = new Set(current);
      next.add(id);
      window.localStorage.setItem(storageKey(userId), JSON.stringify([...next]));
      return next;
    });
  }

  async function finishSetup() {
    setSaving(true);
    setError(false);
    try {
      const response = await fetch("/api/users/me/onboarding", { method: "POST" });
      if (!response.ok) throw new Error("Setup completion failed");
      window.localStorage.removeItem(storageKey(userId));
      setFinished(true);
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }

  const completeCount = items.filter((item) => completed.has(item.id)).length;
  const allComplete = completeCount === items.length;

  if (finished) {
    return (
      <Alert variant="success">
        <AlertTitle>Setup complete</AlertTitle>
        <AlertDescription>
          Your role-based dashboard is ready. The Today view will keep showing your next action.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card state={allComplete ? "active" : "default"} stateful>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">
              <h2 className="flex items-center gap-2">
                <Rocket className="h-4 w-4 text-cyan" aria-hidden="true" />
                Finish setting up your dashboard
              </h2>
            </CardTitle>
            <CardDescription className="mt-1">
              Your checklist is tailored to your current responsibilities.
            </CardDescription>
          </div>
          <span className="shrink-0 font-data text-xs text-text-team">
            {completeCount}/{items.length}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <ul className="grid gap-2 md:grid-cols-2">
          {items.map((item) => {
            const done = completed.has(item.id);
            return (
              <li key={item.id}>
                <Link
                  href={item.href}
                  onClick={() => markVisited(item.id)}
                  className="flex h-full gap-3 rounded-md border border-border bg-surface-3/30 p-3 hover:bg-surface-3/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan"
                >
                  {done ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green" aria-hidden="true" />
                  ) : (
                    <Circle className="mt-0.5 h-4 w-4 shrink-0 text-text-zero" aria-hidden="true" />
                  )}
                  <span>
                    <span className="block text-sm font-medium text-text-cell">
                      {item.title}
                    </span>
                    <span className="mt-1 block text-xs text-text-team">
                      {item.description}
                    </span>
                  </span>
                  <span className="sr-only">{done ? "Completed" : "Not completed"}</span>
                </Link>
              </li>
            );
          })}
        </ul>

        {error ? (
          <Alert variant="error">
            <AlertTitle>Setup progress was not saved</AlertTitle>
            <AlertDescription>
              Your checklist is still here. Try finishing setup again.
            </AlertDescription>
          </Alert>
        ) : null}

        <div className="flex flex-col gap-2 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-text-team">
            {allComplete
              ? "Setup is ready to finish."
              : "Open each checklist item once, then finish setup."}
          </p>
          <Button onClick={() => void finishSetup()} disabled={!allComplete || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
            Finish setup
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
