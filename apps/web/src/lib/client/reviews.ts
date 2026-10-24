/**
 * D-21: textos del panel antes de abrir la votación. "X de Y listos" = quienes terminaron la inscripción (identidad en
 * el padrón) de los que entraron. Avisos: casos de coincidencia facial por revisar (se rechazan solos al abrir) y
 * personas a medio inscribir (quedan fuera sin aviso si se abre).
 */
export type Readiness = { ready: number; total: number; pending: number };

export function casesLabel(n: number): string {
  return n === 1 ? "Hay 1 caso por revisar" : `Hay ${n} casos por revisar`;
}

export function readinessLine(r: Readiness): string {
  return `${r.ready} de ${r.total} listos`;
}

/** Avisos para la confirmación de "Abrir votación" (vacío = nada que advertir). */
export function openWarnings(r: Readiness): string[] {
  const out: string[] = [];
  if (r.pending > 0) out.push(`${casesLabel(r.pending)}. Si abres ahora, ${r.pending === 1 ? "se rechaza" : "se rechazan"} automáticamente.`);
  if (r.total > 0 && r.ready < r.total) {
    out.push(`${r.ready} de ${r.total} ${r.total === 1 ? "persona terminó" : "personas terminaron"}. ${r.total - r.ready === 1 ? "La otra no podrá" : "Las demás no podrán"} votar. ¿Abrir igual?`);
  }
  return out;
}
