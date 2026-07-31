export const NOTIFICATIONS_CHANGED_EVENT = "pl:notifications-changed";

export type NotificationsChangedDetail = {
  unreadCount: number;
};

export function dispatchNotificationsChanged(unreadCount: number): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<NotificationsChangedDetail>(
      NOTIFICATIONS_CHANGED_EVENT,
      { detail: { unreadCount } },
    ),
  );
}
