"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";

type Theme = "light" | "dark";
const KEY = "quorum.theme";

function subscribe(cb: () => void) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", cb);
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => {
    mq.removeEventListener("change", cb);
    obs.disconnect();
  };
}
function getSnapshot() {
  const attr = document.documentElement.getAttribute("data-theme");
  if (attr === "dark") return true;
  if (attr === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}
const getServerSnapshot = () => false;

export function ThemeToggle() {
  const isDark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Aplica la preferencia guardada al DOM (el observer actualiza el estado).
  useEffect(() => {
    try {
      const s = localStorage.getItem(KEY);
      if (s === "light" || s === "dark") document.documentElement.setAttribute("data-theme", s);
    } catch {
      /* ignorar */
    }
  }, []);

  function toggle() {
    const next: Theme = isDark ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try {
      localStorage.setItem(KEY, next);
    } catch {
      /* ignorar */
    }
  }
  return (
    <button type="button" onClick={toggle} className="inline-flex size-tap cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground" aria-label={isDark ? "Cambiar a tema claro" : "Cambiar a tema oscuro"} aria-pressed={isDark}>
      {isDark ? <Sun className="size-5" aria-hidden="true" /> : <Moon className="size-5" aria-hidden="true" />}
    </button>
  );
}
