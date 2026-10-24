"use client";

/**
 * Carga y compila los modelos de la cámara en segundo plano mientras la persona escribe su nombre (paso 1).
 * En iPhone la primera detección compila los shaders de la GPU (~25 s medidos en un iPhone real): hacerlo aquí deja la
 * cámara lista al llegar al paso 2. Se monta con `dynamic(..., { ssr: false })` porque Human solo existe en el navegador.
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
