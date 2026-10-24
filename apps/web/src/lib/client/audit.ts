/**
 * Utilidades del auditor y del laboratorio de ataques.
 * Las alteraciones operan SIEMPRE sobre una copia profunda del paquete en memoria; el original no se toca.
 */
export type Alteration = "tampered-total" | "missing-artifact" | "wrong-manifest";

export const alterationLabel: Record<Alteration, { title: string; body: string }> = {
  "tampered-total": { title: "Total alterado", body: "Suma 1 al primer conteo o total numérico del resultado publicado." },
  "missing-artifact": { title: "Artefacto ausente", body: "Elimina del paquete el primer artefacto de evidencia (boletas, compromisos, pruebas)." },
  "wrong-manifest": { title: "Manifiesto incorrecto", body: "Cambia el hash o el contenido del manifiesto para que no coincida con lo publicado." },
};

export function deepClone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** Busca la primera ruta cuya clave coincida con `keyRe` y cuyo valor satisfaga `pred` (DFS). */
function findPath(root: unknown, keyRe: RegExp, pred: (v: unknown) => boolean, path: string[] = []): string[] | null {
  if (Array.isArray(root)) {
    for (let i = 0; i < root.length; i++) {
      const r = findPath(root[i], keyRe, pred, [...path, String(i)]);
      if (r) return r;
    }
    return null;
  }
  if (!isObj(root)) return null;
  for (const [k, v] of Object.entries(root)) {
    if (keyRe.test(k) && pred(v)) return [...path, k];
  }
  for (const [k, v] of Object.entries(root)) {
    const r = findPath(v, keyRe, pred, [...path, k]);
    if (r) return r;
  }
  return null;
}

function getAt(root: unknown, path: string[]): unknown {
  return path.reduce<unknown>((acc, k) => (acc && typeof acc === "object" ? (acc as Obj)[k] : undefined), root);
}
function setAt(root: unknown, path: string[], value: unknown) {
  const parent = getAt(root, path.slice(0, -1)) as Obj;
  parent[path[path.length - 1]] = value;
}
function deleteAt(root: unknown, path: string[]) {
  const parent = getAt(root, path.slice(0, -1));
  const key = path[path.length - 1];
  if (Array.isArray(parent)) parent.splice(Number(key), 1);
  else if (isObj(parent)) delete parent[key];
}

export type AlterationReport = { alteration: Alteration; path: string; before: unknown; after: unknown };

/** Aplica la alteración a una COPIA y devuelve copia + reporte de qué cambió. */
export function applyAlteration(original: unknown, alteration: Alteration): { altered: unknown; report: AlterationReport } {
  const copy = deepClone(original);
  switch (alteration) {
    case "tampered-total": {
      const path =
        findPath(copy, /^(count|total|totalVotes|votes|tally|counts)$/i, (v) => typeof v === "number") ??
        findPath(copy, /count|total|votes|tally/i, (v) => typeof v === "number") ??
        findPath(copy, /counts|tally|result/i, isObj);
      if (path) {
        const cur = getAt(copy, path);
        if (typeof cur === "number") {
          setAt(copy, path, cur + 1);
          return { altered: copy, report: { alteration, path: path.join("."), before: cur, after: cur + 1 } };
        }
        if (isObj(cur)) {
          const numKey = Object.keys(cur).find((k) => typeof cur[k] === "number");
          if (numKey) {
            const before = cur[numKey] as number;
            cur[numKey] = before + 1;
            return { altered: copy, report: { alteration, path: [...path, numKey].join("."), before, after: before + 1 } };
          }
        }
      }
      (copy as Obj).result = { ...(isObj((copy as Obj).result) ? ((copy as Obj).result as Obj) : {}), tamperedTotal: 1 };
      return { altered: copy, report: { alteration, path: "result.tamperedTotal", before: undefined, after: 1 } };
    }
    case "missing-artifact": {
      const path = findPath(copy, /ballot|commitment|proof|artifact|votes|tally|result/i, (v) => v !== undefined);
      if (path) {
        const before = getAt(copy, path);
        deleteAt(copy, path);
        return { altered: copy, report: { alteration, path: path.join("."), before: summarize(before), after: undefined } };
      }
      const keys = Object.keys(isObj(copy) ? copy : {});
      const k = keys[Math.min(1, keys.length - 1)];
      if (k) {
        const before = (copy as Obj)[k];
        delete (copy as Obj)[k];
        return { altered: copy, report: { alteration, path: k, before: summarize(before), after: undefined } };
      }
      return { altered: copy, report: { alteration, path: "(paquete vacío)", before: undefined, after: undefined } };
    }
    case "wrong-manifest": {
      const hashPath = findPath(copy, /manifest.*hash|hash.*manifest|^manifestHash$/i, (v) => typeof v === "string");
      if (hashPath) {
        const before = getAt(copy, hashPath) as string;
        const after = before.length > 1 ? before.slice(0, -1) + (before.endsWith("0") ? "1" : "0") : "0x00";
        setAt(copy, hashPath, after);
        return { altered: copy, report: { alteration, path: hashPath.join("."), before, after } };
      }
      const manPath = findPath(copy, /manifest/i, isObj);
      if (manPath) {
        const man = getAt(copy, manPath) as Obj;
        const key = Object.keys(man).find((k) => typeof man[k] === "string") ?? "title";
        const before = man[key];
        man[key] = `${String(before ?? "")} (alterado)`;
        return { altered: copy, report: { alteration, path: [...manPath, key].join("."), before, after: man[key] } };
      }
      (copy as Obj).manifestHash = "0x0000000000000000000000000000000000000000000000000000000000000000";
      return { altered: copy, report: { alteration, path: "manifestHash", before: undefined, after: (copy as Obj).manifestHash } };
    }
  }
}

function summarize(v: unknown): unknown {
  if (Array.isArray(v)) return `[array de ${v.length}]`;
  if (isObj(v)) return `{objeto con ${Object.keys(v).length} claves}`;
  return v;
}

/** Hash SHA-256 (hex) del JSON canónico-ish del paquete, para mostrar al usuario qué entrada verificó. */
export async function sha256Hex(data: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(data));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `0x${Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("")}`;
}
