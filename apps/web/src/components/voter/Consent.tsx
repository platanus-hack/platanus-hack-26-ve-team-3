import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/client/cn";

/** Línea corta y honesta que acompaña al botón "Continuar" (tocarlo es aceptar). */
export const CONSENT_SHORT = "Usamos tu cámara para comprobar que eres una persona y que no te inscribes dos veces. No guardamos fotos.";

/** Texto completo ("Más detalles"). Sin afirmar anonimato ni secreto. Exportado para los tests. */
export const CONSENT_DETAILS = [
  "Tu teléfono calcula un descriptor facial (números, no la foto). Se guarda cifrado para evitar inscripciones dobles y se borra al abrir la votación. No verifica tu identidad civil ni impide todos los duplicados.",
  "Votas desde este teléfono: la clave vive solo en este navegador. Si borras sus datos, no podrás votar.",
  "Tu voto prueba que estás inscrito; la prueba no revela cuál inscrito emitió cada boleta.",
  "El servidor sí ve el contenido de cada boleta y su hora de llegada.",
] as const;

/** Consentimiento del votante: una línea + "Más detalles" desplegable. */
export function Consent({ extra, className, actionLabel = "Continuar" }: { extra?: readonly string[]; className?: string; actionLabel?: string }) {
  return (
    <div className={cn("flex flex-col gap-2", className)} data-testid="voter-consent">
      <p className="text-heading leading-snug">
        {CONSENT_SHORT} <span className="text-muted-foreground">Al tocar {actionLabel}, aceptas.</span>
      </p>
      <details className="group">
        <summary className="inline-flex min-h-tap cursor-pointer list-none items-center gap-1 text-heading font-semibold text-primary-ink underline underline-offset-4 [&::-webkit-details-marker]:hidden">
          Más detalles <ChevronDown className="size-5 transition-transform group-open:rotate-180" aria-hidden="true" />
        </summary>
        <ul className="mt-2 list-disc space-y-2 pl-5 text-base text-muted-foreground" data-testid="consent-details">
          {[...(extra ?? []), ...CONSENT_DETAILS].map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      </details>
    </div>
  );
}
