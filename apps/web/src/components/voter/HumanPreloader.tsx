"use client";

/**
 * Descarga, inicia y calienta los modelos de la cámara en segundo plano mientras la persona está en el paso 1
 * (la descarga es la misma que arranca `prefetchHeavyAssets`; no se duplica). Así la cámara del paso 2 detecta al
 * instante. Con WASM (por defecto) iniciar y calentar cuesta décimas de segundo; con `?fb=humangl` compila shaders. Se monta con `dynamic(..., { ssr: false })` porque Human solo existe en el navegador.
 */
import { useEffect } from "react";
import { clientLog, loadHuman } from "@/lib/client/human";

export default function HumanPreloader() {
  useEffect(() => {
    const t0 = performance.now();
    loadHuman()
      .then(() => clientLog("human:preloaded", { ms: Math.round(performance.now() - t0) }))
      .catch(() => undefined);
  }, []);
  return null;
}
