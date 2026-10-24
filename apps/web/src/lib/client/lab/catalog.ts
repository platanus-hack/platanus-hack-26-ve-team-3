/**
 * Catálogo de alteraciones del Laboratorio del jurado (docs/DEMO_SCRIPT.md §Reto 3).
 * Es DATOS, no lógica: qué se altera, qué check del verificador debería fallar y con qué ancla.
 * Los nombres de checks son strings tal como los emite `@quorum/verifier`; si un verificador no emite
 * alguno (p. ej. `draw_matches` antes de la rama del motor), la UI lo muestra como "no evaluado por este verificador".
 */

export type AlterationId =
  | "ballot-message"
  | "ledger-reorder"
  | "nullifier-dup"
  | "tally-inflate"
  | "group-root"
  | "roll-insert"
  | "final-hash"
  | "draw-seed"
  | "draw-winner"
  | "drop-raw"
  | "drop-rechain"
  | "ledger-extra-field"
  | "room-hide";

export type AnchorMode = "none" | "sim" | "real";

export type AlterationSpec = {
  id: AlterationId;
  /** Texto del botón (corto, para el proyector). */
  title: string;
  /** Qué hace exactamente sobre la copia. */
  body: string;
  /**
   * Checks que el guion espera ver fallar. `none` = sin ancla evaluada; `anchored` = con ancla (simulada o real).
   * Lista vacía = el verificador NO puede detectarlo en ese modo (se muestra así, sin maquillar).
   */
  expect: { none: string[]; anchored: string[] };
  /** Requisitos del paquete. `draw` = el paquete trae sorteo (fase `drawn`). */
  needs?: "draw" | "two-ballots" | "room";
  /** Nota honesta que se muestra junto al resultado. */
  note?: string;
};

export const ALTERATIONS: readonly AlterationSpec[] = [
  {
    id: "ballot-message",
    title: "Cambiar el voto de una boleta",
    body: "Cambia la opción (message) de la boleta #0 a otra opción. El atacante rehace la cadena, el recuento y los checksums para que todo lo demás cuadre.",
    expect: { none: ["proofs_valid"], anchored: ["proofs_valid", "anchor_matches"] },
    note: "La prueba Semaphore firma la opción: al cambiarla, la prueba deja de verificar aunque se rehaga todo lo demás.",
  },
  {
    id: "ledger-reorder",
    title: "Reordenar el registro",
    body: "Intercambia las boletas #0 y #1 del ledger sin rehacer la cadena de hashes.",
    expect: { none: ["chain_integrity"], anchored: ["chain_integrity"] },
    needs: "two-ballots",
  },
  {
    id: "nullifier-dup",
    title: "Duplicar un voto (mismo nullifier)",
    body: "Copia la boleta #0 al final del ledger (misma prueba, mismo nullifier). El atacante rehace la cadena, el recuento y los checksums.",
    expect: { none: ["nullifiers_unique"], anchored: ["nullifiers_unique", "anchor_matches"] },
  },
  {
    id: "tally-inflate",
    title: "Inflar el resultado",
    body: "Suma 1 voto a la primera opción y al total publicado, y recalcula tallyHash y checksums.tally.",
    expect: { none: ["tally_matches"], anchored: ["tally_matches", "anchor_matches"] },
  },
  {
    id: "group-root",
    title: "Cambiar la raíz del padrón",
    body: "Reemplaza groupRoot por la raíz de un padrón con una credencial extra, sin tocar la lista de commitments.",
    expect: { none: ["group_root"], anchored: ["group_root", "anchor_matches"] },
  },
  {
    id: "roll-insert",
    title: "Colar a alguien en el padrón",
    body: "Añade un commitment ficticio a la lista del padrón (y recalcula checksums.commitments) sin cambiar groupRoot.",
    expect: { none: ["group_root"], anchored: ["group_root"] },
  },
  {
    id: "final-hash",
    title: "Alterar el hash final",
    body: "Cambia el último carácter de finalHash, la huella que se ancla on-chain.",
    expect: { none: ["chain_integrity"], anchored: ["chain_integrity", "anchor_matches"] },
  },
  {
    id: "draw-seed",
    title: "Cambiar la semilla del sorteo",
    body: "Reemplaza la semilla publicada del sorteo por otra.",
    expect: { none: ["draw_matches"], anchored: ["draw_matches"] },
    needs: "draw",
  },
  {
    id: "draw-winner",
    title: "Cambiar un ganador del sorteo",
    body: "Sustituye el primer ganador publicado por un candidato que no salió en el sorteo.",
    expect: { none: ["draw_matches"], anchored: ["draw_matches"] },
    needs: "draw",
  },
  {
    id: "drop-raw",
    title: "Borrar una boleta",
    body: "Elimina la boleta #0 del ledger sin rehacer nada más.",
    expect: { none: ["chain_integrity", "tally_matches"], anchored: ["chain_integrity", "tally_matches"] },
  },
  {
    id: "drop-rechain",
    title: "Quitar un voto y rehacer todo",
    body: "Elimina la boleta #0 y rehace la cadena, el recuento, el finalHash, el sorteo (si lo hay) y todos los checksums: un paquete nuevo coherente.",
    expect: { none: [], anchored: ["anchor_matches"] },
    note: "Sin ancla esto NO se detecta: el paquete rehecho es coherente por dentro. Solo lo delata el ancla on-chain (o el votante cuyo recibo ya no aparece).",
  },
  {
    id: "ledger-extra-field",
    title: "Esconder un dato en una boleta",
    body: "Añade un campo no declarado (voterId) a la boleta #0 y rehace checksums.ledger: un dato que ligaría persona ↔ boleta escondido dentro del paquete.",
    expect: { none: ["package_schema"], anchored: ["package_schema"] },
    note: "El esquema del paquete es estricto: cualquier campo no declarado es fallo detectado, aunque se rehagan los checksums.",
  },
  {
    id: "room-hide",
    title: "Ocultar que el censo fue una sala abierta",
    body: "Borra rollPolicy (la declaración de «censo abierto en sala») del paquete.",
    expect: { none: [], anchored: [] },
    needs: "room",
    note: "No se detecta: rollPolicy está fuera de manifestHash y de los checksums (la sala se abre después de publicar). Por eso el verificador la lista como garantía NO soportada en vez de comprobarla.",
  },
];

export const alterationById = (id: string): AlterationSpec | undefined => ALTERATIONS.find((a) => a.id === id);

export function expectedFor(spec: AlterationSpec, anchor: AnchorMode): string[] {
  return anchor === "none" ? spec.expect.none : spec.expect.anchored;
}

/** Nombres legibles (es-VE) de los checks conocidos. Un check desconocido se muestra por su nombre técnico. */
export const CHECK_LABELS: Record<string, string> = {
  package_schema: "Formato del paquete",
  manifest_hash: "Hash del manifiesto",
  group_root: "Raíz del padrón",
  commitments_unique: "Padrón sin duplicados",
  chain_integrity: "Cadena del registro",
  proofs_valid: "Pruebas de pertenencia",
  nullifiers_unique: "Un voto por credencial",
  tally_matches: "Recuento reproducido",
  anchor_matches: "Ancla on-chain",
  draw_matches: "Sorteo recomputado",
};

export const checkLabel = (name: string): string => CHECK_LABELS[name] ?? name;
