import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Kel status labels use bold colored text. Keep variants for existing callers.
const badgeVariants = cva(
  "kel-status inline-flex items-center gap-1",
  {
    variants: {
      variant: {
        default: "text-text-team",
        neutral: "text-text-team",
        outline: "text-text-team",
        // gray / zero — writer identity, "none"/"needed" empty states
        zero: "kel-status-muted",
        // brand
        cyan: "text-cyan",
        cyanHeader: "text-cyan-header",
        amber: "kel-status-pending",
        amberOutline: "kel-status-pending",
        violet: "kel-status-polishing",
        // semantic — reserved for status
        green: "kel-status-success",
        valpos: "kel-status-scheduled",
        gold: "kel-status-pending",
        blue: "kel-status-claimed",
        red: "kel-status-flagged",
        // back-compat semantic aliases (generic good/bad badges)
        success: "kel-status-success",
        danger: "kel-status-flagged",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends
    React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}

export { Badge, badgeVariants };
