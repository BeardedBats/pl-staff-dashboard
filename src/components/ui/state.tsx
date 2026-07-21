import * as React from "react";
import { CircleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

type StateProps = {
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
};

type LoadingStateProps = Omit<StateProps, "title" | "action"> & {
  title?: string;
};

function LoadingState({
  title = "Loading…",
  description,
  className,
}: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "plpd-state-frame flex min-h-[118px] flex-col items-center justify-center gap-2 rounded-plpd-panel border border-border-table p-[18px] text-center",
        className,
      )}
    >
      <span className="plpd-spinner" aria-hidden="true" />
      <p className="text-plpd-body font-bold uppercase tracking-[0.12em] text-amber-muted">
        {title}
      </p>
      {description ? (
        <p className="max-w-md text-plpd-body text-text-nav">{description}</p>
      ) : null}
    </div>
  );
}

function ErrorState({ title, description, action, className }: StateProps) {
  return (
    <div
      role="alert"
      className={cn(
        "plpd-alert-error flex min-h-[118px] flex-col items-center justify-center gap-2 rounded-plpd-panel border p-[18px] text-center",
        className,
      )}
    >
      <CircleAlert aria-hidden="true" className="h-6 w-6 text-red" />
      <p className="text-plpd-body font-bold text-red">{title}</p>
      {description ? (
        <p className="max-w-md text-plpd-body text-text-nav">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export { ErrorState, LoadingState };
