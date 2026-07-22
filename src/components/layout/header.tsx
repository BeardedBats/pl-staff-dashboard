"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogOut, Menu, User as UserIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { NavigationItem, NavigationList } from "@/components/ui/navigation";
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
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
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border-tab bg-card/75 px-3 sm:px-4 lg:px-6">
      {/* Left — hamburger on mobile, brand echo on desktop */}
      <div className="flex items-center gap-2 text-sm">
        <Sheet open={mobileNavOpen} onOpenChange={setMobileNavOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-64 p-4 lg:hidden">
            <SheetTitle className="sr-only">Application navigation</SheetTitle>
            <span className="mb-4 font-data text-sm font-bold uppercase tracking-[0.3px] text-cyan">
              Pitcher List
            </span>
            <nav aria-label="Application">
              <NavigationList>
                {NAV_ITEMS.filter((item) =>
                  isNavVisible(item, userRoles as AppRole[]),
                ).map((item) => {
                  const Icon = item.icon;
                  const active =
                    pathname === item.href ||
                    (item.href !== "/home" &&
                      pathname.startsWith(`${item.href}/`));
                  return (
                    <li key={item.href}>
                      <NavigationItem active={active} asChild>
                        <Link href={item.href}>
                          <Icon
                            className={cn(
                              "h-4 w-4 shrink-0",
                              active && "text-white",
                            )}
                          />
                          <span>{item.label}</span>
                        </Link>
                      </NavigationItem>
                    </li>
                  );
                })}
              </NavigationList>
            </nav>
            {userDisplayName ? (
              <div className="mt-auto border-t border-border pt-4 text-xs text-text-zero">
                {userDisplayName}
              </div>
            ) : null}
          </SheetContent>
        </Sheet>
        <span className="hidden font-sans text-[10px] font-semibold uppercase tracking-wider text-text-zero lg:inline">
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
              <p className="text-sm font-medium text-foreground">
                {displayName}
              </p>
              <p className="text-xs text-text-zero">{email}</p>
              {roles.length > 0 ? (
                <p className="mt-1 font-data text-[10px] uppercase tracking-wider text-text-zero">
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
    </header>
  );
}
