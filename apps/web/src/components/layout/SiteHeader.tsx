import Link from "next/link";
import { ThemeToggle } from "@/components/layout/ThemeToggle";

const nav = [
  { href: "/org/new", label: "Crear votación" },
  { href: "/audit", label: "Auditar" },
];

export function SiteHeader() {
  return (
    <header className="border-b border-border bg-background/90 backdrop-blur">
      <div className="q-container flex min-h-14 items-center justify-between gap-4">
        <Link href="/" className="flex min-h-tap items-center gap-2 text-heading font-bold tracking-tight">
          <span aria-hidden="true" className="inline-block size-3 rounded-sm bg-success" />
          Quórum
        </Link>
        <nav aria-label="Principal" className="flex items-center gap-1">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className="inline-flex min-h-tap items-center whitespace-nowrap rounded-md px-2 text-small font-semibold text-muted-foreground hover:bg-muted hover:text-foreground sm:px-3">
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
    <footer className="mt-auto border-t border-border">
      <div className="q-container flex flex-col gap-2 py-6 text-small text-muted-foreground md:flex-row md:items-center md:justify-between">
        <p>Quórum — demostración para decisiones internas de bajo riesgo. No es un sistema electoral certificado.</p>
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
