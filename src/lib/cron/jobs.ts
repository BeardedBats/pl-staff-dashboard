export type CronJobKey = keyof typeof CRON_JOBS;

type CronJobRegistryEntry = {
  path: string;
  schedule: string;
  label: string;
  staleAfterSeconds: number;
  remediation: string;
  execution: {
    name: string;
    intervalSeconds: number;
  };
};

export const CRON_JOBS = {
  "recurring-generate": {
    path: "/api/cron/recurring-generate",
    schedule: "17 5 * * *",
    label: "Recurring content generation",
    staleAfterSeconds: 2 * 24 * 60 * 60,
    remediation: "Run recurring generation from Settings > Templates and inspect the latest failed run.",
    execution: { name: "recurring-generate", intervalSeconds: 24 * 60 * 60 },
  },
  "unclaimed-alerts": {
    path: "/api/cron/unclaimed-alerts",
    schedule: "13 */3 * * *",
    label: "Unclaimed-work alerts",
    staleAfterSeconds: 6 * 60 * 60,
    remediation: "Check notification data access and invoke the unclaimed-alerts cron with an administrator session.",
    execution: { name: "unclaimed-alerts", intervalSeconds: 3 * 60 * 60 },
  },
  "wp-sync": {
    path: "/api/cron/wp-sync",
    schedule: "2-59/5 * * * *",
    label: "WordPress content synchronization",
    staleAfterSeconds: 15 * 60,
    remediation: "Open Settings > Sync, verify WordPress connectivity, and run Sync WordPress posts.",
    execution: { name: "wp-sync", intervalSeconds: 5 * 60 },
  },
  "profile-sync": {
    path: "/api/cron/profile-sync",
    schedule: "23 */6 * * *",
    label: "WordPress profile synchronization",
    staleAfterSeconds: 12 * 60 * 60,
    remediation: "Open Settings > Sync, verify WordPress connectivity, and run Sync staff profiles.",
    execution: { name: "profile-sync", intervalSeconds: 6 * 60 * 60 },
  },
  "category-sync": {
    path: "/api/cron/category-sync",
    schedule: "37 3 * * 0",
    label: "WordPress category synchronization",
    staleAfterSeconds: 10 * 24 * 60 * 60,
    remediation: "Open Settings > Sync, verify WordPress connectivity, and run Sync categories.",
    execution: { name: "category-sync", intervalSeconds: 7 * 24 * 60 * 60 },
  },
  "ga4-sync": {
    path: "/api/cron/ga4-sync",
    schedule: "47 7 * * *",
    label: "Google Analytics synchronization",
    staleAfterSeconds: 2 * 24 * 60 * 60,
    remediation: "Open Settings > Analytics, reconnect GA4 if needed, and run Sync yesterday.",
    execution: { name: "ga4-sync", intervalSeconds: 24 * 60 * 60 },
  },
  "deadline-reminders": {
    path: "/api/cron/deadline-reminders",
    schedule: "0 * * * *",
    label: "Deadline reminders",
    staleAfterSeconds: 3 * 60 * 60,
    remediation: "Check notification data access and invoke the deadline-reminders cron with an administrator session.",
    execution: { name: "deadline-reminders", intervalSeconds: 60 * 60 },
  },
  "season-switch": {
    path: "/api/cron/season-switch",
    schedule: "0 6 * * *",
    label: "Season-mode switching",
    staleAfterSeconds: 2 * 24 * 60 * 60,
    remediation: "Open Settings > Season, verify the active date window, and invoke the season-switch cron.",
    execution: { name: "season-switch", intervalSeconds: 24 * 60 * 60 },
  },
} as const satisfies Record<string, CronJobRegistryEntry>;
