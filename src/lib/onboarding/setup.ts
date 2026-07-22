import type { AppRole } from "@/lib/auth/current-user";

export type SetupItem = {
  id: string;
  title: string;
  description: string;
  href: string;
};

const profileItem: SetupItem = {
  id: "profile",
  title: "Confirm your profile and timezone",
  description: "Deadlines and notifications depend on accurate profile settings.",
  href: "/settings",
};

const roleItems: Partial<Record<AppRole, SetupItem>> = {
  writer: {
    id: "writer-work",
    title: "Open your personal worklist",
    description: "Review assignments, deadlines, and drafts waiting for approval.",
    href: "/my-tasks",
  },
  editor: {
    id: "editor-queue",
    title: "Review the editing queue",
    description: "See which submitted articles are ready to claim or finish.",
    href: "/editing-queue",
  },
  graphics: {
    id: "graphics-queue",
    title: "Review graphic requests",
    description: "See open, claimed, submitted, and revision-needed artwork.",
    href: "/graphics",
  },
  manager: {
    id: "manager-inbox",
    title: "Review the manager inbox",
    description: "Approve or deny requests that are blocking staff work.",
    href: "/home#manager-inbox",
  },
  admin: {
    id: "admin-staff",
    title: "Review staff access",
    description: "Confirm user roles, sites, teams, and publishing access.",
    href: "/settings?tab=users",
  },
  eic: {
    id: "eic-analytics",
    title: "Review editorial analytics",
    description: "Check current content performance and pipeline signals.",
    href: "/analytics",
  },
  operations: {
    id: "operations-health",
    title: "Review integration health",
    description: "Check WordPress, analytics, imports, cron jobs, and alerts.",
    href: "/settings?tab=sync",
  },
};

const rolePriority: AppRole[] = [
  "operations",
  "eic",
  "admin",
  "manager",
  "editor",
  "graphics",
  "writer",
];

export function setupItemsForRoles(roles: readonly AppRole[]): SetupItem[] {
  const items = rolePriority
    .filter((role) => roles.includes(role))
    .map((role) => roleItems[role])
    .filter((item): item is SetupItem => Boolean(item))
    .slice(0, 3);

  return [profileItem, ...items];
}
