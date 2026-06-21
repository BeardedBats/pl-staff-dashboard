import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        ref={ref}
        className={cn(
          // PLPD input — flat surface-3 + hairline border-tab + inset top highlight
          "flex h-9 w-full rounded-sm border border-border-tab bg-surface-3 px-3 py-1 text-sm text-text-cell shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-colors",
          "placeholder:text-text-zero",
          "focus-visible:outline-none focus-visible:border-[rgba(157,244,255,0.35)] focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
