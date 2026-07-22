import type { LucideIcon } from "lucide-react";
import {
  Home,
  Table2,
  Calendar,
  ListChecks,
  ClipboardEdit,
  Palette,
  Archive,
  BarChart3,
  Users,
  Bell,
  Settings,
} from "lucide-react";
import type { AppRole } from "@/lib/auth/current-user";

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** If omitted, visible to all signed-in users. */
  visibleTo?: AppRole[];
  /** If true, only users with can_publish OR listed roles see it. */
  requiresPublish?: boolean;
};

/**
 * Canonical navigation for the dashboard. Ordering matches the sidebar spec.
 * Role-based visibility is enforced via {@link isNavVisible}.
 */
export const NAV_ITEMS: NavItem[] = [
  { label: "Home", href: "/home", icon: Home },
  { label: "Content Table", href: "/content", icon: Table2 },
  { label: "Calendar", href: "/calendar", icon: Calendar },
  { label: "My Work", href: "/my-tasks", icon: ListChecks },
  {
    label: "Editing Queue",
    href: "/editing-queue",
    icon: ClipboardEdit,
    visibleTo: ["editor", "manager", "admin", "eic", "operations"],
  },
  { label: "Graphic Requests", href: "/graphics", icon: Palette },
  { label: "Published Archive", href: "/archive", icon: Archive },
  {
    label: "Analytics",
    href: "/analytics",
    icon: BarChart3,
    visibleTo: ["eic", "operations"],
  },
  { label: "Staff Directory", href: "/staff", icon: Users },
  { label: "Notifications", href: "/notifications", icon: Bell },
  { label: "Settings", href: "/settings", icon: Settings },
];

export function isNavVisible(
  item: NavItem,
  userRoles: AppRole[],
): boolean {
  if (!item.visibleTo) return true;
  return item.visibleTo.some((r) => userRoles.includes(r));
}
