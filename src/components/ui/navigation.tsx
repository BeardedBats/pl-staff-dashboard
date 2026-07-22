import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

type NavigationItemProps = React.HTMLAttributes<HTMLElement> & {
  active?: boolean;
  asChild?: boolean;
  compact?: boolean;
};

function NavigationList({
  className,
  ...props
}: React.HTMLAttributes<HTMLUListElement>) {
  return <ul className={cn("space-y-0.5", className)} {...props} />;
}

function NavigationItem({
  active = false,
  asChild = false,
  compact = false,
  className,
  ...props
}: NavigationItemProps) {
  const Comp = asChild ? Slot : "div";

  return (
    <Comp
      aria-current={active ? "page" : undefined}
      data-active={active ? "true" : "false"}
      className={cn(
        "flex min-h-11 items-center gap-3 rounded-sm px-3 py-2 text-plpd-body font-medium transition-all duration-150",
        active
          ? "plpd-nav-active text-white"
          : "plpd-hover-surface text-text-nav hover:text-text-cell",
        compact && "justify-center px-2",
        className,
      )}
      {...props}
    />
  );
}

export { NavigationItem, NavigationList };
