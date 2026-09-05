import { getCurrentUser } from "@/lib/auth/current-user";
import { listNotificationsForUser } from "@/lib/notifications/data";
import { NotificationsPageClient } from "./notifications-page-client";

export const metadata = {
  title: "Notifications",
};

export default async function NotificationsPage() {
  const viewer = await getCurrentUser();
  if (!viewer) return null;

  const { rows, unreadCount } = await listNotificationsForUser(viewer.id, {
    limit: 100,
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-text-cell">
          Notifications
        </h1>
        <p className="mt-1 text-sm text-text-team">
          Everything that happened across entries you&apos;re involved in.
        </p>
      </div>

      <NotificationsPageClient
        timezone={viewer.timezone}
        userId={viewer.id}
        initialRows={rows}
        initialUnreadCount={unreadCount}
      />
    </div>
  );
}
