import * as React from "react";
import { LockKeyhole } from "lucide-react";
import { cn } from "@/lib/utils";

type GatedValueProps = {
  label: string;
  unit?: string;
  placeholder?: string;
  className?: string;
};

/**
 * Server-safe gated presentation. This API intentionally has no real-value
 * prop: authorization must withhold the value before this component renders.
 */
function GatedValue({
  label,
  unit,
  placeholder = "•••",
  className,
}: GatedValueProps) {
  return (
    <span
      data-plpd-state="gated"
      className={cn("inline-flex items-center gap-2", className)}
      aria-label={`${label} requires access`}
    >
      <LockKeyhole aria-hidden="true" className="h-4 w-4 text-amber-muted" />
      <span className="plpd-gated-value" aria-hidden="true">
        {placeholder}
        {unit ? ` ${unit}` : null}
      </span>
    </span>
  );
}

export { GatedValue };
export type { GatedValueProps };
