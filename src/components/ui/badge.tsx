import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-sm border px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider transition-colors",
  {
    variants: {
      variant: {
        default:
          "border-border bg-secondary text-text-secondary",
        cyan:
          "border-cyan/30 bg-cyan-dim text-cyan",
        amber:
          "border-amber/30 bg-amber-dim text-amber",
        purple:
          "border-purple/30 bg-purple/10 text-purple",
        success:
          "border-success/30 bg-success/10 text-success",
        danger:
          "border-destructive/30 bg-destructive/10 text-destructive",
        outline:
          "border-border bg-transparent text-text-secondary",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
