import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { E2E, MockV1, type Phase } from "./mocks/v1";

/**
 * Capturas del flujo simple del votante a 360×740 con datos FIXTURE (mocks del contrato v1).
 *   PORT=3341 SCREENSHOTS=1 pnpm --filter @quorum/web exec playwright test e2e/screenshots.flujo-simple.spec.ts --project=chromium
 * Salida: docs/screenshots/phase2/flujo-simple-*.png
 * La cámara usa el dispositivo FALSO de Chromium (patrón de prueba, sin rostro): se ve la guía "Mira a la cámara".
 */
const OUT = path.resolve(__dirname, "../../../docs/screenshots/phase2");
const CODE = "K7M3QP";

test.skip(!process.env.SCREENSHOTS, "capturas sólo con SCREENSHOTS=1");
test.beforeEach(({}, info) => test.skip(info.project.name !== "chromium", "capturas sólo en chromium"));
test.use({
  viewport: { width: 360, height: 740 },
  launchOptions: { args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"] },
});

async function shot(page: Page, name: string, fullPage = false) {
  await page.evaluate(() => document.fonts?.ready);
  await page.screenshot({ path: path.join(OUT, `flujo-simple-${name}-360.png`), fullPage, animations: "disabled" });
}

async function at(page: Page, phase: Phase, setup?: (m: MockV1) => void) {
  const mock = new MockV1(phase);
  mock.room = { code: CODE, open: true, seatsTaken: 27, maxSeats: 60, expiresAt: new Date(Date.now() + 9 * 60_000 + 30_000).toISOString(), closedReason: null };
  setup?.(mock);
  await mock.install(page);
  return mock;
}

test("paso 1 (sala y enlace) y Más detalles", async ({ page }) => {
  await at(page, "registration");
  await page.goto(`/j/${CODE}`);
  await page.getByLabel("Tu nombre o apodo").fill("Vecina del 4B");
  await shot(page, "01-paso1-sala");
  await page.getByText("Más detalles").click();
  await shot(page, "02-paso1-mas-detalles", true);
  await page.goto(`/v/${E2E.token}`);
  await expect(page.getByRole("button", { name: "Continuar" })).toBeVisible();
  await shot(page, "03-paso1-enlace");
});

test("paso 2: cámara a pantalla completa con guía", async ({ page }) => {
  test.setTimeout(120_000);
  await at(page, "registration");
  await page.addInitScript(() => sessionStorage.setItem("quorum.e2e.realFace", "1"));
  await page.goto(`/v/${E2E.token}`);
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByTestId("face-instruction")).toHaveText(/Mira a la cámara/, { timeout: 90_000 });
  await page.waitForTimeout(500);
  await shot(page, "04-paso2-rostro");
});

test("error: sin permiso de cámara", async ({ page }) => {
  await at(page, "registration");
  await page.addInitScript(() => {
    sessionStorage.setItem("quorum.e2e.realFace", "1");
    Object.defineProperty(navigator, "mediaDevices", { value: { getUserMedia: () => Promise.reject(new DOMException("denegado", "NotAllowedError")) } });
  });
  await page.goto(`/v/${E2E.token}`);
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByTestId("face-error")).toBeVisible({ timeout: 60_000 });
  await shot(page, "05-error-camara");
});

test("error: rostro duplicado", async ({ page }) => {
  await at(page, "registration", (m) => (m.faceDuplicate = true));
  await page.goto(`/v/${E2E.token}`);
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByTestId("face-error")).toContainText("ya está inscrito");
  await shot(page, "06-error-duplicado");
});

test("vinculando → listo → boleta → enviando → comprobante", async ({ page }) => {
  test.setTimeout(120_000);
  const mock = await at(page, "registration", (m) => (m.delays = { wallet: 4000, vote: 4000 }));
  await page.goto(`/v/${E2E.token}`);
  await page.getByRole("button", { name: "Continuar" }).click();
  await expect(page.getByTestId("linking")).toBeVisible();
  await page.waitForTimeout(300);
  await shot(page, "07-vinculando");
  await expect(page.getByRole("heading", { name: "¡Listo! Ya estás inscrito." })).toBeVisible({ timeout: 30_000 });
  await shot(page, "08-listo");
  await page.getByText("Detalles técnicos").click();
  await shot(page, "09-listo-detalles-tecnicos", true);
  mock.phase = "open";
  await page.getByRole("radio", { name: /3$/ }).click({ timeout: 15_000 });
  await shot(page, "10-boleta");
  await page.getByRole("button", { name: "Votar: 3" }).click();
  await expect(page.getByTestId("send-status")).toBeVisible();
  await expect(page.getByTestId("send-status")).toHaveText(/Enviando/, { timeout: 60_000 });
  await shot(page, "11-enviando");
  await expect(page.getByRole("heading", { name: "Tu voto fue contado" })).toBeVisible({ timeout: 60_000 });
  await shot(page, "12-comprobante");
  await page.getByText("Detalles técnicos").click();
  await shot(page, "13-comprobante-detalles-tecnicos", true);
});

test("votación terminada → resultados", async ({ page }) => {
  await at(page, "auditable");
  await page.goto(`/v/${E2E.token}`);
  await expect(page.getByText("La votación terminó")).toBeVisible();
  await shot(page, "14-terminada");
});
