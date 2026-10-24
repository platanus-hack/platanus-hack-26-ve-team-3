import Link from "next/link";
import { Check } from "lucide-react";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

const nav = [
  { href: "/org/new", label: "Crear votación" },
  { href: "/audit", label: "Auditar" },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-md">
      <div className="q-container flex min-h-14 items-center justify-between gap-2 sm:min-h-16 sm:gap-4">
        <Link href="/" className="flex min-h-tap shrink-0 items-center gap-2 text-heading font-semibold tracking-tight sm:gap-2.5">
          <span aria-hidden="true" className="grid size-7 place-items-center rounded-[0.5rem] bg-primary text-primary-foreground shadow-primary sm:size-8 sm:rounded-[0.625rem]">
            <Check className="size-4.5" strokeWidth={3} />
          </span>
          Quórum
        </Link>
        <nav aria-label="Principal" className="flex min-w-0 items-center sm:gap-1">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="hidden min-h-tap items-center whitespace-nowrap rounded-full px-2 text-small sm:inline-flex font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:px-4">
              {n.label}
            </Link>
          ))}
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border/70">
      <div className="q-container flex flex-col gap-2 py-6 text-small text-muted-foreground md:flex-row md:items-center md:justify-between">
        <p>Quórum · Votaciones internas verificables</p>
        <p className="flex flex-wrap items-center gap-x-3">
          <Link href="/audit" className="inline-flex min-h-tap items-center underline underline-offset-4">
            Verificador independiente
          </Link>
          <Link href="/audit/lab" className="inline-flex min-h-tap items-center underline underline-offset-4">
            Laboratorio del jurado
          </Link>
        </p>
      </div>
    </footer>
  );
}
