/** Fases v1 (D-12): `registration → open → closed → tallying → auditable → drawn`. `draft` antes; `failed` fuera de la línea. */
import type { ElectionStatus as ElectionPhase } from "@quorum/contracts";

export type PhaseStep = { id: Exclude<ElectionPhase, "draft" | "failed">; label: string; hint: string };

/**
 * Línea completa, con el sorteo. Es el ORDEN de referencia (`isAtLeast`, `phaseIndex` sin línea). Lo que se pinta sale
 * de `phaseLine(...)`: sin candidatos no existe el paso «Sorteo».
 */
export const PHASE_LINE: PhaseStep[] = [
  { id: "registration", label: "Inscripción", hint: "Rostro y teléfono" },
  { id: "open", label: "Votación", hint: "Ya no entra nadie más" },
  { id: "closed", label: "Cerrada", hint: "No se aceptan más votos" },
  { id: "tallying", label: "Conteo", hint: "Se cuentan los votos" },
  { id: "auditable", label: "Resultado", hint: "Cualquiera puede comprobarlo" },
  { id: "drawn", label: "Sorteo", hint: "Cualquiera puede repetirlo" },
];

/** Hay sorteo (D-12) solo si la votación tiene candidatos al sorteo. */
export const hasDraw = (election: { candidates?: unknown[] | null } | null | undefined): boolean => (election?.candidates?.length ?? 0) > 0;

/**
 * Pasos que se muestran en el panel y en Transparencia.
 *  - Sin candidatos al sorteo (`hasDraw` falso, o `election.candidates` vacío/ausente) no aparece «Sorteo»: nadie lo va a hacer.
 *  - D-22, modo continuo: no hay inscripción aparte; se inscriben y votan a la vez.
 * Sin argumentos = sin sorteo y con inscripción.
 */
export function phaseLine(opts: { hasDraw?: boolean; continuous?: boolean; election?: { candidates?: unknown[] | null; votingMode?: string | null } | null } = {}): PhaseStep[] {
  const draw = opts.hasDraw ?? (opts.election ? hasDraw(opts.election) : false);
  const continuous = opts.continuous ?? opts.election?.votingMode === "continuous";
  let line = draw ? PHASE_LINE : PHASE_LINE.filter((p) => p.id !== "drawn");
  if (continuous) line = line.filter((p) => p.id !== "registration").map((p) => (p.id === "open" ? { ...p, label: "Inscripción y votación", hint: "Se inscriben y votan en el momento" } : p));
  return line;
}

/** Clases de columnas (literales, para que Tailwind las genere) según cuántos pasos tenga la línea. */
export const PHASE_GRID_COLS: Record<number, string> = { 4: "md:grid-cols-4", 5: "md:grid-cols-5", 6: "md:grid-cols-6" };

export const phaseLabel: Record<ElectionPhase, string> = {
  draft: "Borrador",
  registration: "Inscripción abierta",
  open: "Votación abierta",
  closed: "Cerrada",
  tallying: "Contando votos",
  auditable: "Resultado publicado",
  drawn: "Sorteo realizado",
  failed: "Falló la comprobación",
};

/**
 * Índice en la línea de fases (`line`, por defecto la completa); `draft` = -1 (antes de la línea), `failed` = posición
 * de `auditable` (allí se detectó). Si la fase no está en la línea (p. ej. `drawn` sin paso «Sorteo», `registration`
 * en modo continuo) se queda en el último paso que sí alcanzó.
 */
export function phaseIndex(p: ElectionPhase, line: PhaseStep[] = PHASE_LINE): number {
  if (p === "draft") return -1;
  if (p === "failed") return line.findIndex((x) => x.id === "auditable");
  const i = line.findIndex((x) => x.id === p);
  if (i >= 0) return i;
  if (p === "drawn") return line.findIndex((x) => x.id === "auditable");
  return -1;
}

export const isAtLeast = (p: ElectionPhase, target: Exclude<ElectionPhase, "draft" | "failed">) => p !== "failed" && phaseIndex(p) >= phaseIndex(target);

/** Hay paquete de auditoría que verificar (auditable, drawn o failed: el resultado se publica aunque falle). */
export const hasAuditPackage = (p: ElectionPhase) => p === "auditable" || p === "drawn" || p === "failed";

export type OrganizerAction = { id: "publish" | "open" | "close" | "draw"; label: string; hint: string; confirm: string; irreversible: boolean };

/** La única acción de avance que el organizador puede tomar en cada fase (botones por fase del panel). */
export function nextOrganizerAction(p: ElectionPhase, opts: { candidates: number }): OrganizerAction | null {
  switch (p) {
    case "draft":
      return { id: "publish", label: "Abrir inscripción", hint: "Abre la inscripción para que la gente entre con el QR.", confirm: "Después no se pueden editar pregunta, opciones ni fechas.", irreversible: true };
    case "registration":
      return { id: "open", label: "Abrir votación", hint: "Cuando estén todos inscritos, abre la votación.", confirm: "Nadie más podrá inscribirse.", irreversible: true };
    case "open":
      return { id: "close", label: "Cerrar votación", hint: "Están votando. Ciérrala cuando terminen.", confirm: "No se aceptarán más votos y se publica el resultado verificable.", irreversible: true };
    case "auditable":
      return opts.candidates > 0
        ? { id: "draw", label: "Hacer el sorteo", hint: "La votación cerró. Sortea los proyectos ganadores.", confirm: "Cualquiera podrá recomputar el resultado.", irreversible: true }
        : null;
    default:
      return null;
  }
}
