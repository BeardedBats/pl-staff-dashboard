import * as React from "react";
import { cn } from "@/lib/utils";

const PageHeader = React.forwardRef<
  HTMLElement,
  React.HTMLAttributes<HTMLElement>
>(({ className, ...props }, ref) => (
  <header
    ref={ref}
    className={cn(
      "flex flex-col gap-2 px-7 pt-6 sm:flex-row sm:items-start sm:justify-between",
      className,
    )}
    {...props}
  />
));
PageHeader.displayName = "PageHeader";

function PageHeaderText({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("min-w-0", className)} {...props} />;
}

function PageHeaderEyebrow({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn(
        "mb-2.5 text-[11px] font-semibold uppercase tracking-[2.4px] text-amber-muted",
        className,
      )}
      {...props}
    />
  );
}

const PageHeaderTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h1
    ref={ref}
    className={cn(
      "text-plpd-page-title font-bold tracking-tight text-cyan",
      className,
    )}
    {...props}
  />
));
PageHeaderTitle.displayName = "PageHeaderTitle";

function PageHeaderDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      className={cn(
        "mt-2 text-base tracking-[0.32px] text-[var(--plpd-text-meta)]",
        className,
      )}
      {...props}
    />
  );
}

function PageHeaderActions({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("flex shrink-0 flex-wrap items-center gap-2", className)}
      {...props}
    />
  );
}

export {
  PageHeader,
  PageHeaderActions,
  PageHeaderDescription,
  PageHeaderEyebrow,
  PageHeaderText,
  PageHeaderTitle,
};
