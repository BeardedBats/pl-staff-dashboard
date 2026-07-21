"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, User as UserIcon, X as XIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { NAV_ITEMS, isNavVisible } from "@/components/layout/nav-config";
import type { AppRole } from "@/lib/auth/current-user";

type HeaderProps = {
  userId: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  roles: string[];
  /** Needed for the mobile nav drawer — optional for backwards compat */
  userRoles?: AppRole[];
  userDisplayName?: string;
};

function initialsFromName(name: string): string {
  const parts = name.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "PL";
}

export function Header({
  userId,
  displayName,
  email,
  avatarUrl,
  roles,
  userRoles = [],
  userDisplayName = "",
}: HeaderProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [isLoggingOut, setIsLoggingOut] = React.useState(false);
  const [mobileNavOpen, setMobileNavOpen] = React.useState(false);

  // Close mobile nav on route change
  React.useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  async function handleLogout() {
    setIsLoggingOut(true);
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      // Even on network error, clear local state and bounce.
    }
    router.refresh();
    router.replace("/login");
  }

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border-tab bg-card/75 px-6">
      {/* Left — hamburger on mobile, brand echo on desktop */}
      <div className="flex items-center gap-2 text-sm">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={() => setMobileNavOpen((o) => !o)}
          aria-label={mobileNavOpen ? "Close menu" : "Open menu"}
        >
          {mobileNavOpen ? (
            <XIcon className="h-5 w-5" />
          ) : (
            <Menu className="h-5 w-5" />
          )}
        </Button>
        <span className="hidden font-mono text-[10px] font-semibold uppercase tracking-wider text-text-zero md:inline">
          Staff Dashboard
        </span>
      </div>

      {/* Right — notifications, theme, user menu */}
      <div className="flex items-center gap-1">
        <NotificationBell userId={userId} />

        <ThemeToggle />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="User menu"
              className="ml-1 rounded-full"
            >
              <Avatar className="h-8 w-8">
                {avatarUrl ? (
                  <AvatarImage src={avatarUrl} alt={displayName} />
                ) : null}
                <AvatarFallback>{initialsFromName(displayName)}</AvatarFallback>
              </Avatar>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel>Signed in as</DropdownMenuLabel>
            <div className="px-2 pb-2 pt-0">
              <p className="text-sm font-medium text-foreground">{displayName}</p>
              <p className="text-xs text-text-zero">{email}</p>
              {roles.length > 0 ? (
                <p className="mt-1 font-mono text-[10px] uppercase tracking-wider text-text-zero">
                  {roles.join(" · ")}
                </p>
              ) : null}
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/settings">
                <UserIcon className="mr-2 h-4 w-4" />
                Profile &amp; settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={(e) => {
                e.preventDefault();
                void handleLogout();
              }}
              disabled={isLoggingOut}
              className="text-destructive focus:bg-destructive/10 focus:text-destructive"
            >
              <LogOut className="mr-2 h-4 w-4" />
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Mobile navigation slide-over */}
      {mobileNavOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-background/60 backdrop-blur-sm"
            onClick={() => setMobileNavOpen(false)}
          />
          {/* Drawer */}
          <nav className="absolute inset-y-0 left-0 w-64 border-r border-border bg-card p-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <span className="font-data text-sm font-bold uppercase tracking-[0.3px] text-cyan">
                Pitcher List
              </span>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMobileNavOpen(false)}
                aria-label="Close menu"
              >
                <XIcon className="h-4 w-4" />
              </Button>
            </div>
            <ul className="space-y-1">
              {NAV_ITEMS.filter((item) =>
                isNavVisible(item, userRoles as AppRole[]),
              ).map((item) => {
                const Icon = item.icon;
                const active =
                  pathname === item.href ||
                  (item.href !== "/home" && pathname.startsWith(`${item.href}/`));
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-sm px-3 py-2 text-sm font-medium transition-colors",
                        active
                          ? "plpd-nav-active text-white"
                          : "plpd-hover-surface text-text-nav hover:text-text-cell",
                      )}
                    >
                      <Icon className={cn("h-4 w-4 shrink-0", active && "text-white")} />
                      <span>{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
            {userDisplayName ? (
              <div className="mt-6 border-t border-border pt-4 text-xs text-text-zero">
                {userDisplayName}
              </div>
            ) : null}
          </nav>
        </div>
      ) : null}
    </header>
  );
}
