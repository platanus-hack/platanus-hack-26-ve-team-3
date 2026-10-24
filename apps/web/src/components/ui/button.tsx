import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/client/cn";

const buttonVariants = cva(
  "inline-flex min-h-tap items-center justify-center gap-2 rounded-md px-4 text-body font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:bg-primary-hover",
        secondary: "border border-border bg-card text-foreground hover:bg-muted",
        ghost: "text-foreground hover:bg-muted",
        success: "bg-success text-white hover:bg-success-strong",
        danger: "bg-danger text-white hover:bg-danger-strong",
        link: "min-h-0 px-0 text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "min-h-tap px-4",
        lg: "min-h-12 px-6 text-heading",
        sm: "min-h-tap px-3 text-small",
      },
      full: { true: "w-full", false: "" },
    },
    defaultVariants: { variant: "primary", size: "default", full: false },
  },
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants> & { loading?: boolean };

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant, size, full, loading, children, disabled, type = "button", ...props },
  ref,
) {
  return (
    <button ref={ref} type={type} className={cn(buttonVariants({ variant, size, full }), className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading ? <span className="q-spinner" aria-hidden="true" /> : null}
      {children}
    </button>
  );
});

export { buttonVariants };
