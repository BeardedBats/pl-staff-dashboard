import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, Compass } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { TodayBrief as TodayBriefModel } from "@/lib/home/today";

const statePresentation = {
  urgent: {
    label: "Needs attention",
    badge: "danger" as const,
    icon: AlertTriangle,
  },
  attention: {
    label: "Next up",
    badge: "amber" as const,
    icon: Compass,
  },
  clear: {
    label: "On track",
    badge: "success" as const,
    icon: CheckCircle2,
  },
};

export function TodayBrief({ brief }: { brief: TodayBriefModel }) {
  const presentation = statePresentation[brief.state];
  const Icon = presentation.icon;

  return (
    <Card state={brief.state === "urgent" ? "error" : "active"} stateful>
      <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-surface-3/50">
            <Icon className="h-4 w-4 text-cyan" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <Badge variant={presentation.badge}>{presentation.label}</Badge>
            <h2 className="mt-2 text-lg font-semibold text-text-cell">{brief.title}</h2>
            <p className="mt-1 text-sm text-text-team">{brief.summary}</p>
          </div>
        </div>
        <Button asChild className="w-full shrink-0 sm:w-auto">
          <Link href={brief.href}>
            {brief.actionLabel}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
