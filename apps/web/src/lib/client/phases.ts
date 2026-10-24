/** Fases v1 (D-12): `registration → open → closed → tallying → auditable → drawn`. `draft` antes; `failed` fuera de la línea. */
import type { ElectionStatus as ElectionPhase } from "@quorum/contracts";

export const PHASE_LINE: { id: Exclude<ElectionPhase, "draft" | "failed">; label: string; hint: string }[] = [
  { id: "registration", label: "Inscripción", hint: "Rostro y teléfono" },
  { id: "open", label: "Votación", hint: "Ya no entra nadie más" },
  { id: "closed", label: "Cerrada", hint: "No se aceptan más votos" },
  { id: "tallying", label: "Conteo", hint: "Se cuentan los votos" },
  { id: "auditable", label: "Resultado", hint: "Cualquiera puede comprobarlo" },
  { id: "drawn", label: "Sorteo", hint: "Cualquiera puede repetirlo" },
];

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

/** Índice en la línea de fases; `draft` = -1 (antes de la línea), `failed` = posición de `auditable` (allí se detectó). */
export function phaseIndex(p: ElectionPhase): number {
  if (p === "draft") return -1;
  if (p === "failed") return PHASE_LINE.findIndex((x) => x.id === "auditable");
  return PHASE_LINE.findIndex((x) => x.id === p);
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
