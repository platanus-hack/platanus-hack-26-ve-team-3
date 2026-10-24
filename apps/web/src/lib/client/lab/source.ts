/** Descarga del paquete ORIGINAL como bytes (la huella de entrada es la de lo que llegó, antes de parsear). */
import { fetchAuditPackageBytes } from "@/lib/client/apiV1";
import { FIXTURE_PACKAGE_URL } from "@/lib/client/fixtures";
import type { ShareSource } from "./share";

export type LoadedBytes = { bytes: Uint8Array; label: string; isFixture: boolean; source: ShareSource | null };

export async function loadSource(src: ShareSource): Promise<LoadedBytes> {
  if (src.kind === "election") {
    const { bytes } = await fetchAuditPackageBytes(src.id);
    return { bytes, label: `Paquete publicado de la elección ${src.id}`, isFixture: false, source: src };
  }
  const res = await fetch(FIXTURE_PACKAGE_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`HTTP ${res.status} al descargar el paquete fixture`);
  return { bytes: new Uint8Array(await res.arrayBuffer()), label: "Paquete de ejemplo (fixture, 3 boletas con pruebas reales)", isFixture: true, source: src };
}

/** Descarga desde una URL arbitraria que pegó el auditor (p. ej. https://…/api/elections/:id/artifacts). */
export async function loadUrl(url: string): Promise<LoadedBytes> {
  let u: URL;
  try {
    u = new URL(url, window.location.origin);
  } catch {
    throw new Error("La URL no es válida.");
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("Solo se admiten URLs http(s).");
  const res = await fetch(u.toString(), { cache: "no-store", headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status} al descargar ${u.pathname}`);
  const m = u.pathname.match(/\/api\/elections\/([^/]+)\/artifacts\/?$/);
  const sameOrigin = u.origin === window.location.origin;
  return {
    bytes: new Uint8Array(await res.arrayBuffer()),
    label: `Descargado de ${u.host}${u.pathname}`,
    isFixture: false,
    source: m && sameOrigin ? { kind: "election", id: decodeURIComponent(m[1]) } : null,
  };
}

export function parseJsonBytes(bytes: Uint8Array): unknown {
  return JSON.parse(new TextDecoder().decode(bytes));
}
