import * as React from "react";
import { cn } from "@/lib/utils";

type EmptyStateProps = {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
};

/**
 * Consistent "nothing here" placeholder for empty lists, filtered-out results,
 * and unbuilt pages.
 */
export function EmptyState({
  title,
  description,
  icon,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      role="status"
      data-plpd-state="empty"
      className={cn(
        "plpd-state-frame flex min-h-[118px] flex-col items-center justify-center rounded-plpd-panel border border-border-table p-[18px] text-center",
        className,
      )}
    >
      {icon ? (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-border-tab bg-surface-3 text-text-zero">
          {icon}
        </div>
      ) : null}
      <h3 className="text-plpd-body font-bold text-text-cell">{title}</h3>
      {description ? (
        <p className="mt-1 max-w-md text-sm text-text-team">{description}</p>
      ) : null}
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
