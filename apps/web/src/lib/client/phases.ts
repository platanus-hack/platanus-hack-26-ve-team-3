/** Fases v1 (D-12): `registration → open → closed → tallying → auditable → drawn`. `draft` antes; `failed` fuera de la línea. */
import type { ElectionPhase } from "./v1";

export const PHASE_LINE: { id: Exclude<ElectionPhase, "draft" | "failed">; label: string; hint: string }[] = [
  { id: "registration", label: "Inscripción", hint: "Rostro + wallet + credencial" },
  { id: "open", label: "Votación", hint: "Padrón congelado; voto en vivo" },
  { id: "closed", label: "Cerrada", hint: "No se aceptan más boletas" },
  { id: "tallying", label: "Escrutinio", hint: "Recuento y paquete de auditoría" },
  { id: "auditable", label: "Auditable", hint: "Cualquiera verifica el paquete" },
  { id: "drawn", label: "Sorteo", hint: "Ganadores recomputables" },
];

export const phaseLabel: Record<ElectionPhase, string> = {
  draft: "Borrador",
  registration: "Inscripción abierta",
  open: "Votación abierta",
  closed: "Cerrada",
  tallying: "Escrutando",
  auditable: "Auditable",
  drawn: "Sorteo realizado",
  failed: "Verificación fallida",
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

export type OrganizerAction = { id: "publish" | "open" | "close" | "draw"; label: string; confirm: string; irreversible: boolean };

/** La única acción de avance que el organizador puede tomar en cada fase (botones por fase del panel). */
export function nextOrganizerAction(p: ElectionPhase, opts: { candidates: number }): OrganizerAction | null {
  switch (p) {
    case "draft":
      return { id: "publish", label: "Abrir inscripción", confirm: "Se fija el manifiesto (título, opciones y fechas). Después no se puede editar.", irreversible: true };
    case "registration":
      return { id: "open", label: "Congelar padrón y abrir votación", confirm: "Se congela el padrón con los inscritos actuales. Nadie más podrá inscribirse.", irreversible: true };
    case "open":
      return { id: "close", label: "Cerrar votación", confirm: "Cerrar es irreversible: se genera el paquete de auditoría y se corre el verificador.", irreversible: true };
    case "auditable":
      return opts.candidates > 0
        ? { id: "draw", label: "Realizar sorteo verificable", confirm: "La semilla sale del hash final del ledger; cualquiera podrá recomputar el resultado.", irreversible: true }
        : null;
    default:
      return null;
  }
}
