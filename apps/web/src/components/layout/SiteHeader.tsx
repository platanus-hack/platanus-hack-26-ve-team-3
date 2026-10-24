import Link from "next/link";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Logo } from "@/components/ui/logo";

const nav = [
  { href: "/votaciones", label: "Mis votaciones", mobile: true },
  { href: "/org/new", label: "Crear votación", mobile: false },
  { href: "/audit", label: "Auditar", mobile: false },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-border/70 bg-background/80 backdrop-blur-md">
      <div className="q-container flex min-h-14 items-center justify-between gap-2 sm:min-h-16 sm:gap-4">
        <Link href="/" aria-label="Quórum, inicio" className="flex min-h-tap shrink-0 items-center">
          <Logo />
        </Link>
        <nav aria-label="Principal" className="flex min-w-0 items-center sm:gap-1">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className={`${n.mobile ? "inline-flex" : "hidden sm:inline-flex"} min-h-tap items-center whitespace-nowrap rounded-full px-2 text-small font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:px-4`}>
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
          <Link href="/audit/lab" className="hidden min-h-tap items-center underline underline-offset-4 sm:inline-flex">
            Laboratorio del jurado
          </Link>
        </p>
      </div>
    </footer>
  );
}
