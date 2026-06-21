import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// PLPD chip construction: DM Sans 700 10px, .05em tracking, 6px radius,
// 2.5px/8px padding, translucent fill (~10%) + 1px border (~50%) in the
// semantic color. Semantic colors (green/red/val-pos) are reserved for
// status; role chips use brand/neutral tints (see role-badge.tsx).
const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-[6px] border px-2 py-[2.5px] font-sans text-[10px] font-bold uppercase tracking-[0.05em] transition-colors",
  {
    variants: {
      variant: {
        default: "border-border bg-surface-3 text-text-team",
        neutral: "border-border bg-surface-3 text-text-team",
        outline: "border-border bg-transparent text-text-team",
        // gray / zero — writer identity, "none"/"needed" empty states
        zero: "border-[rgba(164,170,202,0.35)] bg-[rgba(164,170,202,0.10)] text-text-zero",
        // brand
        cyan: "border-cyan/50 bg-cyan/10 text-cyan",
        cyanHeader: "border-cyan-header/50 bg-cyan-header/10 text-cyan-header",
        amber: "border-amber/50 bg-amber/10 text-amber",
        amberOutline: "border-amber bg-transparent text-amber",
        violet: "border-violet/50 bg-violet/10 text-violet",
        // semantic — reserved for status
        green: "border-green/50 bg-green/10 text-green",
        valpos: "border-val-pos/50 bg-val-pos/10 text-val-pos",
        gold: "border-gold/50 bg-gold/10 text-gold",
        blue: "border-blue/50 bg-blue/10 text-blue",
        red: "border-red/50 bg-red/10 text-red",
        // back-compat semantic aliases (generic good/bad badges)
        success: "border-green/50 bg-green/10 text-green",
        danger: "border-red/50 bg-red/10 text-red",
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
