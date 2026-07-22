import type {
  HomeEntryCard,
  HomeGraphicCard,
  PipelineHealth,
} from "@/lib/home/widgets";

export type TodayBrief = {
  state: "urgent" | "attention" | "clear";
  title: string;
  summary: string;
  actionLabel: string;
  href: string;
};

type TodayBriefInput = {
  pendingClaims: number;
  pendingArchives: number;
  myClaims: HomeEntryCard[];
  myDeadlines: HomeEntryCard[];
  myDrafts: HomeEntryCard[];
  editorQueue: HomeEntryCard[];
  myEdits: HomeEntryCard[];
  openGraphics: HomeGraphicCard[];
  myGraphics: HomeGraphicCard[];
  pipelineHealth: PipelineHealth | null;
  staleEntries: HomeEntryCard[];
  unclaimedSlots: HomeEntryCard[];
  now?: Date;
};

function countLabel(count: number, singular: string, plural = `${singular}s`) {
  return `${count} ${count === 1 ? singular : plural}`;
}

export function buildTodayBrief(input: TodayBriefInput): TodayBrief {
  const approvals = input.pendingClaims + input.pendingArchives;
  if (approvals > 0) {
    return {
      state: "urgent",
      title: `${countLabel(approvals, "approval")} blocking the team`,
      summary: "Resolve the oldest request first so editorial work can keep moving.",
      actionLabel: "Review manager inbox",
      href: "/home#manager-inbox",
    };
  }

  if (input.myDrafts.length > 0) {
    return {
      state: "urgent",
      title: `${countLabel(input.myDrafts.length, "draft")} waiting for your decision`,
      summary: "Approve or discard the WordPress draft before taking on new work.",
      actionLabel: "Review drafts",
      href: "/my-tasks",
    };
  }

  const now = input.now ?? new Date();
  const overdue = input.myClaims.filter(
    (entry) =>
      entry.publish_date !== null &&
      new Date(entry.publish_date).getTime() < now.getTime(),
  );
  if (overdue.length > 0) {
    return {
      state: "urgent",
      title: `${countLabel(overdue.length, "assignment")} past its publish date`,
      summary: "Open the oldest overdue article and update its status or deadline.",
      actionLabel: "Open overdue work",
      href: `/content?entry=${overdue[0].id}`,
    };
  }

  if (input.myEdits.length > 0 || input.editorQueue.length > 0) {
    const assigned = input.myEdits.length;
    return {
      state: "attention",
      title:
        assigned > 0
          ? `${countLabel(assigned, "edit")} assigned to you`
          : `${countLabel(input.editorQueue.length, "article")} ready for an editor`,
      summary:
        assigned > 0
          ? "Finish your earliest assigned edit before claiming another."
          : "Claim the most time-sensitive article in the editing queue.",
      actionLabel: "Open editing queue",
      href: "/editing-queue",
    };
  }

  if (input.myGraphics.length > 0 || input.openGraphics.length > 0) {
    const assigned = input.myGraphics.length;
    return {
      state: "attention",
      title:
        assigned > 0
          ? `${countLabel(assigned, "graphic request")} in your queue`
          : `${countLabel(input.openGraphics.length, "graphic request")} ready to claim`,
      summary:
        assigned > 0
          ? "Continue the oldest claimed request and submit a version when ready."
          : "Claim the oldest open request that fits your workload.",
      actionLabel: "Open graphic requests",
      href: "/graphics",
    };
  }

  if (input.myDeadlines.length > 0 || input.myClaims.length > 0) {
    const next = input.myDeadlines[0] ?? input.myClaims[0];
    return {
      state: "attention",
      title: "Your next article is ready",
      summary: `Continue “${next.title}” before starting something new.`,
      actionLabel: "Open next article",
      href: `/content?entry=${next.id}`,
    };
  }

  if ((input.pipelineHealth?.gateBlocked ?? 0) > 0) {
    const count = input.pipelineHealth?.gateBlocked ?? 0;
    return {
      state: "urgent",
      title: `${countLabel(count, "article")} blocked before scheduling`,
      summary: "Review the blocked handoff and assign the missing next step.",
      actionLabel: "Review pipeline",
      href: "/content",
    };
  }

  if (input.staleEntries.length > 0) {
    return {
      state: "attention",
      title: `${countLabel(input.staleEntries.length, "article")} without recent activity`,
      summary: "Check the oldest stale article and confirm its owner and next deadline.",
      actionLabel: "Review stale work",
      href: `/content?entry=${input.staleEntries[0].id}`,
    };
  }

  if (input.unclaimedSlots.length > 0) {
    return {
      state: "clear",
      title: "Your assigned work is clear",
      summary: `${countLabel(input.unclaimedSlots.length, "writer slot")} available if you have capacity.`,
      actionLabel: "Browse open slots",
      href: "/content?status=writer_needed",
    };
  }

  return {
    state: "clear",
    title: "Nothing needs your attention right now",
    summary: "Your queues are clear. Check the calendar before wrapping up.",
    actionLabel: "View calendar",
    href: "/calendar",
  };
}
