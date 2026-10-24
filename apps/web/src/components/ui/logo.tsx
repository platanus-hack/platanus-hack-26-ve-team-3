import { cn } from "@/lib/client/cn";

const CHECK = "M28 39 L37 48 L57 25";

export function LogoMark({ size = 32, knockout = "var(--color-background)", className }: { size?: number; knockout?: string; className?: string }) {
  return (
    <svg viewBox="1 -3.5 64 64" width={size} height={size} aria-hidden="true" className={cn("shrink-0", className)}>
      <circle cx="28" cy="28" r="19" fill="none" stroke="currentColor" strokeWidth="9" />
      <path d={CHECK} fill="none" stroke={knockout} strokeWidth="17" strokeLinecap="round" strokeLinejoin="round" />
      <path d={CHECK} fill="none" stroke="var(--color-accent)" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Logo({ className, size = 30 }: { className?: string; size?: number }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark size={size} />
      <span className="font-display text-[1.375rem] font-semibold leading-none tracking-[-0.03em]">Quórum</span>
    </span>
  );
}
