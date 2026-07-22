"use client";

import * as React from "react";
import { Joyride, STATUS } from "react-joyride";
import type { Step } from "react-joyride";

type Props = {
  /** Only render the tour when the user hasn't finished it yet. */
  enabled: boolean;
  userId: string;
};

/**
 * First-time onboarding tour, powered by Joyride v3. Kicks in on the first
 * authenticated page load when `users.onboarding_completed` is false.
 *
 * Joyride v3 moved most per-step toggles (showProgress, skipBeacon, etc.)
 * into the `options` prop — keep this in mind if you're copy-pasting from
 * older examples online.
 */
export function OnboardingTour({ enabled, userId }: Props) {
  const [run, setRun] = React.useState(false);
  const [dismissed, setDismissed] = React.useState(() =>
    typeof window === "undefined"
      ? false
      : window.localStorage.getItem(`pl-dashboard-tour:${userId}`) === "done",
  );

  React.useEffect(() => {
    if (!enabled || dismissed) return;
    // Small delay so the sidebar has time to mount and Joyride can measure
    // its target element correctly.
    const id = setTimeout(() => setRun(true), 600);
    return () => clearTimeout(id);
  }, [enabled, dismissed]);

  if (!enabled || dismissed) return null;

  return (
    <Joyride
      steps={STEPS}
      run={run}
      continuous
      options={{
        // Hardcoded because Joyride renders in a portal outside .dark —
        // CSS vars won't resolve. See globals.css for portal overrides.
        primaryColor: "var(--cyan)",
        backgroundColor: "var(--surface-2)",
        textColor: "var(--text-cell)",
        overlayColor: "var(--plpd-joyride-overlay)",
        zIndex: 10000,
        showProgress: true,
        skipBeacon: true,
      }}
      onEvent={(data) => {
        const { status } = data;
        if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
          window.localStorage.setItem(`pl-dashboard-tour:${userId}`, "done");
          setDismissed(true);
          setRun(false);
        }
      }}
    />
  );
}

const STEPS: Step[] = [
  {
    target: "body",
    placement: "center",
    title: "Welcome to the PL Staff Dashboard",
    content:
      "This is the internal home for everyone who writes, edits, and produces content at Pitcher List and QB List. Let's take a quick minute to show you around.",
  },
  {
    target: '[data-tour="sidebar"]',
    placement: "right",
    title: "Navigation",
    content:
      "Everything lives in the sidebar. Your available pages depend on your roles — writers see the content queue, editors get the editing queue, and admins see the full pipeline.",
  },
  {
    target: '[data-tour="global-search"]',
    placement: "bottom",
    title: "Find anything quickly",
    content:
      "Search staff, content, assignments, graphics, and schedules from every page. Press Ctrl K or slash to open it.",
  },
  {
    target: '[data-tour="notification-bell"]',
    placement: "bottom",
    title: "Notifications",
    content:
      "Real-time pings when something needs your attention — claim approvals, edit requests, mentions in comments. Click the bell to see the latest.",
  },
];
