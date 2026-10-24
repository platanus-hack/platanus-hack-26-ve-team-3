import * as React from "react";
import { cn } from "@/lib/client/cn";

const base =
  "w-full min-h-tap rounded-md border border-input bg-card px-3.5 py-2 text-body text-foreground transition-[border-color,box-shadow] duration-150 placeholder:text-subtle hover:border-subtle/50 focus-visible:border-primary focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-ring/20 disabled:opacity-50 aria-invalid:border-danger aria-invalid:focus-visible:ring-danger/20";

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(base, className)} {...props} />;
});

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(base, "min-h-28 leading-body", className)} {...props} />;
});

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, ...props }, ref) {
  return <select ref={ref} className={cn(base, "q-select appearance-none pr-10", className)} {...props} />;
});

export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn("block text-small font-medium text-muted-foreground", className)} {...props} />;
}

export function Field({ label, htmlFor, hint, error, children }: { label: string; htmlFor: string; hint?: string; error?: string | null; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && !error ? (
        <p id={`${htmlFor}-hint`} className="text-small text-muted-foreground">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${htmlFor}-error`} role="alert" className="text-small font-semibold text-danger-strong">
          Error: {error}
        </p>
      ) : null}
    </div>
  );
}

export function Checkbox({ id, label, className, ...props }: React.InputHTMLAttributes<HTMLInputElement> & { label: React.ReactNode }) {
  return (
    <label htmlFor={id} className={cn("flex min-h-tap cursor-pointer items-start gap-3 rounded-md p-2 -m-2", className)}>
      <input id={id} type="checkbox" className="mt-1 size-5 shrink-0 accent-[var(--color-success)]" {...props} />
      <span className="text-body">{label}</span>
    </label>
  );
}
