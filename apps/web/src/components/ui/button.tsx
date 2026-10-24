import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/client/cn";

const buttonVariants = cva(
  "inline-flex min-h-tap items-center justify-center gap-2 rounded-full px-5 text-body font-semibold transition-[background-color,color,box-shadow,transform] duration-150 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground shadow-primary hover:bg-primary-hover",
        soft: "bg-primary-soft text-primary-soft-foreground hover:bg-primary-muted/60",
        secondary: "border border-input bg-card text-foreground hover:bg-muted",
        ghost: "text-foreground hover:bg-muted",
        success: "bg-success text-white shadow-[0_10px_22px_-10px_var(--color-success)] hover:brightness-110",
        danger: "bg-danger text-white hover:brightness-110",
        link: "min-h-0 rounded-none px-0 text-primary-ink underline-offset-4 hover:underline",
      },
      size: {
        default: "min-h-tap px-5",
        lg: "min-h-13 px-7 text-heading",
        sm: "min-h-tap px-4 text-small",
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
