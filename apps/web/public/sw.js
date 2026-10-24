/*
 * Service worker de Quórum — SOLO cachea lo pesado y estático: modelos de Human (/models/*), WASM de TF.js (/tfjs/*) y
 * artefactos Groth16 (/zk/*). Cache-first: con 60 teléfonos en el mismo wifi cada uno los baja una vez.
 * No toca HTML, API ni datos de votación.
 * Si un archivo de /zk, /models o /tfjs cambia de contenido, sube CACHE (p. ej. -v3) y se descarta la copia vieja.
 * v2: modelos nuevos (insightface uint8, sin facemesh ni faceres) servidos con gzip + WASM.
 */
const CACHE = "quorum-heavy-v2";
const HEAVY = /^\/(zk|models|tfjs)\//;
/** Descargas en curso por ruta: si la página y Human piden el mismo archivo a la vez, viaja UNA sola vez por la red. */
const inflight = new Map();

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
  const key = url.pathname;
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(key);
      if (hit) return hit;
      const pending = inflight.get(key);
      if (pending) {
        await pending.catch(() => undefined);
        const again = await cache.match(key);
        if (again) return again;
        return fetch(req);
      }
      const res = await fetch(req);
      if (res.ok && res.status === 200) {
        // Se guarda en paralelo: la página recibe los bytes a medida que llegan (barra de progreso real).
        const stored = cache.put(key, res.clone()).finally(() => inflight.delete(key));
        inflight.set(key, stored);
        event.waitUntil(stored.catch(() => undefined));
      }
      return res;
    })(),
  );
});
