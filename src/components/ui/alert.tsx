import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const alertVariants = cva(
  "relative w-full rounded-plpd-panel border px-5 py-[18px] text-plpd-body leading-[1.55]",
  {
    variants: {
      variant: {
        info: "plpd-alert-info text-blue",
        success: "plpd-alert-success text-green",
        warning: "plpd-alert-warning text-amber",
        error: "plpd-alert-error text-red",
      },
    },
    defaultVariants: {
      variant: "info",
    },
  },
);

type AlertProps = React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof alertVariants>;

const Alert = React.forwardRef<HTMLDivElement, AlertProps>(
  ({ className, variant, role, ...props }, ref) => (
    <div
      ref={ref}
      role={role ?? (variant === "error" ? "alert" : "status")}
      className={cn(alertVariants({ variant }), className)}
      {...props}
    />
  ),
);
Alert.displayName = "Alert";

const AlertTitle = React.forwardRef<
  HTMLHeadingElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn("mb-1 font-bold text-current", className)}
    {...props}
  />
));
AlertTitle.displayName = "AlertTitle";

const AlertDescription = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("text-text-nav", className)} {...props} />
));
AlertDescription.displayName = "AlertDescription";

export { Alert, AlertDescription, AlertTitle, alertVariants };
