/**
 * "Compartir alteración" sin backend nuevo.
 *  1. Receta (cabe en un QR): `/audit?id=<elección>|fixture=1&alt=<alteración>&anc=<none|sim|real>&d=<huella>`.
 *     El teléfono descarga el MISMO original público, aplica la MISMA alteración determinista y comprueba que la huella
 *     SHA-256 de su copia coincide con `d` antes de verificarla él mismo.
 *  2. Enlace autónomo: el paquete alterado comprimido en el fragmento `#pkg=` (no viaja al servidor). Solo si cabe.
 */
import { alterationById, type AlterationId, type AnchorMode } from "./catalog";

export type ShareSource = { kind: "election"; id: string } | { kind: "fixture" };
export type ShareRecipe = { source: ShareSource; alteration: AlterationId; anchor: AnchorMode; digest: string };

/** Límite práctico para el enlace autónomo (los navegadores aceptan más, pero se vuelve inmanejable). */
export const MAX_EMBED_CHARS = 60_000;

export function recipeQuery(r: ShareRecipe): string {
  const q = new URLSearchParams();
  if (r.source.kind === "election") q.set("id", r.source.id);
  else q.set("fixture", "1");
  q.set("alt", r.alteration);
  q.set("anc", r.anchor);
  q.set("d", r.digest.replace(/^sha256:/, "").slice(0, 16));
  return q.toString();
}

export function recipeUrl(origin: string, r: ShareRecipe): string {
  return `${origin}/audit?${recipeQuery(r)}`;
}

export function parseRecipe(params: URLSearchParams): ShareRecipe | null {
  const alt = params.get("alt");
  if (!alt || !alterationById(alt)) return null;
  const id = params.get("id")?.trim();
  const source: ShareSource | null = id ? { kind: "election", id } : params.get("fixture") === "1" ? { kind: "fixture" } : null;
  if (!source) return null;
  const anc = params.get("anc");
  const anchor: AnchorMode = anc === "sim" || anc === "real" ? anc : "none";
  const digest = (params.get("d") ?? "").toLowerCase();
  if (!/^[0-9a-f]{8,64}$/.test(digest)) return null;
  return { source, alteration: alt as AlterationId, anchor, digest };
}

/** ¿La huella completa `sha256:<hex>` coincide con el prefijo de la receta? */
export const digestMatches = (full: string, prefix: string): boolean => full.replace(/^sha256:/, "").toLowerCase().startsWith(prefix.toLowerCase());

// ---------- enlace autónomo (#pkg=) ----------
function toB64Url(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64Url(s: string): Uint8Array {
  const b = atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}
async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

/** Comprime los bytes del paquete (deflate-raw) y los codifica en base64url. */
export async function encodeEmbedded(bytes: Uint8Array): Promise<string> {
  return toB64Url(await pipe(bytes, new CompressionStream("deflate-raw")));
}

export async function decodeEmbedded(fragment: string): Promise<Uint8Array> {
  return pipe(fromB64Url(fragment), new DecompressionStream("deflate-raw"));
}

/** Extrae `pkg` y `anc` del fragmento `#pkg=…&anc=…`. */
export function parseFragment(hash: string): { pkg: string; anchor: AnchorMode; alteration: AlterationId | null } | null {
  const h = new URLSearchParams(hash.replace(/^#/, ""));
  const pkg = h.get("pkg");
  if (!pkg) return null;
  const alt = h.get("alt");
  return { pkg, anchor: h.get("anc") === "real" ? "real" : "none", alteration: alt && alterationById(alt) ? (alt as AlterationId) : null };
}

export async function embeddedUrl(origin: string, bytes: Uint8Array, alteration: AlterationId): Promise<string | null> {
  const enc = await encodeEmbedded(bytes);
  if (enc.length > MAX_EMBED_CHARS) return null;
  return `${origin}/audit#alt=${alteration}&pkg=${enc}`;
}
