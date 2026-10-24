/*
 * Service worker de Quórum — SOLO cachea lo pesado y estático: modelos de Human (/models/*) y artefactos Groth16 (/zk/*).
 * Cache-first: con 60 teléfonos en el mismo wifi cada uno los baja una vez. No toca HTML, API ni datos de votación.
 * Si un archivo de /zk o /models cambia de contenido, sube CACHE (p. ej. -v2) y se descarta la copia vieja.
 */
const CACHE = "quorum-heavy-v1";
const HEAVY = /^\/(zk|models)\//;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const k of await caches.keys()) if (k.startsWith("quorum-heavy-") && k !== CACHE) await caches.delete(k);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin || !HEAVY.test(url.pathname)) return;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(url.pathname);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok && res.status === 200) await cache.put(url.pathname, res.clone());
      return res;
    })(),
  );
});
