"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsLeft, ChevronsRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { NavigationItem, NavigationList } from "@/components/ui/navigation";
import { Separator } from "@/components/ui/separator";
import { NAV_ITEMS, isNavVisible, type NavItem } from "./nav-config";
import type { AppRole } from "@/lib/auth/current-user";

const COLLAPSED_KEY = "pl-staff-sidebar-collapsed";

type SidebarProps = {
  userRoles: AppRole[];
  userDisplayName: string;
};

export function Sidebar({ userRoles, userDisplayName }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState(false);

  // Persist collapse state across reloads.
  React.useEffect(() => {
    const stored = window.localStorage.getItem(COLLAPSED_KEY);
    if (stored === "true") setCollapsed(true);
  }, []);

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev;
      window.localStorage.setItem(COLLAPSED_KEY, String(next));
      return next;
    });
  }

  const visibleItems = NAV_ITEMS.filter((item) => isNavVisible(item, userRoles));

  return (
    <aside
      data-tour="sidebar"
      className={cn(
        "plpd-sidebar flex h-screen flex-col border-r border-border-sidebar transition-all duration-300 ease-in-out",
        collapsed ? "w-16" : "w-60",
      )}
    >
      {/* Brand */}
      <div
        className={cn(
          "flex h-14 shrink-0 items-center border-b border-border px-3",
          collapsed ? "justify-center" : "justify-between",
        )}
      >
        {collapsed ? (
          <span className="font-data text-sm font-bold tracking-[0.3px] text-cyan">PL</span>
        ) : (
          <Link href="/home" className="flex items-center gap-2">
            <span className="font-data text-sm font-bold uppercase tracking-[0.3px] text-cyan">
              Pitcher List
            </span>
            <span className="rounded-[6px] border border-border bg-surface-3 px-1.5 py-0.5 font-sans text-[10px] font-bold uppercase tracking-[0.05em] text-text-team">
              Staff
            </span>
          </Link>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex-1 overflow-y-auto py-3">
        <NavigationList className="px-2">
          {visibleItems.map((item) => (
            <li key={item.href}>
              <NavLink
                item={item}
                isActive={isActiveHref(pathname, item.href)}
                collapsed={collapsed}
              />
            </li>
          ))}
        </NavigationList>
      </nav>

      <Separator />

      {/* Collapse toggle */}
      <div className="flex h-12 shrink-0 items-center justify-end px-2">
        {!collapsed && (
          <span className="flex-1 truncate px-2 text-xs text-text-zero">
            {userDisplayName}
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
        </Button>
      </div>
    </aside>
  );
}

function NavLink({
  item,
  isActive,
  collapsed,
}: {
  item: NavItem;
  isActive: boolean;
  collapsed: boolean;
}) {
  const Icon = item.icon;
  // Derive the data-tour slug from the href so the Joyride tour can target
  // specific nav items ("/content" → "nav-content", "/my-tasks" → "nav-my-tasks").
  const tourId = `nav-${item.href.replace(/^\//, "")}`;
  return (
    <NavigationItem active={isActive} compact={collapsed} asChild>
      <Link
        href={item.href}
        data-tour={tourId}
        title={collapsed ? item.label : undefined}
      >
        <Icon className={cn("h-4 w-4 shrink-0", isActive && "text-white")} />
        {!collapsed && <span className="truncate">{item.label}</span>}
      </Link>
    </NavigationItem>
  );
}

function isActiveHref(pathname: string, href: string): boolean {
  if (href === "/home") return pathname === "/home" || pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}
