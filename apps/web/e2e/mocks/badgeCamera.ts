import QRCode from "qrcode";
import type { Page } from "@playwright/test";

/**
 * Cámara simulada para la credencial (D-19): `getUserMedia` devuelve un `<canvas>.captureStream()` que dibuja el QR
 * (cambiable con `window.__setQr(dataUrl)`). El lector real del producto (BarcodeDetector nativo o jsqr) lo decodifica
 * como un cuadro de cámara. Con `noNative` se quita `BarcodeDetector` para forzar jsqr.
 */
export async function qrDataUrl(text: string) {
  return QRCode.toDataURL(text, { errorCorrectionLevel: "M", margin: 4, width: 360 });
}

/** Sustituye getUserMedia por un canvas con el QR (cambiable con window.__setQr) y, si `noNative`, quita BarcodeDetector. */
export async function fakeCamera(page: Page, firstQr: string, noNative = false) {
  await page.addInitScript(
    ([url, noNat]) => {
      const w = window as unknown as { __qr: string; __setQr: (u: string) => void; BarcodeDetector?: unknown };
      if (noNat) delete w.BarcodeDetector;
      w.__qr = url as string;
      w.__setQr = (u: string) => (w.__qr = u);
      const getUserMedia = async () => {
        const cv = document.createElement("canvas");
        cv.width = 640;
        cv.height = 480;
        const ctx = cv.getContext("2d")!;
        const img = new Image();
        let shown = "";
        const draw = async () => {
          if (shown !== w.__qr) {
            shown = w.__qr;
            img.src = shown;
            await img.decode().catch(() => undefined);
          }
          ctx.fillStyle = "#6b7280";
          ctx.fillRect(0, 0, 640, 480);
          ctx.drawImage(img, 170, 90, 300, 300);
        };
        await draw();
        window.setInterval(() => void draw(), 100);
        return cv.captureStream(15);
      };
      Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia, enumerateDevices: async () => [] }, configurable: true });
    },
    [firstQr, noNative] as const,
  );
}

