import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * tailwind-merge necesita conocer nuestra escala tipográfica (text-display/title/heading/body/small)
 * para no confundirla con colores (`text-primary-foreground`) y descartar clases válidas.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["display", "title", "heading", "body", "small"] }],
      "min-h": [{ "min-h": ["tap"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
