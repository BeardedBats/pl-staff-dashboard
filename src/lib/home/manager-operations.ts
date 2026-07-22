import type { PipelineHealth } from "./widgets";

export type ManagerSignals = {
  overdue: number;
  dueNextSevenDays: number;
  stale: number;
};

export type WeeklyOperationalDigest = {
  delivered: number;
  committed: number;
  decisions: number;
  risks: number;
  nextAction: string;
  nextActionHref: string;
};

export function buildWeeklyOperationalDigest(input: {
  health: PipelineHealth;
  signals: ManagerSignals;
  pendingApprovals: number;
}): WeeklyOperationalDigest {
  const { health, signals, pendingApprovals } = input;
  const risks =
    signals.overdue + signals.stale + health.gateBlocked + health.writerNeeded;

  if (pendingApprovals > 0) {
    return {
      delivered: health.publishedThisWeek,
      committed: signals.dueNextSevenDays,
      decisions: pendingApprovals,
      risks,
      nextAction: "Resolve the oldest pending approval",
      nextActionHref: "#manager-inbox",
    };
  }
  if (signals.overdue > 0) {
    return {
      delivered: health.publishedThisWeek,
      committed: signals.dueNextSevenDays,
      decisions: 0,
      risks,
      nextAction: "Review overdue work",
      nextActionHref: "/content?sortBy=publish_date&sortDir=asc",
    };
  }
  if (health.writerNeeded > 0) {
    return {
      delivered: health.publishedThisWeek,
      committed: signals.dueNextSevenDays,
      decisions: 0,
      risks,
      nextAction: "Close writer coverage gaps",
      nextActionHref: "/content?status=writer_needed",
    };
  }
  if (health.gateBlocked > 0) {
    return {
      delivered: health.publishedThisWeek,
      committed: signals.dueNextSevenDays,
      decisions: 0,
      risks,
      nextAction: "Move edited work toward scheduling",
      nextActionHref: "/content?status=submitted",
    };
  }
  return {
    delivered: health.publishedThisWeek,
    committed: signals.dueNextSevenDays,
    decisions: 0,
    risks,
    nextAction: "Review the upcoming publishing plan",
    nextActionHref: "/calendar",
  };
}
