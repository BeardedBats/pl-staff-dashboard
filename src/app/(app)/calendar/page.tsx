import { listEntries, listTiers } from "@/lib/entries/queries";
import { getCurrentUser } from "@/lib/auth/current-user";
import { CalendarPageClient } from "./calendar-page-client";
import { ContentViews } from "@/components/layout/content-views";

export const metadata = {
  title: "Calendar",
};

export default async function CalendarPage() {
  const viewer = await getCurrentUser();
  if (!viewer) return null;

  // Pull a generous window — the past 30 days + the next 90 days — so the
  // calendar has something to render immediately. The client can refetch
  // when the user navigates past the window.
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - 30);
  const end = new Date(now);
  end.setDate(now.getDate() + 90);

  const [{ entries }, tiers] = await Promise.all([
    listEntries({
      dateFrom: start.toISOString(),
      dateTo: end.toISOString(),
      limit: 500,
    }),
    listTiers(),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-cell">Calendar</h1>
        <p className="mt-1 text-sm text-text-team">
          Publishing schedule for your accessible sites. WordPress owns the final publication time.
        </p>
      </div>

      <ContentViews active="calendar" />
      <CalendarPageClient initialEntries={entries} tiers={tiers} />
    </div>
  );
}
