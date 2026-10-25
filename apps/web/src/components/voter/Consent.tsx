import { cn } from "@/lib/client/cn";
import { Disclosure } from "@/components/ui/disclosure";

/** Línea corta y honesta que acompaña al botón "Continuar" (tocarlo es aceptar). */
export const CONSENT_SHORT = "Usamos tu cámara para comprobar que eres una persona y que no te inscribes dos veces. No guardamos fotos.";

/** Texto del único enlace del modo compacto (exportado para los tests). */
export const CONSENT_LINK_LABEL = "Cómo usamos tu cámara";

/** Texto completo ("Más detalles"). Sin afirmar anonimato ni secreto. Exportado para los tests. */
export const CONSENT_DETAILS = [
  "Tu teléfono calcula un descriptor facial (números, no la foto). Se guarda cifrado para evitar inscripciones dobles y se borra al abrir la votación. No verifica tu identidad civil ni impide todos los duplicados.",
  "Votas desde este teléfono: la clave vive solo en este navegador. Si borras sus datos, no podrás votar.",
  "Tu voto prueba que estás inscrito; la prueba no revela cuál inscrito emitió cada boleta.",
  "El servidor sí ve el contenido de cada boleta y su hora de llegada.",
] as const;

/**
 * Consentimiento del votante.
 *  - `compact` (entrada del votante): un solo enlace pequeño y gris, "Cómo usamos tu cámara", que despliega la línea
 *    corta, "Al tocar <acción>, aceptas." y los detalles (`extra` + `CONSENT_DETAILS`).
 *  - Sin `compact`: la línea corta visible + "Más detalles" desplegable (uso anterior, se conserva).
 */
export function Consent({ extra, className, actionLabel = "Continuar", compact = false }: { extra?: readonly string[]; className?: string; actionLabel?: string; compact?: boolean }) {
  const details = (
    <ul className="list-disc space-y-2 pl-5 text-small text-muted-foreground" data-testid="consent-details">
      {[...(extra ?? []), ...CONSENT_DETAILS].map((p) => (
        <li key={p}>{p}</li>
      ))}
    </ul>
  );
  if (compact) {
    return (
      <div className={cn("flex flex-col", className)} data-testid="voter-consent" data-compact="true">
        <Disclosure
          variant="link"
          title={CONSENT_LINK_LABEL}
          testId="consent-link"
          className="[&>summary]:text-small [&>summary]:font-normal [&>summary]:text-muted-foreground [&>summary]:decoration-muted-foreground/50 [&>summary>svg]:size-4"
          bodyClassName="flex flex-col gap-2"
        >
          <p className="text-small leading-relaxed text-muted-foreground">
            {CONSENT_SHORT} Al tocar {actionLabel}, aceptas.
          </p>
          {details}
        </Disclosure>
      </div>
    );
  }
  return (
    <div className={cn("flex flex-col gap-2", className)} data-testid="voter-consent">
      <p className="text-body leading-relaxed">
        {CONSENT_SHORT} <span className="text-muted-foreground">Al tocar {actionLabel}, aceptas.</span>
      </p>
      <Disclosure variant="link" title="Más detalles">
        {details}
      </Disclosure>
    </div>
  );
}
