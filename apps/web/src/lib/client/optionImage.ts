/**
 * Foto de una opción de la boleta: se elige de la galería o la cámara, se recorta al centro en cuadrado y se comprime en
 * el teléfono (nunca se sube el original). Resultado: data URI JPEG de `OPTION_IMAGE_PX` px, cabe en `OptionImage`
 * (≤ 40 000 caracteres). Sin red: todo pasa en el navegador.
 */
export const OPTION_IMAGE_PX = 192;
export const OPTION_IMAGE_MAX_CHARS = 40_000;

export class OptionImageError extends Error {}

function loadImage(file: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new OptionImageError("No se pudo leer la imagen. Prueba con otra foto (JPG o PNG)."));
    };
    img.src = url;
  });
}

/** Recorta al centro (cuadrado), escala a `px` y codifica JPEG bajando la calidad hasta caber en `maxChars`. */
export async function compressOptionImage(file: Blob, opts: { px?: number; maxChars?: number } = {}): Promise<string> {
  const px = opts.px ?? OPTION_IMAGE_PX;
  const maxChars = opts.maxChars ?? OPTION_IMAGE_MAX_CHARS;
  if (!file.type.startsWith("image/")) throw new OptionImageError("Elige una imagen (JPG, PNG o WebP).");
  const img = await loadImage(file);
  const side = Math.min(img.naturalWidth, img.naturalHeight);
  if (!side) throw new OptionImageError("La imagen está vacía.");
  const sx = (img.naturalWidth - side) / 2;
  const sy = (img.naturalHeight - side) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new OptionImageError("Este navegador no puede procesar la imagen.");
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, sx, sy, side, side, 0, 0, px, px);
  for (const q of [0.82, 0.7, 0.58, 0.45, 0.32]) {
    const out = canvas.toDataURL("image/jpeg", q);
    if (out.length <= maxChars) return out;
  }
  throw new OptionImageError("La foto no se pudo comprimir lo suficiente. Prueba con otra.");
}

/** Inicial para el avatar cuando la opción no tiene foto. */
export function optionInitial(label: string): string {
  const t = label.trim();
  return t ? t[0]!.toUpperCase() : "?";
}
