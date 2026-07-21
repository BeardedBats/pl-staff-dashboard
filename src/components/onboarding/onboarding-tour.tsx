"use client";

import * as React from "react";
import { Joyride, STATUS } from "react-joyride";
import type { Step } from "react-joyride";

type Props = {
  /** Only render the tour when the user hasn't finished it yet. */
  enabled: boolean;
};

/**
 * First-time onboarding tour, powered by Joyride v3. Kicks in on the first
 * authenticated page load when `users.onboarding_completed` is false.
 *
 * Joyride v3 moved most per-step toggles (showProgress, skipBeacon, etc.)
 * into the `options` prop — keep this in mind if you're copy-pasting from
 * older examples online.
 */
export function OnboardingTour({ enabled }: Props) {
  const [run, setRun] = React.useState(false);
  const [completed, setCompleted] = React.useState(false);

  React.useEffect(() => {
    if (!enabled || completed) return;
    // Small delay so the sidebar has time to mount and Joyride can measure
    // its target element correctly.
    const id = setTimeout(() => setRun(true), 600);
    return () => clearTimeout(id);
  }, [enabled, completed]);

  async function markComplete() {
    setCompleted(true);
    setRun(false);
    try {
      await fetch("/api/users/me/onboarding", { method: "POST" });
    } catch {
      // Non-blocking — the user can dismiss again next login if this fails.
    }
  }

  if (!enabled || completed) return null;

  return (
    <Joyride
      steps={STEPS}
      run={run}
      continuous
      options={{
        // Hardcoded because Joyride renders in a portal outside .dark —
        // CSS vars won't resolve. See globals.css for portal overrides.
        primaryColor: "#55e8ff",
        backgroundColor: "#181A2C",
        textColor: "#d4dae6",
        overlayColor: "rgba(15, 20, 32, 0.75)",
        zIndex: 10000,
        showProgress: true,
        skipBeacon: true,
      }}
      onEvent={(data) => {
        const { status } = data;
        if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
          void markComplete();
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
    target: '[data-tour="nav-content"]',
    placement: "right",
    title: "The Content Table",
    content:
      "The pipeline. Every article in motion — with filters, saved views, and inline detail panels. This is where you'll spend most of your time.",
  },
  {
    target: '[data-tour="nav-my-tasks"]',
    placement: "right",
    title: "My Tasks",
    content:
      "Your personal worklist: entries you've claimed, upcoming deadlines, and drafts waiting for your approval. The fastest way to see what you owe.",
  },
  {
    target: '[data-tour="notification-bell"]',
    placement: "bottom",
    title: "Notifications",
    content:
      "Real-time pings when something needs your attention — claim approvals, edit requests, mentions in comments. Click the bell to see the latest.",
  },
  {
    target: '[data-tour="nav-settings"]',
    placement: "right",
    title: "Settings",
    content:
      "Update your profile and timezone, then tune which events appear in your in-app notification inbox.",
  },
];
